import type { PrismaClient } from "@/generated/prisma/client";

import { ResourceError } from "@/server/errors";
import { requirePermission } from "@/server/policies/require-permission";
import type { RequestContext } from "@/server/request-context";
import { applyInventoryFeasibility } from "@/server/resources/feasibility";
import { localEventWindow, parseClockToMinutes } from "@/server/resources/time-window";
import { recordAuditEvent } from "@/server/services/audit";
import {
  checkResourceAvailability,
  isReservationOverlapError,
  listAvailableResourceIds,
  releaseExpiredHolds,
  reserveResourcesInTransaction,
} from "@/server/services/resource-availability-service";
import type { EventPlanPayload } from "@/types/event-planner";
import { PERMISSIONS } from "@/types/permissions";
import {
  DEFAULT_HOLD_HOURS,
  RESOURCE_RESERVATION_SOURCES,
  RESOURCE_RESERVATION_STATUSES,
  type PlanResourceRequirement,
} from "@/types/resource-schedule";

type HoldDb = PrismaClient;

function minutesToClock(total: number): string {
  const hour = Math.floor(total / 60) % 24;
  const minute = total % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

async function assignResourcesForRequirements(
  database: HoldDb,
  input: {
    organizationId: string;
    window: { slotDate: string; startMinute: number; endMinute: number };
    requirements: PlanResourceRequirement[];
    excludeInquiryId?: string | null;
  },
): Promise<string[]> {
  const assigned: string[] = [];
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
    const units = await database.resource.findMany({
      where: {
        organizationId: input.organizationId,
        resourceTypeId: requirement.resourceTypeId,
        active: true,
      },
      select: { id: true },
      orderBy: { displayOrder: "asc" },
    });
    const available = await listAvailableResourceIds(database, {
      organizationId: input.organizationId,
      resourceIds: units.map((row) => row.id),
      window: input.window,
      excludeInquiryId: input.excludeInquiryId,
    });
    if (available.length < requirement.quantity) {
      throw new ResourceError("RESOURCE_CONFLICT");
    }
    assigned.push(...available.slice(0, requirement.quantity));
  }
  return assigned;
}

export async function getInquiryPlanAvailabilitySnapshot(
  ctx: RequestContext,
  database: HoldDb,
  inquiry: {
    id: string;
    organizationId: string;
    desiredDate: Date | null;
    desiredStartTime: string | null;
    selectedEventPlanId: string | null;
  },
  plan: {
    durationMinutes: number | null;
    availabilityValidated: boolean;
    payload: unknown;
  },
) {
  await requirePermission(ctx, PERMISSIONS.CRM_INQUIRIES_VIEW, database);
  await releaseExpiredHolds(database, ctx.organizationId);
  const payload = plan.payload as EventPlanPayload;
  const inventory = await database.resourceType.findMany({
    where: { organizationId: ctx.organizationId },
    select: { id: true, _count: { select: { resources: { where: { active: true } } } } },
  });
  const requirements = applyInventoryFeasibility(payload.resourceRequirements ?? [], inventory.map((row) => ({
    id: row.id,
    activeCount: row._count.resources,
  })));
  const result = await checkResourceAvailability(database, {
    organizationId: ctx.organizationId,
    date: payload.eventDate ?? (inquiry.desiredDate ? inquiry.desiredDate.toISOString().slice(0, 10) : null),
    startTime: payload.startTime ?? inquiry.desiredStartTime,
    durationMinutes: plan.durationMinutes ?? payload.durationMinutes,
    resourceRequirements: requirements,
    excludeInquiryId: inquiry.id,
  });
  return {
    requirements,
    result,
  };
}

