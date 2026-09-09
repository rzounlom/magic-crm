import { Prisma, type PrismaClient } from "@/generated/prisma/client";

import { bookingConfirmationBlockers } from "@/lib/bookings/confirmation-blockers";
import { bookingNumberPrefix, formatBookingNumber } from "@/lib/bookings/booking-number";
import { holdCoverageErrors } from "@/lib/bookings/hold-coverage";
import { planPayloadTotal } from "@/lib/inquiries/plan-diff";
import { readEventPlanPayload } from "@/lib/event-planner/payload";
import { resolveOrganizationTimeZone } from "@/lib/inquiries/tenant-datetime";
import { BookingError, InquiryError } from "@/server/errors";
import { emitDomainEvent } from "@/server/domain-events/emit";
import { DOMAIN_EVENT_TYPES } from "@/server/domain-events/types";
import { requirePermission } from "@/server/policies/require-permission";
import type { RequestContext } from "@/server/request-context";
import { applyInventoryFeasibility } from "@/server/resources/feasibility";
import { applyRotationWindows } from "@/server/resources/rotation-windows";
import { localEventWindow, minutesToClock } from "@/server/resources/time-window";
import { recordAuditEvent } from "@/server/services/audit";
import {
  checkResourceAvailability,
  releaseExpiredHolds,
} from "@/server/services/resource-availability-service";
import { BOOKING_LINE_ITEM_KINDS, BOOKING_LIST_FILTERS, BOOKING_STATUSES } from "@/types/booking";
import { EVENT_PLAN_KINDS, INQUIRY_STATUSES } from "@/types/inquiry";
import { PERMISSIONS } from "@/types/permissions";
import {
  RESOURCE_RESERVATION_SOURCES,
  RESOURCE_RESERVATION_STATUSES,
} from "@/types/resource-schedule";

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

