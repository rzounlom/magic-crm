import { type PrismaClient } from "@/generated/prisma/client";

import { resolveOrganizationTimeZone } from "@/lib/inquiries/tenant-datetime";
import { BookingError } from "@/server/errors";
import { requirePermission } from "@/server/policies/require-permission";
import type { RequestContext } from "@/server/request-context";
import { lockLocationForScheduling } from "@/server/resources/location-exclusivity";
import { recordAuditEvent } from "@/server/services/audit";
import { confirmPendingBooking, listPendingBookingsForDay } from "@/server/services/pending-booking-service";
import { BOOKING_LIST_FILTERS, BOOKING_STATUSES, isCancellableBooking } from "@/types/booking";
import { INQUIRY_SALES_STAGES } from "@/types/inquiry";
import { PERMISSIONS } from "@/types/permissions";
import { RESOURCE_RESERVATION_STATUSES } from "@/types/resource-schedule";

type BookingDb = PrismaClient;

function isoDate(value: Date | string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  if (typeof value === "string") {
    return value.slice(0, 10);
  }
  return value.toISOString().slice(0, 10);
}

function tenantDateStamp(timeZone: string | null | undefined, now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: resolveOrganizationTimeZone(timeZone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function shiftDate(value: string, days: number): string {
  const [year, month, day] = value.split("-").map(Number);
  const next = new Date(Date.UTC(year ?? 2026, (month ?? 1) - 1, (day ?? 1) + days));
  return next.toISOString().slice(0, 10);
}

/**
 * Canonical employee confirmation. Future Stripe webhooks must call confirmPendingBooking
 * directly — do not add a Stripe-specific allocation pathway.
 */
export async function confirmHeldBooking(
  ctx: RequestContext,
  database: BookingDb,
  inquiryId: string,
  _expectedUpdatedAt?: string | null,
) {
  void _expectedUpdatedAt;
  return confirmInquiryBooking(ctx, database, inquiryId);
}

export async function confirmInquiryBooking(
  ctx: RequestContext,
  database: BookingDb,
  inquiryId: string,
  _expectedUpdatedAt?: string | null,
) {
  void _expectedUpdatedAt;
  await requirePermission(ctx, PERMISSIONS.EVENTS_CONFIRM, database);
  await requirePermission(ctx, PERMISSIONS.CRM_INQUIRIES_MANAGE, database);
  return confirmPendingBooking(database, {
    organizationId: ctx.organizationId,
    inquiryId,
    actorUserProfileId: ctx.userId,
    attestExternalPayment: true,
  });
}

/**
 * Cancel pending or confirmed bookings. Sets releasedAt on every unreleased
 * reservation for this booking (and leftover HOLDs on the inquiry) so occupancy
 * disappears from the Master Schedule. Rows are kept for audit.
 */
export async function cancelBooking(
  ctx: RequestContext,
  database: BookingDb,
  input: { bookingId?: string | null; inquiryId?: string | null },
) {
  await requirePermission(ctx, PERMISSIONS.EVENTS_CANCEL, database);
  const bookingId = input.bookingId?.trim() || null;
  const inquiryId = input.inquiryId?.trim() || null;
  if (!bookingId && !inquiryId) {
    throw new BookingError("BOOKING_NOT_FOUND");
  }
  const existing = await database.booking.findFirst({
    where: bookingId
      ? { organizationId: ctx.organizationId, id: bookingId }
      : { organizationId: ctx.organizationId, inquiryId: inquiryId! },
    include: { inquiry: { select: { id: true, status: true, salesStage: true } } },
  });
  if (!existing) {
    throw new BookingError("BOOKING_NOT_FOUND");
  }
  if (existing.status === BOOKING_STATUSES.CANCELLED) {
    return { booking: existing, alreadyCancelled: true, releasedCount: 0 };
  }
  if (!isCancellableBooking(existing.status)) {
    throw new BookingError(
      "BOOKING_NOT_CANCELLABLE",
      existing.status === BOOKING_STATUSES.COMPLETED
        ? "Completed bookings cannot be cancelled."
        : "This booking cannot be cancelled.",
    );
  }

  const now = new Date();
  const result = await database.$transaction(async (tx) => {
    await lockLocationForScheduling(tx, ctx.organizationId, existing.locationId);
    const current = await tx.booking.findFirst({
      where: { id: existing.id, organizationId: ctx.organizationId },
    });
    if (!current) {
      throw new BookingError("BOOKING_NOT_FOUND");
    }
    if (current.status === BOOKING_STATUSES.CANCELLED) {
      return { booking: current, alreadyCancelled: true, releasedCount: 0 };
    }
    if (!isCancellableBooking(current.status)) {
      throw new BookingError("BOOKING_NOT_CANCELLABLE");
    }
    const bookingReservations = await tx.resourceReservation.findMany({
      where: {
        organizationId: ctx.organizationId,
        bookingId: current.id,
        releasedAt: null,
      },
      select: { id: true },
    });
    const leftoverHolds = await tx.resourceReservation.findMany({
      where: {
        organizationId: ctx.organizationId,
        inquiryId: current.inquiryId,
        bookingId: null,
        status: RESOURCE_RESERVATION_STATUSES.HOLD,
        releasedAt: null,
      },
      select: { id: true },
    });
    const releaseIds = [...new Set([...bookingReservations, ...leftoverHolds].map((row) => row.id))];
    if (releaseIds.length > 0) {
      await tx.resourceReservation.updateMany({
        where: { id: { in: releaseIds }, organizationId: ctx.organizationId, releasedAt: null },
        data: { releasedAt: now },
      });
    }
    const booking = await tx.booking.update({
      where: { id: current.id },
      data: {
        status: BOOKING_STATUSES.CANCELLED,
        cancelledAt: now,
        cancelledByUserProfileId: ctx.userId,
        availabilityConflictAt: null,
      },
    });
    await tx.inquiry.update({
      where: { id: current.inquiryId },
      data: { salesStage: INQUIRY_SALES_STAGES.CLOSED },
    });
    await recordAuditEvent(tx, {
      organizationId: ctx.organizationId,
      actorUserProfileId: ctx.userId,
      action: "booking.cancelled",
      resourceType: "booking",
      resourceId: booking.id,
      metadata: {
        inquiryId: booking.inquiryId,
        bookingNumber: booking.bookingNumber,
        previousStatus: current.status,
        releasedCount: releaseIds.length,
      },
    });
    if (releaseIds.length > 0) {
      await recordAuditEvent(tx, {
        organizationId: ctx.organizationId,
        actorUserProfileId: ctx.userId,
        action: "resource_reservations.released_for_cancellation",
        resourceType: "booking",
        resourceId: booking.id,
        metadata: { inquiryId: booking.inquiryId, releasedCount: releaseIds.length },
      });
    }
    return { booking, alreadyCancelled: false, releasedCount: releaseIds.length };
  });
  return result;
}

export async function getBookingDetail(ctx: RequestContext, database: BookingDb, bookingId: string) {
  await requirePermission(ctx, PERMISSIONS.EVENTS_VIEW, database);
  return database.booking.findFirst({
    where: { id: bookingId, organizationId: ctx.organizationId },
    include: {
      confirmedBy: {
        select: { firstName: true, lastName: true, displayName: true, email: true },
      },
      cancelledBy: {
        select: { firstName: true, lastName: true, displayName: true, email: true },
      },
      lineItems: { orderBy: { sortOrder: "asc" } },
      reservations: {
        include: {
          resource: {
            select: {
              id: true,
              name: true,
              resourceType: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: [{ startMinute: "asc" }, { createdAt: "asc" }],
      },
      inquiry: {
        select: {
          id: true,
          selectedEventPlanId: true,
          agentWorkingPlanId: true,
          customerSelectedAt: true,
        },
      },
    },
  });
}

export async function listBookings(
  ctx: RequestContext,
  database: BookingDb,
  input: { filter?: string | null; search?: string | null } = {},
) {
  await requirePermission(ctx, PERMISSIONS.EVENTS_VIEW, database);
  const organization = await database.organization.findFirst({
    where: { id: ctx.organizationId },
    select: { timezone: true },
  });
  const today = tenantDateStamp(organization?.timezone);
  const weekEnd = shiftDate(today, 7);
  const filter = input.filter ?? BOOKING_LIST_FILTERS.UPCOMING;
  const search = input.search?.trim() || "";
  const todayStart = new Date(`${today}T00:00:00.000Z`);
  const weekEndStart = new Date(`${weekEnd}T00:00:00.000Z`);
  const filterWhere =
    filter === BOOKING_LIST_FILTERS.PENDING
      ? { status: BOOKING_STATUSES.PENDING_PAYMENT }
      : filter === BOOKING_LIST_FILTERS.PAST
        ? {
            OR: [
              {
                eventDate: { lt: todayStart },
                status: {
                  in: [BOOKING_STATUSES.CONFIRMED, BOOKING_STATUSES.COMPLETED, BOOKING_STATUSES.CANCELLED],
                },
              },
              { status: BOOKING_STATUSES.CANCELLED },
            ],
          }
        : filter === BOOKING_LIST_FILTERS.TODAY
          ? { status: BOOKING_STATUSES.CONFIRMED, eventDate: todayStart }
          : filter === BOOKING_LIST_FILTERS.WEEK
            ? {
                status: BOOKING_STATUSES.CONFIRMED,
                eventDate: { gte: todayStart, lt: weekEndStart },
              }
            : { status: BOOKING_STATUSES.CONFIRMED, eventDate: { gte: todayStart } };

  return database.booking.findMany({
    where: {
      organizationId: ctx.organizationId,
      ...filterWhere,
      ...(search
        ? {
            OR: [
              { bookingNumber: { contains: search, mode: "insensitive" } },
              { customerGroupName: { contains: search, mode: "insensitive" } },
              { customerEmail: { contains: search, mode: "insensitive" } },
              { customerFirstName: { contains: search, mode: "insensitive" } },
              { customerLastName: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    include: {
      confirmedBy: {
        select: { firstName: true, lastName: true, displayName: true, email: true },
      },
      reservations: {
        where: { releasedAt: null, status: RESOURCE_RESERVATION_STATUSES.BOOKED },
        include: {
          resource: {
            select: { name: true, resourceType: { select: { name: true } } },
          },
        },
      },
    },
    orderBy:
      filter === BOOKING_LIST_FILTERS.PENDING
        ? [{ createdAt: "desc" }, { id: "desc" }]
        : [{ eventDate: "asc" }, { startMinute: "asc" }],
    take: 100,
  });
}

export async function listPendingBookingsForSchedule(
  ctx: RequestContext,
  database: BookingDb,
  date: string,
) {
  await requirePermission(ctx, PERMISSIONS.CALENDAR_VIEW, database);
  const rows = await listPendingBookingsForDay(database, {
    organizationId: ctx.organizationId,
    date,
    locationId: ctx.locationId,
  });
  const planIds = rows
    .map((row) => row.selectedEventPlanId)
    .filter((id): id is string => Boolean(id));
  const plans =
    planIds.length > 0
      ? await database.eventPlanRecommendation.findMany({
          where: { organizationId: ctx.organizationId, id: { in: planIds } },
          select: { id: true, title: true },
        })
      : [];
  const titles = new Map(plans.map((row) => [row.id, row.title]));
  return rows.map((row) => ({
    ...row,
    planTitle: row.selectedEventPlanId ? titles.get(row.selectedEventPlanId) ?? null : null,
  }));
}

export { isoDate, listPendingBookingsForDay };
