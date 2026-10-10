/**
 * Advisory HOLD readiness for staff UI.
 * Final HOLD placement always revalidates inside placeProposalHold / placeInquiryPlanHold.
 */
import type { Prisma, PrismaClient } from "@/generated/prisma/client";

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
import { INQUIRY_STATUSES, EVENT_PLAN_KINDS } from "@/types/inquiry";
import {
  HOLD_READINESS_STATES,
  type HoldActiveSummary,
  type HoldHoursExceptionSummary,
  type HoldReadinessBlocker,
  type HoldReadinessResult,
  type HoldReadinessState,
} from "@/types/hold-readiness";
import {
  OPERATING_HOURS_EVALUATION_STATUSES,
  OPERATING_HOURS_EXCEPTION_PURPOSES,
  type OperatingHoursEvaluationStatus,
} from "@/types/operating-hours";
import { RESOURCE_RESERVATION_STATUSES } from "@/types/resource-schedule";
import { PERMISSIONS } from "@/types/permissions";

type ReadinessDb = PrismaClient | Prisma.TransactionClient;

export type HoldOccupancyContext = {
  inquiryId: string;
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
): HoldHoursExceptionSummary {
  let status: HoldHoursExceptionSummary["status"] = "ACTIVE";
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

function formatRequirementWindow(start: string | null | undefined, end: string | null | undefined) {
  if (!start || !end) {
    return null;
  }
  return `${start}–${end}`;
}

/**
 * Resolve the PLACE_HOLD occupancy fingerprint from trusted inquiry/plan data.
 * Does not trust client-supplied date/time/location fields.
 */
export async function resolveHoldOccupancyContext(
  ctx: RequestContext,
  database: ReadinessDb,
  inquiryId: string,
): Promise<HoldOccupancyContext> {
  await requirePermission(ctx, PERMISSIONS.EVENTS_CONFIRM, database);
  const inquiry = await database.inquiry.findFirst({
    where: { id: inquiryId, organizationId: ctx.organizationId },
    include: {
      organization: { select: { timezone: true } },
      location: { select: { id: true, name: true, timezone: true } },
      eventPlanRecommendations: true,
    },
  });
  if (!inquiry) {
    throw new InquiryError("PLAN_NOT_FOUND");
  }
  if (!inquiry.locationId || !inquiry.location) {
    throw new BookingError(
      "NOT_READY_TO_FINALIZE",
      "A location is required before placing a hold or authorizing an operating-hours exception.",
    );
  }
  const working =
    inquiry.eventPlanRecommendations.find((row) => row.id === inquiry.agentWorkingPlanId) ??
    inquiry.eventPlanRecommendations.find((row) => row.kind === EVENT_PLAN_KINDS.AGENT_WORKING);
  const selected = inquiry.eventPlanRecommendations.find((row) => row.id === inquiry.selectedEventPlanId);
  const sourcePlan = working ?? selected;
  if (!sourcePlan) {
    throw new BookingError(
      "NOT_READY_TO_FINALIZE",
      "Select or start working from an event plan before placing a hold.",
    );
  }
  const payload = readEventPlanPayload(sourcePlan.payload);
  const durationMinutes = sourcePlan.durationMinutes ?? payload.durationMinutes;
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
    flow: "hold_readiness",
    consumeException: false,
  });
  return {
    inquiryId: inquiry.id,
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
      purpose: OPERATING_HOURS_EXCEPTION_PURPOSES.PLACE_HOLD,
      inquiryId: inquiry.id,
      bookingId: null,
    },
  };
}