export async function placeManualHold(
  ctx: RequestContext,
  database: HoldDb,
  input: {
    resourceId: string;
    date: string;
    startTime: string;
    endTime: string;
    inquiryId?: string | null;
    reason?: string | null;
    holdHours?: number;
  },
) {
  await requirePermission(ctx, PERMISSIONS.EVENTS_CREATE, database);
  const resource = await database.resource.findFirst({
    where: { id: input.resourceId, organizationId: ctx.organizationId, active: true },
    include: { resourceType: { select: { name: true } } },
  });
  if (!resource) {
    throw new ResourceError("RESOURCE_NOT_FOUND");
  }
  const startMinute = parseClockToMinutes(input.startTime);
  const endMinute = parseClockToMinutes(input.endTime);
  if (startMinute == null || endMinute == null || endMinute <= startMinute) {
    throw new ResourceError("INVALID_RESOURCE", "Choose a valid start and end time.");
  }
  let inquiryId: string | null = null;
  if (input.inquiryId) {
    const inquiry = await database.inquiry.findFirst({
      where: { id: input.inquiryId, organizationId: ctx.organizationId },
      select: { id: true },
    });
    if (!inquiry) {
      throw new ResourceError("INVALID_RESOURCE", "That inquiry was not found.");
    }
    inquiryId = inquiry.id;
  }
  const hours = input.holdHours && input.holdHours > 0 ? input.holdHours : DEFAULT_HOLD_HOURS;
  const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000);
  await releaseExpiredHolds(database, ctx.organizationId);
  const available = await listAvailableResourceIds(database, {
    organizationId: ctx.organizationId,
    resourceIds: [resource.id],
    window: { slotDate: input.date, startMinute, endMinute },
    excludeInquiryId: inquiryId,
  });
  if (available.length === 0) {
    await recordAuditEvent(database, {
      organizationId: ctx.organizationId,
      actorUserProfileId: ctx.userId,
      action: "resource.hold_conflict_rejected",
      resourceType: "resource",
      resourceId: resource.id,
      metadata: { inquiryId, date: input.date },
    });
    throw new ResourceError("RESOURCE_CONFLICT");
  }
  try {
    await reserveResourcesInTransaction(database, {
      organizationId: ctx.organizationId,
      status: RESOURCE_RESERVATION_STATUSES.HOLD,
      sourceType: inquiryId ? RESOURCE_RESERVATION_SOURCES.INQUIRY : RESOURCE_RESERVATION_SOURCES.MANUAL,
      slotDate: input.date,
      startMinute,
      endMinute,
      resourceIds: [resource.id],
      inquiryId,
      expiresAt,
      reason: input.reason?.trim() || "Staff hold",
      createdByUserProfileId: ctx.userId,
    });
  } catch (error) {
    await recordAuditEvent(database, {
      organizationId: ctx.organizationId,
      actorUserProfileId: ctx.userId,
      action: "resource.hold_conflict_rejected",
      resourceType: "resource",
      resourceId: resource.id,
      metadata: { inquiryId, date: input.date },
    });
    if (isReservationOverlapError(error)) {
      throw new ResourceError("RESOURCE_CONFLICT");
    }
    throw error;
  }
  await recordAuditEvent(database, {
    organizationId: ctx.organizationId,
    actorUserProfileId: ctx.userId,
    action: "resource.hold_created",
    resourceType: "resource",
    resourceId: resource.id,
    metadata: {
      inquiryId,
      date: input.date,
      startTime: input.startTime,
      endTime: input.endTime,
    },
  });
}

