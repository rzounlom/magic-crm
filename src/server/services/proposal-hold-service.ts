import type { PrismaClient } from "@/generated/prisma/client";

import { occupancyInstants, resolveSchedulingTimeZone } from "@/lib/inquiries/tenant-datetime";
import { readEventPlanPayload } from "@/lib/event-planner/payload";
import { READY_FOR_HUMAN_REASONS } from "@/lib/inquiries/ready-for-human-reason";
import { depositPercentFromTenant, depositRequiredCents } from "@/server/catalog/pricing";
import { InquiryError, ResourceError } from "@/server/errors";
import { resolveInquiryLocationId } from "@/server/locations/primary-location";
import { applyInventoryFeasibility } from "@/server/resources/feasibility";
import { resourcesInLocationWhere } from "@/server/resources/location-scope";
import { applyRotationWindows } from "@/server/resources/rotation-windows";
import { localEventWindow, minutesToClock, parseClockToMinutes } from "@/server/resources/time-window";
import { recordAuditEvent } from "@/server/services/audit";
import {
  checkResourceAvailability,
  isReservationOverlapError,
  listAvailableResourceIds,
  releaseExpiredHolds,
} from "@/server/services/resource-availability-service";
import { INQUIRY_SALES_STAGES, INQUIRY_STATUSES, INQUIRY_WORKFLOW_STAGES } from "@/types/inquiry";
import type { EventPlanPayload } from "@/types/event-planner";
import {
  DEFAULT_HOLD_HOURS,
  RESOURCE_RESERVATION_SOURCES,
  RESOURCE_RESERVATION_STATUSES,
  type PlanResourceRequirement,
  type ProposalHoldResult,
} from "@/types/resource-schedule";

type HoldDb = PrismaClient;

type HoldAssignment = {
  resourceId: string;
  startMinute: number;
  endMinute: number;
};

function requirementWindow(
  requirement: PlanResourceRequirement,
  fallback: { slotDate: string; startMinute: number; endMinute: number },
) {
  if (!requirement.windowStartTime || !requirement.windowEndTime) {
    return fallback;
  }
  const startMinute = parseClockToMinutes(requirement.windowStartTime);
  const endMinute = parseClockToMinutes(requirement.windowEndTime);
  if (startMinute == null || endMinute == null || endMinute <= startMinute) {
    return fallback;
  }
  return { slotDate: fallback.slotDate, startMinute, endMinute };
}

export function activeHoldWhere(organizationId: string, inquiryId: string, now: Date) {
  return {
    organizationId,
    inquiryId,
    status: RESOURCE_RESERVATION_STATUSES.HOLD,
    releasedAt: null,
    OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
  };
}

export async function assignExactResourcesForRequirements(
  database: HoldDb,
  input: {
    organizationId: string;
    locationId?: string | null;
    window: { slotDate: string; startMinute: number; endMinute: number };
    requirements: PlanResourceRequirement[];
    excludeInquiryId?: string | null;
    preferredResourceIds?: string[];
    now?: Date;
  },
): Promise<HoldAssignment[]> {
  const assigned: HoldAssignment[] = [];
  const preferred = new Set(input.preferredResourceIds ?? []);
  for (const requirement of input.requirements) {
    if (!requirement.resourceTypeId || requirement.quantity == null || requirement.quantity < 1) {
      throw new ResourceError(
        "INVALID_RESOURCE",
        `${requirement.resourceTypeName} still needs resource configuration before a hold can be placed.`,
      );
    }
    if (!requirement.inventoryConfigured || requirement.requiresStaffConfiguration) {
      throw new ResourceError(
        "INVALID_RESOURCE",
        `${requirement.resourceTypeName} inventory is not configured.`,
      );
    }
    const window = requirementWindow(requirement, input.window);
    const units = await database.resource.findMany({
      where: {
        organizationId: input.organizationId,
        resourceTypeId: requirement.resourceTypeId,
        ...resourcesInLocationWhere(input.locationId),
      },
      select: { id: true },
      orderBy: { displayOrder: "asc" },
    });
    const available = await listAvailableResourceIds(database, {
      organizationId: input.organizationId,
      resourceIds: units.map((row) => row.id),
      window,
      excludeInquiryId: input.excludeInquiryId,
      now: input.now,
    });
    const preferredAvailable = available.filter((id) => preferred.has(id));
    const rest = available.filter((id) => !preferred.has(id));
    const chosen = [...preferredAvailable, ...rest].slice(0, requirement.quantity);
    if (chosen.length < requirement.quantity) {
      throw new ResourceError(
        "RESOURCE_CONFLICT",
        `Only ${available.length} ${requirement.resourceTypeName}${available.length === 1 ? "" : "s"} are available for ${requirement.windowStartTime ?? minutesToClock(window.startMinute)}–${requirement.windowEndTime ?? minutesToClock(window.endMinute)}; this plan requires ${requirement.quantity}.`,
      );
    }
    assigned.push(
      ...chosen.map((resourceId) => ({
        resourceId,
        startMinute: window.startMinute,
        endMinute: window.endMinute,
      })),
    );
  }
  return assigned;
}

