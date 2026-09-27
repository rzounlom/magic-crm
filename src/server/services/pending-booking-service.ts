import { Prisma, type PrismaClient } from "@/generated/prisma/client";

import { bookingConfirmationBlockers } from "@/lib/bookings/confirmation-blockers";
import { bookingNumberPrefix, formatBookingNumber } from "@/lib/bookings/booking-number";
import { holdCoverageErrors } from "@/lib/bookings/hold-coverage";
import { planPayloadTotal } from "@/lib/inquiries/plan-diff";
import { READY_FOR_HUMAN_REASONS } from "@/lib/inquiries/ready-for-human-reason";
import { readEventPlanPayload } from "@/lib/event-planner/payload";
import {
  occupancyInstants,
  resolveOrganizationTimeZone,
  resolveSchedulingTimeZone,
} from "@/lib/inquiries/tenant-datetime";
import { BookingError, InquiryError, ResourceError } from "@/server/errors";
import { emitDomainEvent } from "@/server/domain-events/emit";
import { DOMAIN_EVENT_TYPES } from "@/server/domain-events/types";
import { depositPercentFromTenant, depositRequiredCents } from "@/server/catalog/pricing";
import { applyInventoryFeasibility } from "@/server/resources/feasibility";
import { lockLocationForScheduling } from "@/server/resources/location-exclusivity";
import { resourcesInLocationWhere } from "@/server/resources/location-scope";
import { shiftItineraryToStart, stampPlanResourceWindows } from "@/server/resources/segment-windows";
import { localEventWindow, minutesToClock } from "@/server/resources/time-window";
import { recordAuditEvent } from "@/server/services/audit";
import {
  evaluateAvailabilitySnapshot,
  loadLocationAvailabilitySnapshot,
} from "@/server/resources/availability-snapshot";
import { logAvailabilitySearch } from "@/server/logging";
import { findNearbyAvailableStarts, NEARBY_START_OFFSETS_MINUTES } from "@/server/services/nearby-availability";
import { assignExactResourcesForRequirements } from "@/server/services/proposal-hold-service";
import {
  checkResourceAvailability,
  isReservationOverlapError,
  releaseExpiredHolds,
} from "@/server/services/resource-availability-service";
import { BOOKING_LINE_ITEM_KINDS, BOOKING_STATUSES } from "@/types/booking";
import { EVENT_PLAN_KINDS, INQUIRY_SALES_STAGES, INQUIRY_STATUSES } from "@/types/inquiry";
import {
  RESOURCE_RESERVATION_SOURCES,
  RESOURCE_RESERVATION_STATUSES,
  type PlanResourceRequirement,
} from "@/types/resource-schedule";
import type { EventPlanPayload } from "@/types/event-planner";

type BookingDb = PrismaClient;

export type ConfirmPendingBookingResult = {
  booking: {
    id: string;
    bookingNumber: string;
    status: string;
    inquiryId: string;
    guestCount: number;
    selectedEventPlanId: string | null;
    agentWorkingPlanId: string | null;
    depositRequiredCents: number;
    depositPaidCents: number;
    paymentConfirmedExternallyAt: Date | null;
    availabilityConflictAt: Date | null;
  };
  created: boolean;
  conflict: {
    nearbyStartTimes: string[];
    conflictingTypes: string[];
    note: string;
  } | null;
};

function tenantYear(timeZone: string | null | undefined, now = new Date()): number {
  return Number(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: resolveOrganizationTimeZone(timeZone),
      year: "numeric",
    }).format(now),
  );
}

