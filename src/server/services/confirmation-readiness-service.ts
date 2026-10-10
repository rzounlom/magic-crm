/**
 * Advisory confirmation readiness for staff UI.
 * Final confirmation always revalidates inside confirmPendingBooking.
 */
import type { Prisma, PrismaClient } from "@/generated/prisma/client";

import { bookingConfirmationBlockers } from "@/lib/bookings/confirmation-blockers";
import { readEventPlanPayload } from "@/lib/event-planner/payload";
import { resolveSchedulingTimeZone } from "@/lib/inquiries/tenant-datetime";
import { BookingError, InquiryError } from "@/server/errors";
import { hasPermission, requirePermission } from "@/server/policies/require-permission";
import type { RequestContext } from "@/server/request-context";
import { applyInventoryFeasibility } from "@/server/resources/feasibility";
import {
  findActiveHoursException,
  isOverridableOperatingHoursStatus,
  type HoursExceptionFingerprint,
} from "@/server/resources/hours-exception";
import { resourcesInLocationWhere } from "@/server/resources/location-scope";
import { evaluateWritableOccupancy } from "@/server/resources/scheduling-guards";
import { shiftItineraryToStart, stampPlanResourceWindows } from "@/server/resources/segment-windows";
import { localEventWindow, minutesToClock } from "@/server/resources/time-window";
import { checkResourceAvailability } from "@/server/services/resource-availability-service";
import { BOOKING_STATUSES } from "@/types/booking";
import {
  CONFIRMATION_READINESS_STATES,
  type ConfirmationHoursExceptionSummary,
  type ConfirmationReadinessBlocker,
  type ConfirmationReadinessResult,
  type ConfirmationReadinessState,
} from "@/types/confirmation-readiness";
import { EVENT_PLAN_KINDS } from "@/types/inquiry";
import {
  OPERATING_HOURS_EVALUATION_STATUSES,
  OPERATING_HOURS_EXCEPTION_PURPOSES,
  type OperatingHoursEvaluationStatus,
} from "@/types/operating-hours";
import { PERMISSIONS } from "@/types/permissions";

type ReadinessDb = PrismaClient | Prisma.TransactionClient;

export type ConfirmOccupancyContext = {
  inquiryId: string;
  bookingId: string | null;
  locationId: string;
  locationName: string | null;
  timeZone: string;
  slotDate: string;
  startMinute: number;
  endMinute: number;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  operatingHoursStatus: OperatingHoursEvaluationStatus;
  fingerprint: HoursExceptionFingerprint;
};

function summarizeException(
  row: {
    id: string;
    purpose: string;
    overriddenStatus: string;
    reason: string;
    expiresAt: Date;
    authorizedAt: Date;
    consumedAt: Date | null;
    revokedAt: Date | null;
  },
  now: Date,
): ConfirmationHoursExceptionSummary {
  let status: ConfirmationHoursExceptionSummary["status"] = "ACTIVE";
  if (row.consumedAt) {
    status = "CONSUMED";
  } else if (row.revokedAt) {
    status = "REVOKED";
  } else if (row.expiresAt.getTime() <= now.getTime()) {
    status = "EXPIRED";
  }
  return {
    id: row.id,
    purpose: row.purpose,
    overriddenStatus: row.overriddenStatus,
    reason: row.reason,
    expiresAt: row.expiresAt.toISOString(),
    authorizedAt: row.authorizedAt.toISOString(),
    consumedAt: row.consumedAt?.toISOString() ?? null,
    revokedAt: row.revokedAt?.toISOString() ?? null,
    status,
  };
}

/**
 * Resolve the confirm occupancy fingerprint from trusted inquiry/plan data.
 * Does not trust client-supplied date/time/location fields.
 */