export async function placeInquiryPlanHold(ctx: RequestContext, database: HoldDb, inquiryId: string) {
  await requirePermission(ctx, PERMISSIONS.EVENTS_CREATE, database);
  await requirePermission(ctx, PERMISSIONS.CRM_INQUIRIES_MANAGE, database);
  const inquiry = await database.inquiry.findFirst({
    where: { id: inquiryId, organizationId: ctx.organizationId },
    include: {
      eventPlanRecommendations: true,
    },
  });
  if (!inquiry || !inquiry.selectedEventPlanId) {
    throw new ResourceError("INVALID_RESOURCE", "Select an event plan before placing a hold.");
  }
  const plan = inquiry.eventPlanRecommendations.find((row) => row.id === inquiry.selectedEventPlanId);
  if (!plan) {
    throw new ResourceError("INVALID_RESOURCE", "The selected event plan could not be found.");
  }
  const existingHold = await database.resourceReservation.findFirst({
    where: {
      organizationId: ctx.organizationId,
      inquiryId: inquiry.id,
      status: RESOURCE_RESERVATION_STATUSES.HOLD,
      releasedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    select: { id: true },
  });
  if (existingHold) {
    throw new ResourceError(
      "INVALID_RESOURCE",
      "A resource hold is already in place for this inquiry. Release it before placing a new one.",
    );
  }
  const payload = plan.payload as EventPlanPayload;
  const date = payload.eventDate;
  const startTime = payload.startTime;
  const durationMinutes = plan.durationMinutes ?? payload.durationMinutes;
  const window = localEventWindow({ date, startTime, durationMinutes });
  if (!window || !date || !startTime) {
    throw new ResourceError("INVALID_RESOURCE", "A date and start time are required before placing a hold.");
  }
  const inventory = await database.resourceType.findMany({
    where: { organizationId: ctx.organizationId },
    select: { id: true, _count: { select: { resources: { where: { active: true } } } } },
  });
  const requirements = applyInventoryFeasibility(payload.resourceRequirements ?? [], inventory.map((row) => ({
    id: row.id,
    activeCount: row._count.resources,
  })));
  if (requirements.length === 0) {
    throw new ResourceError("INVALID_RESOURCE", "This plan has no finite resources to hold.");
  }
  const availability = await checkResourceAvailability(database, {
    organizationId: ctx.organizationId,
    date,
    startTime,
    durationMinutes,
    resourceRequirements: requirements,
    excludeInquiryId: inquiry.id,
  });
  if (!availability.validated || !availability.available) {
    throw new ResourceError("RESOURCE_CONFLICT");
  }
  const expiresAt = new Date(Date.now() + DEFAULT_HOLD_HOURS * 60 * 60 * 1000);
  let resourceCount = 0;
  try {
    await database.$transaction(async (tx) => {
      const resourceIds = await assignResourcesForRequirements(tx as HoldDb, {
        organizationId: ctx.organizationId,
        window,
        requirements,
        excludeInquiryId: inquiry.id,
      });
      if (resourceIds.length === 0) {
        throw new ResourceError("RESOURCE_CONFLICT");
      }
      resourceCount = resourceIds.length;
      await tx.resourceReservation.createMany({
        data: resourceIds.map((resourceId) => ({
          organizationId: ctx.organizationId,
          resourceId,
          status: RESOURCE_RESERVATION_STATUSES.HOLD,
          slotDate: new Date(`${window.slotDate}T00:00:00.000Z`),
          startMinute: window.startMinute,
          endMinute: window.endMinute,
          inquiryId: inquiry.id,
          sourceType: RESOURCE_RESERVATION_SOURCES.INQUIRY,
          expiresAt,
          reason: `Hold for selected plan ${plan.title}`,
          createdByUserProfileId: ctx.userId,
        })),
      });
    });
  } catch (error) {
    if (!(error instanceof ResourceError) || error.code === "RESOURCE_CONFLICT") {
      await recordAuditEvent(database, {
        organizationId: ctx.organizationId,
        actorUserProfileId: ctx.userId,
        action: "resource.hold_conflict_rejected",
        resourceType: "inquiry",
        resourceId: inquiry.id,
        metadata: { planId: plan.id },
      });
    }
    if (error instanceof ResourceError) {
      throw error;
    }
    if (isReservationOverlapError(error)) {
      throw new ResourceError("RESOURCE_CONFLICT");
    }
    throw error;
  }
  await recordAuditEvent(database, {
    organizationId: ctx.organizationId,
    actorUserProfileId: ctx.userId,
    action: "resource.hold_created",
    resourceType: "inquiry",
    resourceId: inquiry.id,
    metadata: { planId: plan.id, resourceCount },
  });
  return {
    resourceCount,
    startTime,
    endTime: minutesToClock(window.endMinute),
    expiresAt,
  };
}

export async function releaseHold(
  ctx: RequestContext,
  database: HoldDb,
  reservationId: string,
) {
  await requirePermission(ctx, PERMISSIONS.EVENTS_EDIT, database);
  const reservation = await database.resourceReservation.findFirst({
    where: { id: reservationId, organizationId: ctx.organizationId, releasedAt: null },
  });
  if (!reservation) {
    throw new ResourceError("HOLD_NOT_FOUND");
  }
  if (reservation.status === RESOURCE_RESERVATION_STATUSES.BOOKED) {
    throw new ResourceError("BOOKED_CANNOT_RELEASE");
  }
  if (reservation.status !== RESOURCE_RESERVATION_STATUSES.HOLD) {
    throw new ResourceError("HOLD_NOT_FOUND");
  }
  await database.resourceReservation.update({
    where: { id: reservation.id },
    data: { releasedAt: new Date() },
  });
  await recordAuditEvent(database, {
    organizationId: ctx.organizationId,
    actorUserProfileId: ctx.userId,
    action: "resource.hold_released",
    resourceType: "resource_reservation",
    resourceId: reservation.id,
    metadata: { resourceId: reservation.resourceId, inquiryId: reservation.inquiryId },
  });
}

export async function releaseInquiryHolds(ctx: RequestContext, database: HoldDb, inquiryId: string) {
  await requirePermission(ctx, PERMISSIONS.EVENTS_EDIT, database);
  await requirePermission(ctx, PERMISSIONS.CRM_INQUIRIES_MANAGE, database);
  const inquiry = await database.inquiry.findFirst({
    where: { id: inquiryId, organizationId: ctx.organizationId },
    select: { id: true },
  });
  if (!inquiry) {
    throw new ResourceError("RESOURCE_NOT_FOUND");
  }
  const holds = await database.resourceReservation.findMany({
    where: {
      organizationId: ctx.organizationId,
      inquiryId: inquiry.id,
      status: RESOURCE_RESERVATION_STATUSES.HOLD,
      releasedAt: null,
    },
    select: { id: true },
  });
  if (holds.length === 0) {
    throw new ResourceError("HOLD_NOT_FOUND");
  }
  await database.resourceReservation.updateMany({
    where: { id: { in: holds.map((row) => row.id) }, organizationId: ctx.organizationId },
    data: { releasedAt: new Date() },
  });
  await recordAuditEvent(database, {
    organizationId: ctx.organizationId,
    actorUserProfileId: ctx.userId,
    action: "resource.hold_released",
    resourceType: "inquiry",
    resourceId: inquiry.id,
    metadata: { holdCount: holds.length },
  });
}