export function lineItemsFromPayload(payload: ReturnType<typeof readEventPlanPayload>) {
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

function windowFields(payload: ReturnType<typeof readEventPlanPayload>, durationMinutes: number, timeZone: string) {
  const window = localEventWindow({
    date: payload.eventDate,
    startTime: payload.startTime,
    durationMinutes,
  });
  if (!window || !payload.eventDate || !payload.startTime) {
    throw new BookingError("NOT_READY_TO_FINALIZE", "A date and start time are required.");
  }
  const instants = occupancyInstants({ ...window, timeZone });
  return { window, instants, eventDate: payload.eventDate, startTime: payload.startTime };
}

export async function upsertPendingBookingFromPlan(
  database: BookingDb,
  input: {
    organizationId: string;
    inquiryId: string;
    planId: string;
    actorUserProfileId?: string | null;
    source?: "customer_book_now" | "employee_save";
  },
) {
  const inquiry = await database.inquiry.findFirst({
    where: { id: input.inquiryId, organizationId: input.organizationId },
    include: {
      organization: {
        select: { id: true, slug: true, currency: true, timezone: true, depositPercent: true },
      },
      location: { select: { id: true, timezone: true } },
      eventPlanRecommendations: true,
      bookings: { take: 1, orderBy: { createdAt: "desc" } },
    },
  });
  if (!inquiry) {
    throw new InquiryError("PLAN_NOT_FOUND");
  }
  if (inquiry.status === INQUIRY_STATUSES.BOOKED) {
    throw new InquiryError("INQUIRY_ALREADY_BOOKED");
  }
  const existing = inquiry.bookings[0] ?? null;
  if (existing?.status === BOOKING_STATUSES.CONFIRMED) {
    throw new InquiryError("INQUIRY_ALREADY_BOOKED");
  }
  if (existing && existing.status !== BOOKING_STATUSES.PENDING_PAYMENT) {
    throw new BookingError("ALREADY_BOOKED");
  }

  const plan = inquiry.eventPlanRecommendations.find((row) => row.id === input.planId);
  if (!plan || plan.organizationId !== input.organizationId || plan.inquiryId !== inquiry.id) {
    throw new InquiryError("PLAN_NOT_FOUND");
  }

  const payload = readEventPlanPayload(plan.payload);
  const timeZone = resolveSchedulingTimeZone({
    locationTimeZone: inquiry.location?.timezone,
    organizationTimeZone: inquiry.organization.timezone,
  });
  const durationMinutes = plan.durationMinutes ?? payload.durationMinutes;
  const { window, instants, eventDate, startTime } = windowFields(payload, durationMinutes, timeZone);
  const totalCents = plan.estimatedTotalCents ?? planPayloadTotal(payload);
  const items = lineItemsFromPayload(payload);
  const depositPercent = depositPercentFromTenant(inquiry.organization.depositPercent);
  const year = Number(eventDate.slice(0, 4)) || tenantYear(inquiry.organization.timezone);
  const selectedId =
    plan.kind === EVENT_PLAN_KINDS.AGENT_WORKING ? inquiry.selectedEventPlanId : plan.id;
  const workingId = plan.kind === EVENT_PLAN_KINDS.AGENT_WORKING ? plan.id : inquiry.agentWorkingPlanId;
  const bookingData = {
    locationId: inquiry.locationId,
    status: BOOKING_STATUSES.PENDING_PAYMENT,
    eventDate: new Date(`${eventDate}T00:00:00.000Z`),
    startTime,
    endTime: minutesToClock(window.endMinute),
    startMinute: window.startMinute,
    endMinute: window.endMinute,
    startsAt: instants.startsAt,
    endsAt: instants.endsAt,
    guestCount: payload.guestCount,
    eventType: inquiry.eventType,
    eventGoal: inquiry.eventGoal,
    diningLabel: payload.dining.label,
    subtotalCents: totalCents,
    taxCents: 0,
    totalCents,
    depositRequiredCents: depositRequiredCents(totalCents, depositPercent),
    currency: plan.currency || inquiry.organization.currency,
    customerGroupName: inquiry.customerGroupName,
    customerFirstName: inquiry.customerFirstName,
    customerLastName: inquiry.customerLastName,
    customerEmail: inquiry.customerEmail,
    customerPhone: inquiry.customerPhone,
    customerNotes: inquiry.customerNotes,
    internalNotes: inquiry.employeeInternalNotes,
    selectedEventPlanId: selectedId,
    agentWorkingPlanId: workingId,
    payload: plan.payload as Prisma.InputJsonValue,
    availabilityConflictAt: null,
  };

  try {
    const result = await database.$transaction(async (tx) => {
      await tx.$executeRaw`
        SELECT id FROM inquiries
        WHERE id = ${inquiry.id} AND "organizationId" = ${input.organizationId}
        FOR UPDATE
      `;
      const raced = await tx.booking.findFirst({
        where: { organizationId: input.organizationId, inquiryId: inquiry.id },
      });
    if (raced?.status === BOOKING_STATUSES.CONFIRMED) {
      throw new InquiryError("INQUIRY_ALREADY_BOOKED");
    }
    let booking = raced;
    let created = false;
    if (!booking) {
      const bookingNumber = await nextBookingNumber(tx, input.organizationId, inquiry.organization.slug, year);
      booking = await tx.booking.create({
        data: {
          organizationId: input.organizationId,
          inquiryId: inquiry.id,
          bookingNumber,
          ...bookingData,
        },
      });
      created = true;
    } else if (booking.status === BOOKING_STATUSES.PENDING_PAYMENT) {
      booking = await tx.booking.update({
        where: { id: booking.id },
        data: bookingData,
      });
      await tx.bookingLineItem.deleteMany({
        where: { organizationId: input.organizationId, bookingId: booking.id },
      });
    } else {
      throw new BookingError("ALREADY_BOOKED");
    }
    if (items.length > 0) {
      await tx.bookingLineItem.createMany({
        data: items.map((item) => ({
          organizationId: input.organizationId,
          bookingId: booking!.id,
          ...item,
        })),
      });
    }
    await tx.inquiry.update({
      where: { id: inquiry.id },
      data: {
        selectedEventPlanId: selectedId ?? inquiry.selectedEventPlanId,
        customerSelectedAt: inquiry.customerSelectedAt ?? new Date(),
        salesStage: INQUIRY_SALES_STAGES.DEPOSIT_PENDING,
        status: INQUIRY_STATUSES.READY_FOR_HUMAN,
        aiHandlingEnabled: false,
        humanHandoffRequestedAt: inquiry.humanHandoffRequestedAt ?? new Date(),
        humanHandoffReason: inquiry.humanHandoffReason ?? READY_FOR_HUMAN_REASONS.CUSTOMER_SELECTED_PLAN,
      },
    });
    await recordAuditEvent(tx, {
      organizationId: input.organizationId,
      actorUserProfileId: input.actorUserProfileId ?? null,
      action: created ? "booking.pending_created" : "booking.pending_updated",
      resourceType: "booking",
      resourceId: booking.id,
      metadata: {
        inquiryId: inquiry.id,
        planId: plan.id,
        source: input.source ?? "employee_save",
        requestedStart: startTime,
        requestedEnd: minutesToClock(window.endMinute),
        eventDate,
      },
    });
      return { booking, created };
    });
    return result;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const existing = await database.booking.findFirst({
        where: { organizationId: input.organizationId, inquiryId: inquiry.id },
      });
      if (existing) {
        return { booking: existing, created: false };
      }
    }
    throw error;
  }
}