function tenantDateStamp(timeZone: string, now = new Date()): string {
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

function lineItemsFromPayload(payload: ReturnType<typeof readEventPlanPayload>) {
  const items: Array<{
    kind: string;
    knowledgeItemId: string | null;
    name: string;
    quantity: number;
    unitPriceCents: number;
    totalCents: number;
    startTime: string | null;
    endTime: string | null;
    sortOrder: number;
  }> = [];
  let sortOrder = 0;
  for (const activity of payload.activities) {
    items.push({
      kind: BOOKING_LINE_ITEM_KINDS.ACTIVITY,
      knowledgeItemId: activity.knowledgeItemId,
      name: activity.name,
      quantity: activity.quantity || 1,
      unitPriceCents: activity.priceCents,
      totalCents: activity.priceCents,
      startTime: activity.startTime ?? payload.startTime,
      endTime: activity.endTime ?? null,
      sortOrder,
    });
    sortOrder += 1;
  }
  if (payload.dining.label) {
    items.push({
      kind: BOOKING_LINE_ITEM_KINDS.DINING,
      knowledgeItemId: payload.dining.knowledgeItemId ?? null,
      name: payload.dining.label,
      quantity: payload.dining.quantity ?? payload.guestCount ?? 1,
      unitPriceCents: payload.dining.priceCents,
      totalCents: payload.dining.priceCents,
      startTime: payload.startTime,
      endTime: null,
      sortOrder,
    });
    sortOrder += 1;
  }
  for (const space of payload.spaces) {
    items.push({
      kind: BOOKING_LINE_ITEM_KINDS.SPACE,
      knowledgeItemId: space.knowledgeItemId,
      name: space.name,
      quantity: 1,
      unitPriceCents: space.priceCents,
      totalCents: space.priceCents,
      startTime: payload.startTime,
      endTime: null,
      sortOrder,
    });
    sortOrder += 1;
  }
  return items;
}

async function nextBookingNumber(
  database: Pick<PrismaClient, "organizationBookingSequence">,
  organizationId: string,
  slug: string,
  year: number,
) {
  const sequence = await database.organizationBookingSequence.upsert({
    where: { organizationId_year: { organizationId, year } },
    create: { organizationId, year, lastValue: 1 },
    update: { lastValue: { increment: 1 } },
  });
  return formatBookingNumber(bookingNumberPrefix(slug), year, sequence.lastValue);
}

export async function confirmInquiryBooking(
  ctx: RequestContext,
  database: BookingDb,
  inquiryId: string,
  expectedUpdatedAt?: string | null,
) {
  await requirePermission(ctx, PERMISSIONS.EVENTS_CONFIRM, database);
  await requirePermission(ctx, PERMISSIONS.CRM_INQUIRIES_MANAGE, database);

  const existing = await database.booking.findFirst({
    where: { organizationId: ctx.organizationId, inquiryId },
  });
  if (existing) {
    return { booking: existing, created: false };
  }

  const inquiry = await database.inquiry.findFirst({
    where: { id: inquiryId, organizationId: ctx.organizationId },
    include: {
      organization: { select: { id: true, slug: true, name: true, currency: true } },
      eventPlanRecommendations: true,
      resourceReservations: {
        where: { releasedAt: null },
        include: {
          resource: {
            select: {
              id: true,
              name: true,
              resourceType: { select: { id: true, name: true } },
            },
          },
        },
      },
    },
  });
  if (!inquiry) {
    throw new InquiryError("PLAN_NOT_FOUND");
  }
  if (inquiry.status === INQUIRY_STATUSES.BOOKED) {
    const booked = await database.booking.findFirst({
      where: { organizationId: ctx.organizationId, inquiryId: inquiry.id },
    });
    if (booked) {
      return { booking: booked, created: false };
    }
    throw new BookingError("ALREADY_BOOKED");
  }
  if (expectedUpdatedAt && inquiry.updatedAt.toISOString() !== expectedUpdatedAt) {
    throw new InquiryError("STALE_INQUIRY");
  }

  const working =
    inquiry.eventPlanRecommendations.find((row) => row.id === inquiry.agentWorkingPlanId) ??
    inquiry.eventPlanRecommendations.find((row) => row.kind === EVENT_PLAN_KINDS.AGENT_WORKING);
  const selected = inquiry.eventPlanRecommendations.find((row) => row.id === inquiry.selectedEventPlanId);
  if (!working || !selected) {
    throw new BookingError("NOT_READY_TO_FINALIZE", "Start working from the customer-selected plan before confirming.");
  }

  const payload = readEventPlanPayload(working.payload);
  const inventory = await database.resourceType.findMany({
    where: { organizationId: ctx.organizationId },
    select: { id: true, _count: { select: { resources: { where: { active: true } } } } },
  });
  const requirements = applyRotationWindows(
    applyInventoryFeasibility(
      payload.resourceRequirements ?? [],
      inventory.map((row) => ({ id: row.id, activeCount: row._count.resources })),
    ),
    payload,
  );
  const blockers = bookingConfirmationBlockers({
    inquiryStatus: inquiry.status,
    workflowStage: inquiry.workflowStage,
    readyToFinalizeAt: inquiry.readyToFinalizeAt,
    selectedEventPlanId: inquiry.selectedEventPlanId,
    assignedUserProfileId: inquiry.assignedUserProfileId,
    workingPlan: {
      availabilityStatus: working.availabilityStatus,
      estimatedTotalCents: working.estimatedTotalCents,
      payload,
    },
    holds: inquiry.resourceReservations,
    hasFiniteRequirements: requirements.some((row) => row.quantity != null && row.quantity > 0),
  });
  if (blockers.length > 0) {
    const expired = blockers.some((row) => row.includes("hold has expired"));
    throw new BookingError(expired ? "HOLD_EXPIRED" : "NOT_READY_TO_FINALIZE", blockers[0]);
  }

  const coverage = holdCoverageErrors(payload, requirements, inquiry.resourceReservations);
  if (coverage.length > 0) {
    const expired = inquiry.resourceReservations.some(
      (row) => row.expiresAt && row.expiresAt.getTime() <= Date.now() && !row.releasedAt,
    );
    throw new BookingError(expired ? "HOLD_EXPIRED" : "HOLD_MISMATCH", coverage[0]);
  }

  await releaseExpiredHolds(database, ctx.organizationId);

  const availability = await checkResourceAvailability(database, {
    organizationId: ctx.organizationId,
    date: payload.eventDate,
    startTime: payload.startTime,
    durationMinutes: working.durationMinutes ?? payload.durationMinutes,
    resourceRequirements: requirements,
    excludeInquiryId: inquiry.id,
  });
  if (!availability.validated || !availability.available) {
    throw new BookingError(
      "AVAILABILITY_CONFLICT",
      availability.note || "Required resources are no longer available. Recheck the Master Schedule.",
    );
  }

  const window = localEventWindow({
    date: payload.eventDate,
    startTime: payload.startTime,
    durationMinutes: working.durationMinutes ?? payload.durationMinutes,
  });
  if (!window || !payload.eventDate || !payload.startTime) {
    throw new BookingError("NOT_READY_TO_FINALIZE", "A date and start time are required before confirming a booking.");
  }
  const eventDate = payload.eventDate;
  const startTime = payload.startTime;

  const holdIds = inquiry.resourceReservations
    .filter(
      (row) =>
        row.status === RESOURCE_RESERVATION_STATUSES.HOLD &&
        !row.releasedAt &&
        (!row.expiresAt || row.expiresAt.getTime() > Date.now()),
    )
    .map((row) => row.id);
  const totalCents = working.estimatedTotalCents ?? planPayloadTotal(payload);
  const items = lineItemsFromPayload(payload);
  const year = Number(eventDate.slice(0, 4));

  let created = false;
  let booking;
  try {
    const result = await database.$transaction(async (tx) => {
      const raced = await tx.booking.findFirst({
        where: { organizationId: ctx.organizationId, inquiryId: inquiry.id },
      });
      if (raced) {
        return { booking: raced, created: false as const };
      }
      const bookingNumber = await nextBookingNumber(tx, ctx.organizationId, inquiry.organization.slug, year);
      const createdBooking = await tx.booking.create({
        data: {
          organizationId: ctx.organizationId,
          inquiryId: inquiry.id,
          locationId: inquiry.locationId,
          bookingNumber,
          status: BOOKING_STATUSES.CONFIRMED,
          eventDate: new Date(`${eventDate}T00:00:00.000Z`),
          startTime,
          endTime: minutesToClock(window.endMinute),
          startMinute: window.startMinute,
          endMinute: window.endMinute,
          guestCount: payload.guestCount,
          eventType: inquiry.eventType,
          eventGoal: inquiry.eventGoal,
          diningLabel: payload.dining.label,
          subtotalCents: totalCents,
          taxCents: 0,
          totalCents,
          currency: working.currency || inquiry.organization.currency,
          customerGroupName: inquiry.customerGroupName,
          customerFirstName: inquiry.customerFirstName,
          customerLastName: inquiry.customerLastName,
          customerEmail: inquiry.customerEmail,
          customerPhone: inquiry.customerPhone,
          customerNotes: inquiry.customerNotes,
          internalNotes: inquiry.employeeInternalNotes,
          confirmedByUserProfileId: ctx.userId,
          confirmedAt: new Date(),
          selectedEventPlanId: selected.id,
          agentWorkingPlanId: working.id,
          payload: working.payload as Prisma.InputJsonValue,
        },
      });
      if (items.length > 0) {
        await tx.bookingLineItem.createMany({
          data: items.map((item) => ({
            organizationId: ctx.organizationId,
            bookingId: createdBooking.id,
            ...item,
          })),
        });
      }
      if (holdIds.length > 0) {
        const converted = await tx.resourceReservation.updateMany({
          where: {
            id: { in: holdIds },
            organizationId: ctx.organizationId,
            inquiryId: inquiry.id,
            bookingId: null,
            status: RESOURCE_RESERVATION_STATUSES.HOLD,
            releasedAt: null,
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
          },
          data: {
            status: RESOURCE_RESERVATION_STATUSES.BOOKED,
            bookingId: createdBooking.id,
            sourceType: RESOURCE_RESERVATION_SOURCES.BOOKING,
            expiresAt: null,
            reason: `Booked ${bookingNumber}`,
          },
        });
        if (converted.count !== holdIds.length) {
          throw new BookingError(
            "HOLD_MISMATCH",
            "A resource hold changed during confirmation. No booking was created.",
          );
        }
      }
      await tx.inquiry.update({
        where: { id: inquiry.id },
        data: {
          status: INQUIRY_STATUSES.BOOKED,
          aiHandlingEnabled: false,
          workflowStage: null,
        },
      });
      await recordAuditEvent(tx, {
        organizationId: ctx.organizationId,
        actorUserProfileId: ctx.userId,
        action: "booking.confirmed",
        resourceType: "booking",
        resourceId: createdBooking.id,
        metadata: { inquiryId: inquiry.id, bookingNumber, holdCount: holdIds.length },
      });
      await recordAuditEvent(tx, {
        organizationId: ctx.organizationId,
        actorUserProfileId: ctx.userId,
        action: "inquiry.converted_to_booking",
        resourceType: "inquiry",
        resourceId: inquiry.id,
        metadata: { bookingId: createdBooking.id, bookingNumber },
      });
      await recordAuditEvent(tx, {
        organizationId: ctx.organizationId,
        actorUserProfileId: ctx.userId,
        action: "resource.converted_to_booked",
        resourceType: "booking",
        resourceId: createdBooking.id,
        metadata: { inquiryId: inquiry.id, holdCount: holdIds.length },
      });
      return { booking: createdBooking, created: true as const };
    });
    booking = result.booking;
    created = result.created;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const winner = await database.booking.findFirst({
        where: { organizationId: ctx.organizationId, inquiryId: inquiry.id },
      });
      if (winner) {
        return { booking: winner, created: false };
      }
    }
    throw error;
  }

  if (!booking) {
    throw new BookingError("NOT_READY_TO_FINALIZE", "Booking confirmation did not complete.");
  }

  if (created) {
    try {
      await emitDomainEvent(database, {
        type: DOMAIN_EVENT_TYPES.BOOKING_CONFIRMED,
        payload: {
          organizationId: ctx.organizationId,
          bookingId: booking.id,
          inquiryId: inquiry.id,
          bookingNumber: booking.bookingNumber,
          organizationName: inquiry.organization.name,
          customerEmail: inquiry.customerEmail,
          customerFirstName: inquiry.customerFirstName,
          customerLastName: inquiry.customerLastName,
          customerGroupName: inquiry.customerGroupName,
          eventDate,
          startTime,
          endTime: minutesToClock(window.endMinute),
          guestCount: payload.guestCount,
          activities: payload.activities.map((row) => row.name),
          dining: payload.dining.label,
          spaces: payload.spaces.map((row) => row.name),
          totalCents,
          currency: working.currency || inquiry.organization.currency,
        },
      });
    } catch {
      await recordAuditEvent(database, {
        organizationId: ctx.organizationId,
        actorUserProfileId: ctx.userId,
        action: "communication.booking_confirmation_skipped",
        resourceType: "booking",
        resourceId: booking.id,
        metadata: { inquiryId: inquiry.id, skipReason: "EMIT_FAILED" },
      });
    }
  }

  return { booking, created };
}