async function loadHoldResult(
  database: HoldDb,
  input: {
    organizationId: string;
    inquiryId: string;
    plan: { id: string; title: string; estimatedTotalCents: number | null; currency: string; payload: unknown };
    expiresAt: Date;
    reused: boolean;
  },
): Promise<ProposalHoldResult> {
  const inquiry = await database.inquiry.findFirstOrThrow({
    where: { id: input.inquiryId, organizationId: input.organizationId },
    include: {
      organization: { select: { depositPercent: true, timezone: true, currency: true } },
      location: { select: { id: true, name: true, timezone: true } },
    },
  });
  const holds = await database.resourceReservation.findMany({
    where: activeHoldWhere(input.organizationId, input.inquiryId, new Date()),
    include: {
      resource: { select: { id: true, name: true, resourceType: { select: { name: true } } } },
    },
    orderBy: [{ startMinute: "asc" }, { createdAt: "asc" }],
  });
  const payload = readEventPlanPayload(input.plan.payload);
  const window = localEventWindow({
    date: payload.eventDate,
    startTime: payload.startTime,
    durationMinutes: payload.durationMinutes,
  });
  const timeZone = resolveSchedulingTimeZone({
    locationTimeZone: inquiry.location?.timezone,
    organizationTimeZone: inquiry.organization.timezone,
  });
  const instants = window
    ? occupancyInstants({ ...window, timeZone })
    : { startsAt: input.expiresAt, endsAt: input.expiresAt };
  const depositPercent = depositPercentFromTenant(inquiry.organization.depositPercent);
  const subtotalCents = input.plan.estimatedTotalCents ?? 0;
  return {
    reused: input.reused,
    inquiryId: inquiry.id,
    proposalId: input.plan.id,
    organizationId: inquiry.organizationId,
    locationId: inquiry.locationId,
    locationName: inquiry.location?.name ?? null,
    holdExpiresAt: holds[0]?.expiresAt ?? input.expiresAt,
    eventDate: payload.eventDate ?? "",
    startTime: payload.startTime ?? "",
    endTime: window ? minutesToClock(window.endMinute) : "",
    startsAt: holds[0]?.startsAt ?? instants.startsAt,
    endsAt: holds[0]?.endsAt ?? instants.endsAt,
    resourceCount: holds.length,
    resources: holds.map((row) => ({
      resourceId: row.resourceId,
      resourceName: row.resource.name,
      resourceTypeName: row.resource.resourceType.name,
      startMinute: row.startMinute,
      endMinute: row.endMinute,
    })),
    packageTitle: input.plan.title,
    subtotalCents,
    depositRequiredCents: depositRequiredCents(subtotalCents, depositPercent),
    depositPercent,
    currency: input.plan.currency || inquiry.organization.currency,
    itinerary: payload.itinerary?.map((row) => `${row.startTime}–${row.endTime} ${row.label}`) ?? payload.schedule,
    lineItemNames: [
      ...payload.activities.map((row) => row.name),
      payload.dining.label,
      ...payload.spaces.map((row) => row.name),
    ].filter((name) => name.trim().length > 0),
    customer: {
      firstName: inquiry.customerFirstName,
      lastName: inquiry.customerLastName,
      email: inquiry.customerEmail,
      groupName: inquiry.customerGroupName,
    },
  };
}