export async function resolveConfirmOccupancyContext(
  ctx: RequestContext,
  database: ReadinessDb,
  inquiryId: string,
): Promise<ConfirmOccupancyContext> {
  await requirePermission(ctx, PERMISSIONS.EVENTS_CONFIRM, database);
  const inquiry = await database.inquiry.findFirst({
    where: { id: inquiryId, organizationId: ctx.organizationId },
    include: {
      organization: { select: { timezone: true } },
      location: { select: { id: true, name: true, timezone: true } },
      eventPlanRecommendations: true,
      bookings: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  if (!inquiry) {
    throw new InquiryError("PLAN_NOT_FOUND");
  }
  if (!inquiry.locationId || !inquiry.location) {
    throw new BookingError(
      "NOT_READY_TO_FINALIZE",
      "A location is required before confirming or authorizing an operating-hours exception.",
    );
  }
  const existing = inquiry.bookings[0] ?? null;
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
  const payload = readEventPlanPayload(sourcePlan?.payload ?? existing?.payload);
  const durationMinutes =
    sourcePlan?.durationMinutes ??
    payload.durationMinutes ??
    ((existing?.endMinute ?? 0) - (existing?.startMinute ?? 0));
  const window = localEventWindow({
    date: payload.eventDate,
    startTime: payload.startTime,
    durationMinutes,
  });
  if (!window || !payload.eventDate || !payload.startTime) {
    throw new BookingError("NOT_READY_TO_FINALIZE", "A date and start time are required.");
  }
  const timeZone = resolveSchedulingTimeZone({
    locationTimeZone: inquiry.location.timezone,
    organizationTimeZone: inquiry.organization.timezone,
  });
  const hoursProbe = await evaluateWritableOccupancy({
    database,
    organizationId: ctx.organizationId,
    locationId: inquiry.locationId,
    timeZone,
    slotDate: window.slotDate,
    startMinute: window.startMinute,
    endMinute: window.endMinute,
    flow: "confirmation_readiness",
    consumeException: false,
  });
  return {
    inquiryId: inquiry.id,
    bookingId: existing?.id ?? null,
    locationId: inquiry.locationId,
    locationName: inquiry.location.name,
    timeZone,
    slotDate: window.slotDate,
    startMinute: window.startMinute,
    endMinute: window.endMinute,
    startTime: payload.startTime,
    endTime: minutesToClock(window.endMinute),
    durationMinutes,
    operatingHoursStatus: hoursProbe.operatingHours.status,
    fingerprint: {
      organizationId: ctx.organizationId,
      locationId: inquiry.locationId,
      slotDate: window.slotDate,
      startMinute: window.startMinute,
      endMinute: window.endMinute,
      purpose: OPERATING_HOURS_EXCEPTION_PURPOSES.CONFIRM_BOOKING,
      inquiryId: inquiry.id,
      bookingId: existing?.id ?? null,
    },
  };
}

export async function getConfirmationReadiness(
  ctx: RequestContext,
  database: ReadinessDb,
  inquiryId: string,
): Promise<ConfirmationReadinessResult> {
  const canView = await hasPermission(ctx, PERMISSIONS.CRM_INQUIRIES_VIEW, database);
  const canAuthorize = await hasPermission(ctx, PERMISSIONS.EVENTS_CONFIRM, database);
  if (!canView && !canAuthorize) {
    await requirePermission(ctx, PERMISSIONS.CRM_INQUIRIES_VIEW, database);
  }

  const inquiry = await database.inquiry.findFirst({
    where: { id: inquiryId, organizationId: ctx.organizationId },
    include: {
      organization: { select: { timezone: true, currency: true, depositPercent: true } },
      location: { select: { id: true, name: true, timezone: true } },
      eventPlanRecommendations: true,
      bookings: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  if (!inquiry) {
    throw new InquiryError("PLAN_NOT_FOUND");
  }

  const booking = inquiry.bookings[0] ?? null;
  const bookingHref = booking ? `/app/bookings/${booking.id}` : null;
  const timeZone = resolveSchedulingTimeZone({
    locationTimeZone: inquiry.location?.timezone,
    organizationTimeZone: inquiry.organization.timezone,
  });
  const base = {
    inquiryId: inquiry.id,
    bookingId: booking?.id ?? null,
    bookingNumber: booking?.bookingNumber ?? null,
    bookingStatus: booking?.status ?? null,
    bookingHref,
    locationId: inquiry.locationId,
    locationName: inquiry.location?.name ?? null,
    timeZone,
    eventDate: null as string | null,
    startTime: null as string | null,
    endTime: null as string | null,
    startMinute: null as number | null,
    endMinute: null as number | null,
    operatingHoursStatus: null as OperatingHoursEvaluationStatus | null,
    activeException: null as ConfirmationHoursExceptionSummary | null,
    canAuthorizeHoursException: false,
    canRevokeHoursException: false,
    canConfirmWithCurrentException: false,
  };

  if (booking?.status === BOOKING_STATUSES.CONFIRMED) {
    return {
      ...base,
      state: CONFIRMATION_READINESS_STATES.ALREADY_CONFIRMED,
      headline: "Already confirmed",
      detail: `${booking.bookingNumber} is confirmed on the Master Schedule.`,
      blockers: [],
      confirmAttemptAllowed: false,
    };
  }
  if (booking?.status === BOOKING_STATUSES.CANCELLED) {
    return {
      ...base,
      state: CONFIRMATION_READINESS_STATES.CANCELLED,
      headline: "Booking cancelled",
      detail: "This booking was cancelled. Open a new booking if you need to book again.",
      blockers: [],
      confirmAttemptAllowed: false,
    };
  }

  const working =
    inquiry.eventPlanRecommendations.find((row) => row.id === inquiry.agentWorkingPlanId) ??
    inquiry.eventPlanRecommendations.find((row) => row.kind === EVENT_PLAN_KINDS.AGENT_WORKING);
  const selected = inquiry.eventPlanRecommendations.find((row) => row.id === inquiry.selectedEventPlanId);
  const sourcePlan = working ?? selected;
  const payload = sourcePlan || booking ? readEventPlanPayload(sourcePlan?.payload ?? booking?.payload) : null;
  const durationMinutes =
    sourcePlan?.durationMinutes ??
    payload?.durationMinutes ??
    (booking ? (booking.endMinute ?? 0) - (booking.startMinute ?? 0) : 0);

  const dataBlockers = bookingConfirmationBlockers({
    inquiryStatus: inquiry.status,
    workflowStage: inquiry.workflowStage,
    readyToFinalizeAt: inquiry.readyToFinalizeAt,
    selectedEventPlanId: inquiry.selectedEventPlanId ?? booking?.selectedEventPlanId ?? null,
    assignedUserProfileId: inquiry.assignedUserProfileId,
    workingPlan: sourcePlan && payload
      ? {
          availabilityStatus: sourcePlan.availabilityStatus ?? "AVAILABLE",
          estimatedTotalCents: sourcePlan.estimatedTotalCents ?? booking?.totalCents ?? null,
          payload,
        }
      : booking && payload
        ? {
            availabilityStatus: "AVAILABLE",
            estimatedTotalCents: booking.totalCents,
            payload,
          }
        : null,
    holds: [],
    hasFiniteRequirements: false,
  }).map(
    (message): ConfirmationReadinessBlocker => ({
      code: "MISSING_BOOKING_DATA",
      message,
      overridableWithHoursException: false,
    }),
  );

  if (!payload || !payload.eventDate || !payload.startTime || durationMinutes < 30) {
    return {
      ...base,
      state: CONFIRMATION_READINESS_STATES.BLOCKED_DATA,
      headline: "Finish required booking details",
      detail: dataBlockers[0]?.message ?? "A date, start time, and plan are required before confirmation.",
      blockers: dataBlockers.length
        ? dataBlockers
        : [
            {
              code: "MISSING_BOOKING_DATA",
              message: "A date, start time, and plan are required before confirmation.",
              overridableWithHoursException: false,
            },
          ],
      confirmAttemptAllowed: false,
    };
  }

  const window = localEventWindow({
    date: payload.eventDate,
    startTime: payload.startTime,
    durationMinutes,
  });
  if (!window) {
    return {
      ...base,
      eventDate: payload.eventDate,
      startTime: payload.startTime,
      state: CONFIRMATION_READINESS_STATES.BLOCKED_DATA,
      headline: "Finish required booking details",
      detail: "A valid event date and start time are required.",
      blockers: [
        {
          code: "MISSING_BOOKING_DATA",
          message: "A valid event date and start time are required.",
          overridableWithHoursException: false,
        },
      ],
      confirmAttemptAllowed: false,
    };
  }

  const hoursEval = await evaluateWritableOccupancy({
    database,
    organizationId: ctx.organizationId,
    locationId: inquiry.locationId,
    timeZone,
    slotDate: window.slotDate,
    startMinute: window.startMinute,
    endMinute: window.endMinute,
    flow: "confirmation_readiness",
    consumeException: false,
  });

  const now = new Date();
  const fingerprint: HoursExceptionFingerprint | null = inquiry.locationId
    ? {
        organizationId: ctx.organizationId,
        locationId: inquiry.locationId,
        slotDate: window.slotDate,
        startMinute: window.startMinute,
        endMinute: window.endMinute,
        purpose: OPERATING_HOURS_EXCEPTION_PURPOSES.CONFIRM_BOOKING,
        inquiryId: inquiry.id,
        bookingId: booking?.id ?? null,
      }
    : null;
  const activeExceptionRow =
    fingerprint == null
      ? null
      : await findActiveHoursException(database, {
          fingerprint,
          expectedStatus: hoursEval.operatingHours.status,
          now,
        });
  const activeException = activeExceptionRow ? summarizeException(activeExceptionRow, now) : null;

  const blockers: ConfirmationReadinessBlocker[] = [...dataBlockers];
  if (hoursEval.ok === false) {
    blockers.push({
      code: hoursEval.code,
      message: hoursEval.reason,
      overridableWithHoursException: isOverridableOperatingHoursStatus(hoursEval.operatingHours.status),
    });
  }

  const inventory = await database.resourceType.findMany({
    where: { organizationId: ctx.organizationId },
    select: {
      id: true,
      _count: { select: { resources: { where: resourcesInLocationWhere(inquiry.locationId) } } },
    },
  });
  const requirements = stampPlanResourceWindows(
    payload,
    applyInventoryFeasibility(
      payload.resourceRequirements ?? [],
      inventory.map((row) => ({ id: row.id, activeCount: row._count.resources })),
    ),
  );
  const needsInventory = requirements.some(
    (row) =>
      row.quantity != null &&
      row.quantity > 0 &&
      (!row.inventoryConfigured || row.requiresStaffConfiguration || !row.resourceTypeId),
  );
  if (needsInventory) {
    blockers.push({
      code: "INVENTORY_NOT_CONFIGURED",
      message: "Add numbered inventory in Resources before confirmation can allocate rooms or lanes.",
      overridableWithHoursException: false,
    });
  }

  const hoursStatus = hoursEval.operatingHours.status;
  const hoursNeedsException =
    hoursEval.ok === false && isOverridableOperatingHoursStatus(hoursStatus) && !activeException;
  const exceptionCoversHours =
    Boolean(activeException && activeException.status === "ACTIVE") &&
    hoursEval.ok === false &&
    isOverridableOperatingHoursStatus(hoursStatus);
  const hoursAcceptable = hoursEval.ok === true || exceptionCoversHours;

  let resourceConflict = false;
  if (
    hoursAcceptable &&
    !needsInventory &&
    requirements.some((row) => row.quantity != null && row.quantity > 0)
  ) {
    const stampedRequirements = stampPlanResourceWindows(
      {
        ...payload,
        itinerary: shiftItineraryToStart(payload.itinerary ?? [], payload.startTime),
      },
      requirements,
    );
    const availability = await checkResourceAvailability(database as PrismaClient, {
      organizationId: ctx.organizationId,
      locationId: inquiry.locationId,
      date: window.slotDate,
      startTime: payload.startTime,
      durationMinutes,
      resourceRequirements: stampedRequirements,
      excludeInquiryId: inquiry.id,
    });
    if (availability.validated && !availability.available) {
      resourceConflict = true;
      blockers.push({
        code: "RESOURCE_CONFLICT",
        message: availability.note || "Required resources look unavailable for this time.",
        overridableWithHoursException: false,
      });
    }
  }

  const canAuthorizeHoursException =
    canAuthorize &&
    Boolean(fingerprint) &&
    hoursEval.ok === false &&
    isOverridableOperatingHoursStatus(hoursStatus) &&
    !activeException;

  let state: ConfirmationReadinessState;
  let headline: string;
  let detail: string;
  let confirmAttemptAllowed = false;

  if (
    hoursEval.ok === false &&
    hoursStatus === OPERATING_HOURS_EVALUATION_STATUSES.INVALID_LOCAL_TIME
  ) {
    state = CONFIRMATION_READINESS_STATES.BLOCKED_INVALID_LOCAL_TIME;
    headline = "Invalid or ambiguous local time";
    detail = hoursEval.reason;
  } else if (dataBlockers.length > 0) {
    state = CONFIRMATION_READINESS_STATES.BLOCKED_DATA;
    headline = "Finish required booking details";
    detail = dataBlockers[0]!.message;
  } else if (needsInventory) {
    state = CONFIRMATION_READINESS_STATES.BLOCKED_INVENTORY;
    headline = "Inventory setup required";
    detail = "Add numbered inventory in Resources before confirmation can allocate rooms or lanes.";
  } else if (resourceConflict) {
    state = CONFIRMATION_READINESS_STATES.BLOCKED_RESOURCE_CONFLICT;
    headline = "Resource conflict";
    detail =
      "Required resources look unavailable. An operating-hours exception cannot override inventory conflicts. Recheck the schedule, then try again.";
  } else if (hoursNeedsException) {
    if (hoursStatus === OPERATING_HOURS_EVALUATION_STATUSES.HOURS_UNCONFIGURED) {
      state = CONFIRMATION_READINESS_STATES.BLOCKED_HOURS_UNCONFIGURED;
      headline = "Operating hours are not configured";
      detail =
        "This location has no verified operating-hours policy. Confirmation is blocked until hours are approved or an authorized staff exception is recorded for this exact event.";
    } else if (hoursStatus === OPERATING_HOURS_EVALUATION_STATUSES.HOURS_UNVERIFIED) {
      state = CONFIRMATION_READINESS_STATES.BLOCKED_HOURS_UNVERIFIED;
      headline = "Operating hours are not verified";
      detail =
        "Operating hours exist but are not verified. Confirmation requires verification or an authorized staff exception for this exact event.";
    } else {
      state = CONFIRMATION_READINESS_STATES.BLOCKED_OUTSIDE_HOURS;
      headline = "Outside approved operating hours";
      detail = hoursEval.ok === false ? hoursEval.reason : "This event falls outside approved operating hours.";
    }
  } else if (exceptionCoversHours) {
    state = CONFIRMATION_READINESS_STATES.READY_WITH_EXCEPTION;
    headline = "Authorized hours exception ready";
    detail =
      "A matching one-time staff exception is active. Confirmation will recheck availability and consume the exception only if the booking succeeds.";
    confirmAttemptAllowed = canAuthorize;
  } else {
    state = CONFIRMATION_READINESS_STATES.NEEDS_FINAL_VALIDATION;
    headline = "Needs final validation";
    detail =
      "Details look complete and hours look acceptable. Confirmation will recheck availability and allocate resources transactionally.";
    confirmAttemptAllowed = canAuthorize;
  }

  return {
    ...base,
    eventDate: window.slotDate,
    startTime: payload.startTime,
    endTime: minutesToClock(window.endMinute),
    startMinute: window.startMinute,
    endMinute: window.endMinute,
    operatingHoursStatus: hoursStatus,
    state,
    headline,
    detail,
    blockers,
    activeException,
    canAuthorizeHoursException,
    canRevokeHoursException:
      canAuthorize && Boolean(activeException && activeException.status === "ACTIVE"),
    canConfirmWithCurrentException: exceptionCoversHours && canAuthorize,
    confirmAttemptAllowed,
  };
}