export async function getHoldReadiness(
  ctx: RequestContext,
  database: ReadinessDb,
  inquiryId: string,
): Promise<HoldReadinessResult> {
  const canView = await hasPermission(ctx, PERMISSIONS.CRM_INQUIRIES_VIEW, database);
  const canAuthorize = await hasPermission(ctx, PERMISSIONS.EVENTS_CONFIRM, database);
  const canPlace = await hasPermission(ctx, PERMISSIONS.EVENTS_CREATE, database);
  if (!canView && !canAuthorize && !canPlace) {
    await requirePermission(ctx, PERMISSIONS.CRM_INQUIRIES_VIEW, database);
  }

  const inquiry = await database.inquiry.findFirst({
    where: { id: inquiryId, organizationId: ctx.organizationId },
    include: {
      organization: { select: { timezone: true } },
      location: { select: { id: true, name: true, timezone: true } },
      eventPlanRecommendations: true,
      bookings: { orderBy: { createdAt: "desc" }, take: 1 },
      resourceReservations: {
        where: {
          status: RESOURCE_RESERVATION_STATUSES.HOLD,
          releasedAt: null,
        },
        include: {
          resource: { select: { name: true, resourceType: { select: { name: true } } } },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!inquiry) {
    throw new InquiryError("PLAN_NOT_FOUND");
  }

  const now = new Date();
  const timeZone = resolveSchedulingTimeZone({
    locationTimeZone: inquiry.location?.timezone,
    organizationTimeZone: inquiry.organization.timezone,
  });
  const base = {
    inquiryId: inquiry.id,
    locationId: inquiry.locationId,
    locationName: inquiry.location?.name ?? null,
    timeZone,
    eventDate: null as string | null,
    startTime: null as string | null,
    endTime: null as string | null,
    startMinute: null as number | null,
    endMinute: null as number | null,
    operatingHoursStatus: null as OperatingHoursEvaluationStatus | null,
    activeException: null as HoldHoursExceptionSummary | null,
    activeHold: null as HoldActiveSummary | null,
    resourceAssignments: [] as HoldReadinessResult["resourceAssignments"],
    canAuthorizeHoursException: false,
    canRevokeHoursException: false,
    canHoldWithCurrentException: false,
  };

  if (inquiry.status === INQUIRY_STATUSES.BOOKED) {
    return {
      ...base,
      state: HOLD_READINESS_STATES.ALREADY_BOOKED,
      headline: "Already booked",
      detail: "This inquiry was converted to a booking. Resource holds are not placed for booked inquiries.",
      blockers: [],
      holdAttemptAllowed: false,
    };
  }

  const working =
    inquiry.eventPlanRecommendations.find((row) => row.id === inquiry.agentWorkingPlanId) ??
    inquiry.eventPlanRecommendations.find((row) => row.kind === EVENT_PLAN_KINDS.AGENT_WORKING);
  const selected = inquiry.eventPlanRecommendations.find((row) => row.id === inquiry.selectedEventPlanId);
  const sourcePlan = working ?? selected;
  const payload = sourcePlan ? readEventPlanPayload(sourcePlan.payload) : null;
  const durationMinutes = sourcePlan
    ? (sourcePlan.durationMinutes ?? payload?.durationMinutes ?? 0)
    : 0;

  const activeHoldRows = inquiry.resourceReservations.filter(
    (row) => !row.expiresAt || row.expiresAt.getTime() > now.getTime(),
  );
  const expiredHoldRows = inquiry.resourceReservations.filter(
    (row) => row.expiresAt && row.expiresAt.getTime() <= now.getTime(),
  );
  if (activeHoldRows.length > 0) {
    const soonest = activeHoldRows
      .map((row) => row.expiresAt)
      .filter((value): value is Date => Boolean(value))
      .sort((left, right) => left.getTime() - right.getTime())[0];
    const heldWindow =
      payload?.eventDate && payload.startTime && durationMinutes >= 30
        ? localEventWindow({
            date: payload.eventDate,
            startTime: payload.startTime,
            durationMinutes,
          })
        : null;
    return {
      ...base,
      eventDate: payload?.eventDate ?? null,
      startTime: payload?.startTime ?? null,
      endTime: heldWindow ? minutesToClock(heldWindow.endMinute) : null,
      startMinute: heldWindow?.startMinute ?? null,
      endMinute: heldWindow?.endMinute ?? null,
      state: HOLD_READINESS_STATES.ALREADY_HELD,
      headline: "Resources already held",
      detail: soonest
        ? `An active proposal HOLD is in place until ${soonest.toISOString()}. Release it before placing a new HOLD.`
        : "An active proposal HOLD is in place. Release it before placing a new HOLD.",
      activeHold: {
        resourceCount: activeHoldRows.length,
        resourceLabels: activeHoldRows.map(
          (row) => `${row.resource.name} (${row.resource.resourceType.name})`,
        ),
        expiresAt: soonest?.toISOString() ?? null,
        expired: false,
      },
      blockers: [],
      holdAttemptAllowed: false,
    };
  }

  if (!payload || !payload.eventDate || !payload.startTime || durationMinutes < 30) {
    return {
      ...base,
      state: HOLD_READINESS_STATES.BLOCKED_DATA,
      headline: "Finish required event details",
      detail: "A date, start time, and selected plan are required before placing a HOLD.",
      blockers: [
        {
          code: "MISSING_EVENT_DATA",
          message: "A date, start time, and selected plan are required before placing a HOLD.",
          overridableWithHoursException: false,
        },
      ],
      holdAttemptAllowed: false,
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
      state: HOLD_READINESS_STATES.BLOCKED_DATA,
      headline: "Finish required event details",
      detail: "A valid event date and start time are required.",
      blockers: [
        {
          code: "MISSING_EVENT_DATA",
          message: "A valid event date and start time are required.",
          overridableWithHoursException: false,
        },
      ],
      holdAttemptAllowed: false,
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
    flow: "hold_readiness",
    consumeException: false,
  });

  const fingerprint: HoursExceptionFingerprint | null = inquiry.locationId
    ? {
        organizationId: ctx.organizationId,
        locationId: inquiry.locationId,
        slotDate: window.slotDate,
        startMinute: window.startMinute,
        endMinute: window.endMinute,
        purpose: OPERATING_HOURS_EXCEPTION_PURPOSES.PLACE_HOLD,
        inquiryId: inquiry.id,
        bookingId: null,
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

  const blockers: HoldReadinessBlocker[] = [];
  if (expiredHoldRows.length > 0) {
    blockers.push({
      code: "HOLD_EXPIRED",
      message: "A previous HOLD expired. Place a new HOLD if resources are still needed.",
      overridableWithHoursException: false,
    });
  }
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
  const resourceAssignments = requirements.map((row) => ({
    resourceTypeName: row.resourceTypeName,
    quantity: row.quantity,
    windowLabel: formatRequirementWindow(row.windowStartTime, row.windowEndTime),
  }));

  if (requirements.length === 0) {
    blockers.push({
      code: "NO_FINITE_RESOURCES",
      message: "This plan has no finite resources to hold.",
      overridableWithHoursException: false,
    });
  }

  const needsInventory = requirements.some(
    (row) =>
      row.quantity != null &&
      row.quantity > 0 &&
      (!row.inventoryConfigured || row.requiresStaffConfiguration || !row.resourceTypeId),
  );
  if (needsInventory) {
    blockers.push({
      code: "INVENTORY_NOT_CONFIGURED",
      message: "Add numbered inventory in Resources before a HOLD can allocate rooms or lanes.",
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

  let state: HoldReadinessState;
  let headline: string;
  let detail: string;
  let holdAttemptAllowed = false;

  if (
    hoursEval.ok === false &&
    hoursStatus === OPERATING_HOURS_EVALUATION_STATUSES.INVALID_LOCAL_TIME
  ) {
    state = HOLD_READINESS_STATES.BLOCKED_INVALID_LOCAL_TIME;
    headline = "Invalid or ambiguous local time";
    detail = hoursEval.reason;
  } else if (requirements.length === 0) {
    state = HOLD_READINESS_STATES.BLOCKED_NO_RESOURCES;
    headline = "No resources to hold";
    detail = "This plan has no finite resources to hold.";
  } else if (needsInventory) {
    state = HOLD_READINESS_STATES.BLOCKED_INVENTORY;
    headline = "Inventory setup required";
    detail = "Add numbered inventory in Resources before a HOLD can allocate rooms or lanes.";
  } else if (resourceConflict) {
    state = HOLD_READINESS_STATES.BLOCKED_RESOURCE_CONFLICT;
    headline = "Resource conflict";
    detail =
      "Required resources look unavailable. An operating-hours exception cannot override inventory conflicts. Recheck the schedule, then try again.";
  } else if (hoursNeedsException) {
    if (hoursStatus === OPERATING_HOURS_EVALUATION_STATUSES.HOURS_UNCONFIGURED) {
      state = HOLD_READINESS_STATES.BLOCKED_HOURS_UNCONFIGURED;
      headline = "Operating hours are not configured";
      detail =
        "This location has no verified operating-hours policy. HOLD placement is blocked until hours are approved or an authorized staff exception is recorded for this exact event.";
    } else if (hoursStatus === OPERATING_HOURS_EVALUATION_STATUSES.HOURS_UNVERIFIED) {
      state = HOLD_READINESS_STATES.BLOCKED_HOURS_UNVERIFIED;
      headline = "Operating hours are not verified";
      detail =
        "Operating hours exist but are not verified. HOLD placement requires verification or an authorized staff exception for this exact event.";
    } else {
      state = HOLD_READINESS_STATES.BLOCKED_OUTSIDE_HOURS;
      headline = "Outside approved operating hours";
      detail = hoursEval.ok === false ? hoursEval.reason : "This event falls outside approved operating hours.";
    }
  } else if (exceptionCoversHours) {
    state = HOLD_READINESS_STATES.READY_WITH_EXCEPTION;
    headline = "Authorized hours exception ready";
    detail =
      "A matching one-time staff exception is active. HOLD placement will recheck availability and consume the exception only if the HOLD succeeds.";
    holdAttemptAllowed = canPlace;
  } else {
    state = HOLD_READINESS_STATES.NEEDS_FINAL_VALIDATION;
    headline = "Needs final validation";
    detail =
      "Details look complete and hours look acceptable. HOLD placement will recheck availability and allocate resources transactionally. Advisory checks are not a guarantee.";
    holdAttemptAllowed = canPlace;
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
    resourceAssignments,
    canAuthorizeHoursException,
    canRevokeHoursException:
      canAuthorize && Boolean(activeException && activeException.status === "ACTIVE"),
    canHoldWithCurrentException: exceptionCoversHours && canPlace,
    holdAttemptAllowed,
  };
}