async function nearbyTimesForConflict(
  database: BookingDb,
  input: {
    organizationId: string;
    locationId: string | null;
    inquiryId: string;
    eventDate: string;
    startTime: string;
    durationMinutes: number;
    requirements: PlanResourceRequirement[];
    itinerary?: EventPlanPayload["itinerary"];
  },
) {
  const started = Date.now();
  const snapshot = await loadLocationAvailabilitySnapshot(database, {
    organizationId: input.organizationId,
    locationId: input.locationId,
    slotDate: input.eventDate,
  });
  let candidatesEvaluated = 0;
  const nearby = await findNearbyAvailableStarts({
    startTime: input.startTime,
    check: async (startTime) => {
      candidatesEvaluated += 1;
      return evaluateAvailabilitySnapshot(snapshot, {
        organizationId: input.organizationId,
        locationId: input.locationId,
        date: input.eventDate,
        startTime,
        durationMinutes: input.durationMinutes,
        resourceRequirements: stampPlanResourceWindows({
          itinerary: shiftItineraryToStart(input.itinerary ?? [], startTime),
          startTime,
          resourceRequirements: input.requirements,
        }),
        excludeInquiryId: input.inquiryId,
        now: snapshot.now,
      });
    },
  });
  logAvailabilitySearch({
    phase: "nearby_confirmation",
    candidatesEvaluated,
    horizonMinutes: Math.max(...NEARBY_START_OFFSETS_MINUTES) - Math.min(...NEARBY_START_OFFSETS_MINUTES),
    queryPhaseMs: snapshot.queryPhaseMs,
    totalMs: Date.now() - started,
    selectedStart: nearby[0]?.startTime ?? null,
  });
  return nearby.map((row) => row.startTime);
}

/**
 * Canonical finalization: employee external-payment confirmation and future Stripe
 * deposit success must both call this. Pending bookings do not occupy inventory.
 * Physical BOOKED rows are inserted only inside this transaction.
 */