/**
 * Canonical 24-hour HOLD for a persisted proposal snapshot.
 * Public customer acceptance and staff Place Hold both call this.
 * Inserts exact physical Resource rows in one transaction; PostgreSQL gist exclusion
 * rejects overlapping active occupancy. Inquiry selection is committed in the same transaction.
 */
export async function placeProposalHold(
  database: HoldDb,
  input: {
    organizationId: string;
    inquiryId: string;
    planId: string;
    actorUserProfileId?: string | null;
    now?: Date;
    holdHours?: number;
    selectPlan?: boolean;
  },
): Promise<ProposalHoldResult> {
  const now = input.now ?? new Date();
  await releaseExpiredHolds(database, input.organizationId, now);

  const inquiry = await database.inquiry.findFirst({
    where: { id: input.inquiryId, organizationId: input.organizationId },
    include: {
      eventPlanRecommendations: true,
      organization: { select: { timezone: true, depositPercent: true, currency: true } },
      location: { select: { id: true, name: true, timezone: true } },
    },
  });
  if (!inquiry) {
    throw new ResourceError("RESOURCE_NOT_FOUND");
  }
  if (inquiry.status === INQUIRY_STATUSES.BOOKED) {
    throw new InquiryError("INQUIRY_ALREADY_BOOKED");
  }

  const plan = inquiry.eventPlanRecommendations.find((row) => row.id === input.planId);
  if (!plan || plan.organizationId !== input.organizationId || plan.inquiryId !== inquiry.id) {
    throw new InquiryError("PLAN_NOT_FOUND");
  }

  const existingHolds = await database.resourceReservation.findMany({
    where: activeHoldWhere(input.organizationId, inquiry.id, now),
    select: { id: true },
  });
  if (existingHolds.length > 0) {
    if (input.selectPlan && (!inquiry.selectedEventPlanId || inquiry.selectedEventPlanId === plan.id)) {
      return loadHoldResult(database, {
        organizationId: input.organizationId,
        inquiryId: inquiry.id,
        plan,
        expiresAt: new Date(now.getTime() + DEFAULT_HOLD_HOURS * 60 * 60 * 1000),
        reused: true,
      });
    }
    throw new ResourceError(
      "INVALID_RESOURCE",
      "A resource hold is already in place for this inquiry. Release it before placing a new one.",
    );
  }
  if (input.selectPlan && inquiry.selectedEventPlanId && inquiry.selectedEventPlanId !== plan.id) {
    throw new InquiryError("PLAN_ALREADY_CONSUMED");
  }

  const payload = plan.payload as EventPlanPayload;
  const date = payload.eventDate;
  const startTime = payload.startTime;
  const durationMinutes = plan.durationMinutes ?? payload.durationMinutes;
  const window = localEventWindow({ date, startTime, durationMinutes });
  if (!window || !date || !startTime) {
    throw new ResourceError("INVALID_RESOURCE", "A date and start time are required before placing a hold.");
  }
  const locationId = await resolveInquiryLocationId(database, inquiry);
  const timeZone = resolveSchedulingTimeZone({
    locationTimeZone: inquiry.location?.timezone,
    organizationTimeZone: inquiry.organization.timezone,
  });
  const inventory = await database.resourceType.findMany({
    where: { organizationId: input.organizationId },
    select: { id: true, _count: { select: { resources: { where: resourcesInLocationWhere(locationId) } } } },
  });
  const requirements = applyRotationWindows(
    applyInventoryFeasibility(
      payload.resourceRequirements ?? [],
      inventory.map((row) => ({ id: row.id, activeCount: row._count.resources })),
    ),
    payload,
  );
  if (requirements.length === 0) {
    throw new ResourceError("INVALID_RESOURCE", "This plan has no finite resources to hold.");
  }
  const availability = await checkResourceAvailability(database, {
    organizationId: input.organizationId,
    locationId,
    date,
    startTime,
    durationMinutes,
    resourceRequirements: requirements,
    excludeInquiryId: inquiry.id,
    now,
  });
  if (!availability.validated || !availability.available) {
    throw new ResourceError("RESOURCE_CONFLICT");
  }

  const hours = input.holdHours && input.holdHours > 0 ? input.holdHours : DEFAULT_HOLD_HOURS;
  const expiresAt = new Date(now.getTime() + hours * 60 * 60 * 1000);
  let resourceCount = 0;
  try {
    await database.$transaction(async (tx) => {
      await tx.$executeRaw`
        SELECT id FROM inquiries
        WHERE id = ${inquiry.id} AND "organizationId" = ${input.organizationId}
        FOR UPDATE
      `;
      const lockedHolds = await tx.resourceReservation.findMany({
        where: activeHoldWhere(input.organizationId, inquiry.id, now),
        select: { id: true },
      });
      if (lockedHolds.length > 0) {
        throw new ResourceError("INVALID_RESOURCE", "HOLD_ALREADY_EXISTS");
      }
      const assignments = await assignExactResourcesForRequirements(tx as HoldDb, {
        organizationId: input.organizationId,
        locationId,
        window,
        requirements,
        excludeInquiryId: inquiry.id,
        now,
      });
      if (assignments.length === 0) {
        throw new ResourceError("RESOURCE_CONFLICT");
      }
      resourceCount = assignments.length;
      const units = await tx.resource.findMany({
        where: { id: { in: assignments.map((row) => row.resourceId) }, organizationId: input.organizationId },
        select: { id: true, locationId: true },
      });
      const locationByResource = new Map(units.map((row) => [row.id, row.locationId]));
      await tx.resourceReservation.createMany({
        data: assignments.map((assignment) => {
          const assignmentInstants = occupancyInstants({
            slotDate: window.slotDate,
            startMinute: assignment.startMinute,
            endMinute: assignment.endMinute,
            timeZone,
          });
          return {
            organizationId: input.organizationId,
            locationId: locationByResource.get(assignment.resourceId) ?? locationId,
            resourceId: assignment.resourceId,
            status: RESOURCE_RESERVATION_STATUSES.HOLD,
            slotDate: new Date(`${window.slotDate}T00:00:00.000Z`),
            startMinute: assignment.startMinute,
            endMinute: assignment.endMinute,
            startsAt: assignmentInstants.startsAt,
            endsAt: assignmentInstants.endsAt,
            inquiryId: inquiry.id,
            sourceType: RESOURCE_RESERVATION_SOURCES.INQUIRY,
            expiresAt,
            reason: `Hold for ${plan.title}`,
            createdByUserProfileId: input.actorUserProfileId ?? null,
          };
        }),
      });
      await tx.inquiry.update({
        where: { id: inquiry.id },
        data: {
          ...(input.selectPlan
            ? {
                selectedEventPlanId: plan.id,
                customerSelectedAt: inquiry.customerSelectedAt ?? now,
                status: INQUIRY_STATUSES.READY_FOR_HUMAN,
                aiHandlingEnabled: false,
                humanHandoffRequestedAt: inquiry.humanHandoffRequestedAt ?? now,
                humanHandoffReason: READY_FOR_HUMAN_REASONS.CUSTOMER_SELECTED_PLAN,
                internalSummary: `Customer reserved ${plan.title} (${plan.tier}) for 24 hours. Deposit is not collected yet.`,
              }
            : {}),
          salesStage: INQUIRY_SALES_STAGES.HOLD_PLACED,
          workflowStage: INQUIRY_WORKFLOW_STAGES.HOLD_PLACED,
        },
      });
      await tx.eventPlanRecommendation.update({
        where: { id: plan.id },
        data: {
          availabilityValidated: true,
          availabilityNote: availability.note,
          availabilityStatus: "AVAILABLE",
          availabilityCheckedAt: now,
        },
      });
    });
  } catch (error) {
    const existingAfterRace = await database.resourceReservation.findMany({
      where: activeHoldWhere(input.organizationId, inquiry.id, now),
      select: { id: true },
    });
    if (existingAfterRace.length > 0 && input.selectPlan) {
      const current = await database.inquiry.findFirst({
        where: { id: inquiry.id, organizationId: input.organizationId },
        select: { selectedEventPlanId: true },
      });
      if (!current?.selectedEventPlanId || current.selectedEventPlanId === plan.id) {
        return loadHoldResult(database, {
          organizationId: input.organizationId,
          inquiryId: inquiry.id,
          plan,
          expiresAt,
          reused: true,
        });
      }
    }
    if (error instanceof ResourceError && error.message === "HOLD_ALREADY_EXISTS") {
      if (input.selectPlan) {
        return loadHoldResult(database, {
          organizationId: input.organizationId,
          inquiryId: inquiry.id,
          plan,
          expiresAt,
          reused: true,
        });
      }
      throw new ResourceError(
        "INVALID_RESOURCE",
        "A resource hold is already in place for this inquiry. Release it before placing a new one.",
      );
    }
    await recordAuditEvent(database, {
      organizationId: input.organizationId,
      actorUserProfileId: input.actorUserProfileId,
      action: "resource.hold_conflict_rejected",
      resourceType: "inquiry",
      resourceId: inquiry.id,
      metadata: { planId: plan.id },
    });
    if (error instanceof ResourceError || error instanceof InquiryError) {
      throw error;
    }
    if (isReservationOverlapError(error)) {
      throw new ResourceError("RESOURCE_CONFLICT");
    }
    throw error;
  }

  await recordAuditEvent(database, {
    organizationId: input.organizationId,
    actorUserProfileId: input.actorUserProfileId,
    action: "resource.hold_created",
    resourceType: "inquiry",
    resourceId: inquiry.id,
    metadata: {
      planId: plan.id,
      resourceCount,
      holdExpiresAt: expiresAt.toISOString(),
      startTime,
      endTime: minutesToClock(window.endMinute),
    },
  });
  await recordAuditEvent(database, {
    organizationId: input.organizationId,
    actorUserProfileId: input.actorUserProfileId,
    action: "inquiry.plan_reserved",
    resourceType: "inquiry",
    resourceId: inquiry.id,
    metadata: { planId: plan.id, resourceCount },
  });

  return loadHoldResult(database, {
    organizationId: input.organizationId,
    inquiryId: inquiry.id,
    plan,
    expiresAt,
    reused: false,
  });
}