export async function getBookingDetail(ctx: RequestContext, database: BookingDb, bookingId: string) {
  await requirePermission(ctx, PERMISSIONS.EVENTS_VIEW, database);
  return database.booking.findFirst({
    where: { id: bookingId, organizationId: ctx.organizationId },
    include: {
      confirmedBy: {
        select: { firstName: true, lastName: true, displayName: true, email: true },
      },
      lineItems: { orderBy: { sortOrder: "asc" } },
      reservations: {
        where: { releasedAt: null },
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
  const dateFilter =
    filter === BOOKING_LIST_FILTERS.TODAY
      ? { eventDate: new Date(`${today}T00:00:00.000Z`) }
      : filter === BOOKING_LIST_FILTERS.WEEK
        ? {
            eventDate: {
              gte: new Date(`${today}T00:00:00.000Z`),
              lt: new Date(`${weekEnd}T00:00:00.000Z`),
            },
          }
        : filter === BOOKING_LIST_FILTERS.PAST
          ? { eventDate: { lt: new Date(`${today}T00:00:00.000Z`) } }
          : { eventDate: { gte: new Date(`${today}T00:00:00.000Z`) } };

  return database.booking.findMany({
    where: {
      organizationId: ctx.organizationId,
      ...dateFilter,
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
    orderBy: [{ eventDate: "asc" }, { startMinute: "asc" }],
    take: 100,
  });
}

export { isoDate };