export async function confirmPendingBooking(
  database: BookingDb,
  input: {
    organizationId: string;
    inquiryId: string;
    actorUserProfileId: string | null;
    attestExternalPayment?: boolean;
  },
): Promise<ConfirmPendingBookingResult> {
  const inquiry = await database.inquiry.findFirst({
    where: { id: input.inquiryId, organizationId: input.organizationId },
    include: {
      organization: {
        select: { id: true, slug: true, name: true, currency: true, timezone: true, depositPercent: true },
      },
      location: { select: { id: true, name: true, timezone: true } },
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
      bookings: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  if (!inquiry) {
    throw new InquiryError("PLAN_NOT_FOUND");
  }

  const existing = inquiry.bookings[0] ?? null;
  if (existing?.status === BOOKING_STATUSES.CONFIRMED) {
    return { booking: existing, created: false, conflict: null };
  }
  if (existing?.status === BOOKING_STATUSES.CANCELLED) {
    throw new BookingError(
      "ALREADY_BOOKED",
      "This booking was cancelled. Open a new booking if you need to book again.",
    );
  }
  if (existing?.status === BOOKING_STATUSES.COMPLETED) {
    throw new BookingError("ALREADY_BOOKED", "This booking is completed and cannot be changed.");
  }
  if (inquiry.status === INQUIRY_STATUSES.BOOKED && existing?.status === BOOKING_STATUSES.CONFIRMED) {
    return { booking: existing, created: false, conflict: null };
  }

  const working =
    inquiry.eventPlanRecommendations.find((row) => row.id === inquiry.agentWorkingPlanId) ??
    inquiry.eventPlanRecommendations.find((row) => row.kind === EVENT_PLAN_KINDS.AGENT_WORKING);
  const selected = inquiry.eventPlanRecommendations.find((row) => row.id === inquiry.selectedEventPlanId);
  const sourcePlan = working ?? selected;
  if (!sourcePlan && !existing) {
    throw new BookingError(
      "NOT_READY_TO_FINALIZE",
      "Save a pending booking or start working from the selected plan before confirming.",
    );
  }
  const planPayloadRaw = sourcePlan?.payload ?? existing?.payload;
  const payload = readEventPlanPayload(planPayloadRaw);
  const durationMinutes =
    sourcePlan?.durationMinutes ?? payload.durationMinutes ?? ((existing?.endMinute ?? 0) - (existing?.startMinute ?? 0));
  const inventory = await database.resourceType.findMany({
    where: { organizationId: input.organizationId },
    select: { id: true, _count: { select: { resources: { where: resourcesInLocationWhere(inquiry.locationId) } } } },
  });
  const requirements = stampPlanResourceWindows(
    payload,
    applyInventoryFeasibility(
      payload.resourceRequirements ?? [],
      inventory.map((row) => ({ id: row.id, activeCount: row._count.resources })),
    ),
  );
  payload.resourceRequirements = requirements;
  payload.itinerary = shiftItineraryToStart(payload.itinerary ?? [], payload.startTime);
  const blockers = bookingConfirmationBlockers({
    inquiryStatus: inquiry.status,
    workflowStage: inquiry.workflowStage,
    readyToFinalizeAt: inquiry.readyToFinalizeAt,
    selectedEventPlanId: inquiry.selectedEventPlanId ?? existing?.selectedEventPlanId ?? null,
    assignedUserProfileId: inquiry.assignedUserProfileId,
    workingPlan: {
      availabilityStatus: (working ?? selected)?.availabilityStatus ?? "AVAILABLE",
      estimatedTotalCents: (working ?? selected)?.estimatedTotalCents ?? existing?.totalCents ?? planPayloadTotal(payload),
      payload,
    },
    holds: inquiry.resourceReservations,
    hasFiniteRequirements: requirements.some((row) => row.quantity != null && row.quantity > 0),
  });
  if (blockers.length > 0) {
    throw new BookingError("NOT_READY_TO_FINALIZE", blockers[0]);
  }

  const holdIds = inquiry.resourceReservations
    .filter(
      (row) =>
        row.status === RESOURCE_RESERVATION_STATUSES.HOLD &&
        !row.releasedAt &&
        (!row.expiresAt || row.expiresAt.getTime() > Date.now()),
    )
    .map((row) => row.id);
  const coverage =
    holdIds.length > 0 ? holdCoverageErrors(payload, requirements, inquiry.resourceReservations) : [];
  if (coverage.length > 0 && holdIds.length > 0) {
    // Legacy HOLD mismatch: ignore stale holds and allocate fresh BOOKED rows.
  }

  await releaseExpiredHolds(database, input.organizationId);

  const timeZone = resolveSchedulingTimeZone({
    locationTimeZone: inquiry.location?.timezone,
    organizationTimeZone: inquiry.organization.timezone,
  });
  const { window, instants, eventDate, startTime } = windowFields(payload, durationMinutes, timeZone);
  const totalCents =
    (working ?? selected)?.estimatedTotalCents ?? existing?.totalCents ?? planPayloadTotal(payload);
  const items = lineItemsFromPayload(payload);
  const year = Number(eventDate.slice(0, 4));
  const depositPercent = depositPercentFromTenant(inquiry.organization.depositPercent);
  const depositCents = depositRequiredCents(totalCents, depositPercent);
  const selectedPlanId = selected?.id ?? existing?.selectedEventPlanId ?? null;
  const workingPlanId = working?.id ?? existing?.agentWorkingPlanId ?? null;
  const now = new Date();

  let created = false;
  let booking;
  let conflict: ConfirmPendingBookingResult["conflict"] = null;

  try {
    // Per-requirement occupancy checks run inside this transaction. Neon
    // round-trips for a multi-resource plan exceed Prisma's 5s default.
    const result = await database.$transaction(async (tx) => {
      await lockLocationForScheduling(tx, input.organizationId, inquiry.locationId);
      const raced = await tx.booking.findFirst({
        where: { organizationId: input.organizationId, inquiryId: inquiry.id },
      });
      if (raced?.status === BOOKING_STATUSES.CONFIRMED) {
        return { booking: raced, created: false as const, conflict: null };
      }

      const snapshot = {
        locationId: inquiry.locationId,
        eventDate: new Date(`${eventDate}T00:00:00.000Z`),
        startTime,
        endTime: minutesToClock(window.endMinute),
        startMinute: window.startMinute,
        endMinute: window.endMinute,
        startsAt: instants.startsAt,
        endsAt: instants.endsAt,
        guestCount: payload.guestCount,
        eventType: inquiry.eventType,
        eventGoal: inquiry.eventGoal,
        diningLabel: payload.dining.label,
        subtotalCents: totalCents,
        taxCents: 0,
        totalCents,
        depositRequiredCents: depositCents,
        currency: (working ?? selected)?.currency || existing?.currency || inquiry.organization.currency,
        customerGroupName: inquiry.customerGroupName,
        customerFirstName: inquiry.customerFirstName,
        customerLastName: inquiry.customerLastName,
        customerEmail: inquiry.customerEmail,
        customerPhone: inquiry.customerPhone,
        customerNotes: inquiry.customerNotes,
        internalNotes: inquiry.employeeInternalNotes,
        selectedEventPlanId: selectedPlanId,
        agentWorkingPlanId: workingPlanId,
        payload: payload as unknown as Prisma.InputJsonValue,
      };

      let current = raced;
      if (!current) {
        const bookingNumber = await nextBookingNumber(tx, input.organizationId, inquiry.organization.slug, year);
        current = await tx.booking.create({
          data: {
            organizationId: input.organizationId,
            inquiryId: inquiry.id,
            bookingNumber,
            status: BOOKING_STATUSES.PENDING_PAYMENT,
            ...snapshot,
          },
        });
      } else {
        current = await tx.booking.update({
          where: { id: current.id },
          data: snapshot,
        });
        await tx.bookingLineItem.deleteMany({
          where: { organizationId: input.organizationId, bookingId: current.id },
        });
      }
      if (items.length > 0) {
        await tx.bookingLineItem.createMany({
          data: items.map((item) => ({
            organizationId: input.organizationId,
            bookingId: current!.id,
            ...item,
          })),
        });
      }

      if (input.attestExternalPayment && input.actorUserProfileId) {
        current = await tx.booking.update({
          where: { id: current.id },
          data: {
            paymentConfirmedExternallyAt: current.paymentConfirmedExternallyAt ?? now,
            paymentConfirmedExternallyByUserProfileId:
              current.paymentConfirmedExternallyByUserProfileId ?? input.actorUserProfileId,
          },
        });
        await recordAuditEvent(tx, {
          organizationId: input.organizationId,
          actorUserProfileId: input.actorUserProfileId,
          action: "booking.payment_attested",
          resourceType: "booking",
          resourceId: current.id,
          metadata: { inquiryId: inquiry.id, bookingNumber: current.bookingNumber },
        });
      }

      await recordAuditEvent(tx, {
        organizationId: input.organizationId,
        actorUserProfileId: input.actorUserProfileId,
        action: "booking.confirmation_attempted",
        resourceType: "booking",
        resourceId: current.id,
        metadata: {
          inquiryId: inquiry.id,
          planId: selectedPlanId,
          requestedStart: startTime,
          requestedEnd: minutesToClock(window.endMinute),
          eventDate,
        },
      });

      const availability = await checkResourceAvailability(tx as BookingDb, {
        organizationId: input.organizationId,
        locationId: inquiry.locationId,
        date: eventDate,
        startTime,
        durationMinutes,
        resourceRequirements: requirements,
        excludeInquiryId: inquiry.id,
      });
      if (!availability.validated || !availability.available) {
        const conflictingTypes = availability.types
          .filter((row) => row.conflict)
          .map((row) => row.resourceTypeName);
        current = await tx.booking.update({
          where: { id: current.id },
          data: { availabilityConflictAt: now, status: BOOKING_STATUSES.PENDING_PAYMENT },
        });
        await tx.inquiry.update({
          where: { id: inquiry.id },
          data: { salesStage: INQUIRY_SALES_STAGES.DEPOSIT_PENDING, status: INQUIRY_STATUSES.READY_FOR_HUMAN },
        });
        return {
          booking: current,
          created: false as const,
          conflict: {
            nearbyStartTimes: [] as string[],
            conflictingTypes,
            note: availability.note || "Availability changed before this booking could be confirmed.",
          },
        };
      }

      const activeHoldIds = holdIds;
      const useLegacyHolds = activeHoldIds.length > 0 && coverage.length === 0;
      if (useLegacyHolds) {
        const converted = await tx.resourceReservation.updateMany({
          where: {
            id: { in: activeHoldIds },
            organizationId: input.organizationId,
            inquiryId: inquiry.id,
            bookingId: null,
            status: RESOURCE_RESERVATION_STATUSES.HOLD,
            releasedAt: null,
            OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
          },
          data: {
            status: RESOURCE_RESERVATION_STATUSES.BOOKED,
            bookingId: current.id,
            sourceType: RESOURCE_RESERVATION_SOURCES.BOOKING,
            expiresAt: null,
            startsAt: instants.startsAt,
            endsAt: instants.endsAt,
            reason: `Booked ${current.bookingNumber}`,
          },
        });
        if (converted.count > 0 && converted.count !== activeHoldIds.length) {
          throw new BookingError(
            "HOLD_MISMATCH",
            "A resource hold changed during confirmation. No booking was confirmed.",
          );
        }
        if (converted.count === 0 && requirements.some((row) => row.quantity != null && row.quantity > 0)) {
          await insertBookedReservations(tx as BookingDb, {
            organizationId: input.organizationId,
            locationId: inquiry.locationId,
            inquiryId: inquiry.id,
            bookingId: current.id,
            bookingNumber: current.bookingNumber,
            actorUserProfileId: input.actorUserProfileId,
            window,
            timeZone,
            requirements,
          });
        }
      } else if (requirements.some((row) => row.quantity != null && row.quantity > 0)) {
        await insertBookedReservations(tx as BookingDb, {
          organizationId: input.organizationId,
          locationId: inquiry.locationId,
          inquiryId: inquiry.id,
          bookingId: current.id,
          bookingNumber: current.bookingNumber,
          actorUserProfileId: input.actorUserProfileId,
          window,
          timeZone,
          requirements,
        });
      }

      const confirmed = await tx.booking.update({
        where: { id: current.id },
        data: {
          status: BOOKING_STATUSES.CONFIRMED,
          confirmedByUserProfileId: input.actorUserProfileId,
          confirmedAt: now,
          availabilityConflictAt: null,
        },
      });
      await tx.inquiry.update({
        where: { id: inquiry.id },
        data: {
          status: INQUIRY_STATUSES.BOOKED,
          salesStage: INQUIRY_SALES_STAGES.BOOKED,
          aiHandlingEnabled: false,
          workflowStage: null,
        },
      });
      await recordAuditEvent(tx, {
        organizationId: input.organizationId,
        actorUserProfileId: input.actorUserProfileId,
        action: "booking.created",
        resourceType: "booking",
        resourceId: confirmed.id,
        metadata: { inquiryId: inquiry.id, bookingNumber: confirmed.bookingNumber },
      });
      await recordAuditEvent(tx, {
        organizationId: input.organizationId,
        actorUserProfileId: input.actorUserProfileId,
        action: "booking.confirmed",
        resourceType: "booking",
        resourceId: confirmed.id,
        metadata: { inquiryId: inquiry.id, bookingNumber: confirmed.bookingNumber, holdCount: holdIds.length },
      });
      await recordAuditEvent(tx, {
        organizationId: input.organizationId,
        actorUserProfileId: input.actorUserProfileId,
        action: "inquiry.converted_to_booking",
        resourceType: "inquiry",
        resourceId: inquiry.id,
        metadata: { bookingId: confirmed.id, bookingNumber: confirmed.bookingNumber },
      });
      if (holdIds.length > 0) {
        await recordAuditEvent(tx, {
          organizationId: input.organizationId,
          actorUserProfileId: input.actorUserProfileId,
          action: "resource.converted_to_booked",
          resourceType: "booking",
          resourceId: confirmed.id,
          metadata: { inquiryId: inquiry.id, holdCount: holdIds.length },
        });
      }
      return { booking: confirmed, created: true as const, conflict: null };
    }, { timeout: 20_000 });
    booking = result.booking;
    created = result.created;
    conflict = result.conflict;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const winner = await database.booking.findFirst({
        where: { organizationId: input.organizationId, inquiryId: inquiry.id },
      });
      if (winner?.status === BOOKING_STATUSES.CONFIRMED) {
        return { booking: winner, created: false, conflict: null };
      }
    }
    if (isReservationOverlapError(error) || (error instanceof ResourceError && error.code === "RESOURCE_CONFLICT")) {
      const pending = await markConfirmationConflict(database, {
        organizationId: input.organizationId,
        inquiryId: inquiry.id,
        actorUserProfileId: input.actorUserProfileId,
        eventDate,
        startTime,
        durationMinutes,
        requirements,
        locationId: inquiry.locationId,
      });
      throw new BookingError(
        "AVAILABILITY_CONFLICT",
        pending.conflict?.note ?? "Availability changed before this booking could be confirmed.",
      );
    }
    throw error;
  }

  if (!booking) {
    throw new BookingError("NOT_READY_TO_FINALIZE", "Booking confirmation did not complete.");
  }

  if (conflict) {
    const nearbyStartTimes = await nearbyTimesForConflict(database, {
      organizationId: input.organizationId,
      locationId: inquiry.locationId,
      inquiryId: inquiry.id,
      eventDate,
      startTime,
      durationMinutes,
      requirements,
      itinerary: payload.itinerary,
    });
    conflict = { ...conflict, nearbyStartTimes };
    if (booking) {
      await recordAuditEvent(database, {
        organizationId: input.organizationId,
        actorUserProfileId: input.actorUserProfileId,
        action: "booking.confirmation_conflict",
        resourceType: "booking",
        resourceId: booking.id,
        metadata: {
          inquiryId: inquiry.id,
          conflictingTypes: conflict.conflictingTypes.join(", ") || null,
          nearbyStartTimes: nearbyStartTimes.join(", ") || null,
        },
      });
    }
    throw new BookingError(
      "AVAILABILITY_CONFLICT",
      conflict.nearbyStartTimes.length > 0
        ? `${conflict.note} Nearby availability exists at ${conflict.nearbyStartTimes.join(" and ")}.`
        : conflict.note,
    );
  }

  if (created) {
    try {
      await emitDomainEvent(database, {
        type: DOMAIN_EVENT_TYPES.BOOKING_CONFIRMED,
        payload: {
          organizationId: input.organizationId,
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
          currency: (working ?? selected)?.currency || inquiry.organization.currency,
        },
      });
    } catch {
      await recordAuditEvent(database, {
        organizationId: input.organizationId,
        actorUserProfileId: input.actorUserProfileId,
        action: "communication.booking_confirmation_skipped",
        resourceType: "booking",
        resourceId: booking.id,
        metadata: { inquiryId: inquiry.id, skipReason: "EMIT_FAILED" },
      });
    }
  }

  return { booking, created, conflict: null };
}

async function insertBookedReservations(
  tx: BookingDb,
  input: {
    organizationId: string;
    locationId: string | null;
    inquiryId: string;
    bookingId: string;
    bookingNumber: string;
    actorUserProfileId: string | null;
    window: { slotDate: string; startMinute: number; endMinute: number };
    timeZone: string;
    requirements: PlanResourceRequirement[];
  },
) {
  const assignments = await assignExactResourcesForRequirements(tx, {
    organizationId: input.organizationId,
    locationId: input.locationId,
    window: input.window,
    requirements: input.requirements,
    excludeInquiryId: input.inquiryId,
  });
  await tx.resourceReservation.createMany({
    data: assignments.map((assignment) => {
      const rowInstants = occupancyInstants({
        slotDate: input.window.slotDate,
        startMinute: assignment.startMinute,
        endMinute: assignment.endMinute,
        timeZone: input.timeZone,
      });
      return {
        organizationId: input.organizationId,
        locationId: input.locationId,
        resourceId: assignment.resourceId,
        status: RESOURCE_RESERVATION_STATUSES.BOOKED,
        slotDate: new Date(`${input.window.slotDate}T00:00:00.000Z`),
        startMinute: assignment.startMinute,
        endMinute: assignment.endMinute,
        startsAt: rowInstants.startsAt,
        endsAt: rowInstants.endsAt,
        inquiryId: input.inquiryId,
        bookingId: input.bookingId,
        sourceType: RESOURCE_RESERVATION_SOURCES.BOOKING,
        expiresAt: null,
        reason: `Booked ${input.bookingNumber}`,
        createdByUserProfileId: input.actorUserProfileId,
      };
    }),
  });
}

async function markConfirmationConflict(
  database: BookingDb,
  input: {
    organizationId: string;
    inquiryId: string;
    actorUserProfileId: string | null;
    eventDate: string;
    startTime: string;
    durationMinutes: number;
    locationId: string | null;
    requirements: PlanResourceRequirement[];
    itinerary?: EventPlanPayload["itinerary"];
  },
) {
  const nearbyStartTimes = await nearbyTimesForConflict(database, {
    organizationId: input.organizationId,
    locationId: input.locationId,
    inquiryId: input.inquiryId,
    eventDate: input.eventDate,
    startTime: input.startTime,
    durationMinutes: input.durationMinutes,
    requirements: input.requirements,
    itinerary: input.itinerary,
  });
  const booking = await database.booking.findFirst({
    where: { organizationId: input.organizationId, inquiryId: input.inquiryId },
  });
  if (booking && booking.status === BOOKING_STATUSES.PENDING_PAYMENT) {
    await database.booking.update({
      where: { id: booking.id },
      data: { availabilityConflictAt: new Date() },
    });
    await recordAuditEvent(database, {
      organizationId: input.organizationId,
      actorUserProfileId: input.actorUserProfileId,
      action: "booking.confirmation_conflict",
      resourceType: "booking",
      resourceId: booking.id,
      metadata: { inquiryId: input.inquiryId, nearbyStartTimes: nearbyStartTimes.join(", ") || null },
    });
  }
  return {
    booking,
    conflict: {
      nearbyStartTimes,
      conflictingTypes: [] as string[],
      note: "Availability changed before this booking could be confirmed.",
    },
  };
}

export async function listPendingBookingsForDay(
  database: BookingDb,
  input: { organizationId: string; date: string; locationId?: string | null },
) {
  return database.booking.findMany({
    where: {
      organizationId: input.organizationId,
      status: BOOKING_STATUSES.PENDING_PAYMENT,
      eventDate: new Date(`${input.date}T00:00:00.000Z`),
      ...(input.locationId ? { locationId: input.locationId } : {}),
    },
    select: {
      id: true,
      inquiryId: true,
      bookingNumber: true,
      status: true,
      eventDate: true,
      startTime: true,
      endTime: true,
      guestCount: true,
      totalCents: true,
      depositRequiredCents: true,
      currency: true,
      customerGroupName: true,
      customerFirstName: true,
      customerLastName: true,
      selectedEventPlanId: true,
      availabilityConflictAt: true,
      paymentConfirmedExternallyAt: true,
    },
    orderBy: [{ startMinute: "asc" }, { createdAt: "desc" }],
  });
}