/**
 * Idempotent expiry. BOOKED reservations are never released. Already-expired rows are no-ops.
 */
export async function expireHold(
  database: HoldDb,
  input: { organizationId: string; reservationId?: string; inquiryId?: string; now?: Date },
): Promise<{ expiredCount: number }> {
  const now = input.now ?? new Date();
  if (input.reservationId) {
    const row = await database.resourceReservation.findFirst({
      where: { id: input.reservationId, organizationId: input.organizationId },
    });
    if (!row) {
      return { expiredCount: 0 };
    }
    if (row.status === RESOURCE_RESERVATION_STATUSES.BOOKED) {
      return { expiredCount: 0 };
    }
    if (row.releasedAt || row.status !== RESOURCE_RESERVATION_STATUSES.HOLD) {
      return { expiredCount: 0 };
    }
    if (!row.expiresAt || row.expiresAt.getTime() > now.getTime()) {
      return { expiredCount: 0 };
    }
  }
  const count = await releaseExpiredHolds(database, input.organizationId, now);
  return { expiredCount: count };
}

/** Development/test helper: mark inquiry HOLDs due immediately, then run the same expiry path. */
export async function expireInquiryHoldsNow(
  database: HoldDb,
  input: { organizationId: string; inquiryId: string; now?: Date },
): Promise<{ expiredCount: number }> {
  const now = input.now ?? new Date();
  const holds = await database.resourceReservation.findMany({
    where: {
      organizationId: input.organizationId,
      inquiryId: input.inquiryId,
      status: RESOURCE_RESERVATION_STATUSES.HOLD,
      releasedAt: null,
    },
    select: { id: true, status: true },
  });
  const holdIds = holds.filter((row) => row.status !== RESOURCE_RESERVATION_STATUSES.BOOKED).map((row) => row.id);
  if (holdIds.length === 0) {
    return { expiredCount: 0 };
  }
  await database.resourceReservation.updateMany({
    where: {
      id: { in: holdIds },
      organizationId: input.organizationId,
      status: RESOURCE_RESERVATION_STATUSES.HOLD,
    },
    data: { expiresAt: now },
  });
  const expiredCount = await releaseExpiredHolds(database, input.organizationId, now);
  return { expiredCount };
}
