import type { PrismaClient } from "@/generated/prisma/client";

import { occupancyInstants, resolveSchedulingTimeZone } from "@/lib/inquiries/tenant-datetime";
import { ResourceError } from "@/server/errors";
import { resolveInquiryLocationId } from "@/server/locations/primary-location";
import { requirePermission } from "@/server/policies/require-permission";
import type { RequestContext } from "@/server/request-context";
import { applyInventoryFeasibility } from "@/server/resources/feasibility";
import { lockLocationForScheduling } from "@/server/resources/location-exclusivity";
import { resourcesInLocationWhere } from "@/server/resources/location-scope";
import { stampPlanResourceWindows } from "@/server/resources/segment-windows";
import { localEventWindow, parseClockToMinutes } from "@/server/resources/time-window";
import { recordAuditEvent } from "@/server/services/audit";
import {
  assignExactResourcesForRequirements,
  placeProposalHold,
} from "@/server/services/proposal-hold-service";
import {
  checkResourceAvailability,
  isReservationOverlapError,
  listAvailableResourceIds,
  releaseExpiredHolds,
  reserveResourcesInTransaction,
} from "@/server/services/resource-availability-service";
import { EVENT_PLAN_KINDS, INQUIRY_SALES_STAGES, INQUIRY_STATUSES, INQUIRY_WORKFLOW_STAGES } from "@/types/inquiry";
import type { EventPlanPayload } from "@/types/event-planner";
import { PERMISSIONS } from "@/types/permissions";
import {
  DEFAULT_HOLD_HOURS,
  RESOURCE_RESERVATION_SOURCES,
  RESOURCE_RESERVATION_STATUSES,
} from "@/types/resource-schedule";

type HoldDb = PrismaClient;

export async function getInquiryPlanAvailabilitySnapshot(
  ctx: RequestContext,
  database: HoldDb,
  inquiry: {
    id: string;
    organizationId: string;
    locationId: string | null;
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
  const locationId = await resolveInquiryLocationId(database, inquiry);
  const inventory = await database.resourceType.findMany({
    where: { organizationId: ctx.organizationId },
    select: { id: true, _count: { select: { resources: { where: resourcesInLocationWhere(locationId) } } } },
  });
  const requirements = stampPlanResourceWindows(
    payload,
    applyInventoryFeasibility(
      payload.resourceRequirements ?? [],
      inventory.map((row) => ({
        id: row.id,
        activeCount: row._count.resources,
      })),
    ),
  );
  const result = await checkResourceAvailability(database, {
    organizationId: ctx.organizationId,
    locationId,
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
  const organization = await database.organization.findFirst({
    where: { id: ctx.organizationId },
    select: { timezone: true },
  });
  const location = resource.locationId
    ? await database.location.findFirst({
        where: { id: resource.locationId, organizationId: ctx.organizationId },
        select: { timezone: true },
      })
    : null;
  const timeZone = resolveSchedulingTimeZone({
    locationTimeZone: location?.timezone,
    organizationTimeZone: organization?.timezone,
  });
  const instants = occupancyInstants({
    slotDate: input.date,
    startMinute,
    endMinute,
    timeZone,
  });
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
      locationId: resource.locationId,
      status: RESOURCE_RESERVATION_STATUSES.HOLD,
      sourceType: inquiryId ? RESOURCE_RESERVATION_SOURCES.INQUIRY : RESOURCE_RESERVATION_SOURCES.MANUAL,
      slotDate: input.date,
      startMinute,
      endMinute,
      startsAt: instants.startsAt,
      endsAt: instants.endsAt,
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
  if (inquiry.status === INQUIRY_STATUSES.BOOKED) {
    throw new ResourceError("INVALID_RESOURCE", "This inquiry has already been converted to a booking.");
  }
  const plan =
    inquiry.eventPlanRecommendations.find((row) => row.id === inquiry.agentWorkingPlanId) ??
    inquiry.eventPlanRecommendations.find((row) => row.kind === EVENT_PLAN_KINDS.AGENT_WORKING) ??
    inquiry.eventPlanRecommendations.find((row) => row.id === inquiry.selectedEventPlanId);
  if (!plan) {
    throw new ResourceError("INVALID_RESOURCE", "The selected event plan could not be found.");
  }
  const hold = await placeProposalHold(database, {
    organizationId: ctx.organizationId,
    inquiryId: inquiry.id,
    planId: plan.id,
    actorUserProfileId: ctx.userId,
  });
  return {
    resourceCount: hold.resourceCount,
    startTime: hold.startTime,
    endTime: hold.endTime,
    expiresAt: hold.holdExpiresAt,
  };
}

export async function updateInquiryPlanHold(ctx: RequestContext, database: HoldDb, inquiryId: string) {
  await requirePermission(ctx, PERMISSIONS.EVENTS_CREATE, database);
  await requirePermission(ctx, PERMISSIONS.CRM_INQUIRIES_MANAGE, database);
  const inquiry = await database.inquiry.findFirst({
    where: { id: inquiryId, organizationId: ctx.organizationId },
    include: { eventPlanRecommendations: true },
  });
  if (!inquiry?.selectedEventPlanId) {
    throw new ResourceError("INVALID_RESOURCE", "Select an event plan before updating a hold.");
  }
  const plan =
    inquiry.eventPlanRecommendations.find((row) => row.id === inquiry.agentWorkingPlanId) ??
    inquiry.eventPlanRecommendations.find((row) => row.kind === EVENT_PLAN_KINDS.AGENT_WORKING) ??
    inquiry.eventPlanRecommendations.find((row) => row.id === inquiry.selectedEventPlanId);
  if (!plan) {
    throw new ResourceError("INVALID_RESOURCE", "The working event plan could not be found.");
  }
  const payload = plan.payload as EventPlanPayload;
  const window = localEventWindow({
    date: payload.eventDate,
    startTime: payload.startTime,
    durationMinutes: plan.durationMinutes ?? payload.durationMinutes,
  });
  if (!window || !payload.eventDate || !payload.startTime) {
    throw new ResourceError("INVALID_RESOURCE", "A date and start time are required before updating a hold.");
  }
  const existing = await database.resourceReservation.findMany({
    where: {
      organizationId: ctx.organizationId,
      inquiryId: inquiry.id,
      status: RESOURCE_RESERVATION_STATUSES.HOLD,
      releasedAt: null,
    },
  });
  if (existing.length === 0) {
    throw new ResourceError("HOLD_NOT_FOUND");
  }
  const locationId = await resolveInquiryLocationId(database, inquiry);
  const inventory = await database.resourceType.findMany({
    where: { organizationId: ctx.organizationId },
    select: { id: true, _count: { select: { resources: { where: resourcesInLocationWhere(locationId) } } } },
  });
  const requirements = stampPlanResourceWindows(
    payload,
    applyInventoryFeasibility(
      payload.resourceRequirements ?? [],
      inventory.map((row) => ({ id: row.id, activeCount: row._count.resources })),
    ),
  );
  const availability = await checkResourceAvailability(database, {
    organizationId: ctx.organizationId,
    locationId,
    date: payload.eventDate,
    startTime: payload.startTime,
    durationMinutes: plan.durationMinutes ?? payload.durationMinutes,
    resourceRequirements: requirements,
    excludeInquiryId: inquiry.id,
  });
  if (!availability.validated || !availability.available) {
    throw new ResourceError("RESOURCE_CONFLICT");
  }
  const expiresAt = existing[0]?.expiresAt ?? new Date(Date.now() + DEFAULT_HOLD_HOURS * 60 * 60 * 1000);
  const organization = await database.organization.findFirst({
    where: { id: ctx.organizationId },
    select: { timezone: true },
  });
  const location = locationId
    ? await database.location.findFirst({
        where: { id: locationId, organizationId: ctx.organizationId },
        select: { timezone: true },
      })
    : null;
  const timeZone = resolveSchedulingTimeZone({
    locationTimeZone: location?.timezone,
    organizationTimeZone: organization?.timezone,
  });
  try {
    await database.$transaction(async (tx) => {
      await lockLocationForScheduling(tx, ctx.organizationId, locationId);
      const assignments = await assignExactResourcesForRequirements(tx as HoldDb, {
        organizationId: ctx.organizationId,
        locationId,
        window,
        requirements,
        excludeInquiryId: inquiry.id,
        preferredResourceIds: existing.map((row) => row.resourceId),
      });
      const existingByResource = new Map(existing.map((row) => [row.resourceId, row]));
      const desiredIds = new Set(assignments.map((row) => row.resourceId));
      const toCreate = assignments.filter((row) => !existingByResource.has(row.resourceId));
      if (toCreate.length > 0) {
        await tx.resourceReservation.createMany({
          data: toCreate.map((assignment) => {
            const instants = occupancyInstants({
              slotDate: window.slotDate,
              startMinute: assignment.startMinute,
              endMinute: assignment.endMinute,
              timeZone,
            });
            return {
              organizationId: ctx.organizationId,
              locationId,
              resourceId: assignment.resourceId,
              status: RESOURCE_RESERVATION_STATUSES.HOLD,
              slotDate: new Date(`${window.slotDate}T00:00:00.000Z`),
              startMinute: assignment.startMinute,
              endMinute: assignment.endMinute,
              startsAt: instants.startsAt,
              endsAt: instants.endsAt,
              inquiryId: inquiry.id,
              sourceType: RESOURCE_RESERVATION_SOURCES.INQUIRY,
              expiresAt,
              reason: `Updated hold for ${plan.title}`,
              createdByUserProfileId: ctx.userId,
            };
          }),
        });
      }
      for (const assignment of assignments) {
        const current = existingByResource.get(assignment.resourceId);
        if (!current) {
          continue;
        }
        if (current.startMinute !== assignment.startMinute || current.endMinute !== assignment.endMinute) {
          const instants = occupancyInstants({
            slotDate: window.slotDate,
            startMinute: assignment.startMinute,
            endMinute: assignment.endMinute,
            timeZone,
          });
          await tx.resourceReservation.update({
            where: { id: current.id },
            data: {
              startMinute: assignment.startMinute,
              endMinute: assignment.endMinute,
              slotDate: new Date(`${window.slotDate}T00:00:00.000Z`),
              startsAt: instants.startsAt,
              endsAt: instants.endsAt,
            },
          });
        }
      }
      const toRelease = existing.filter((row) => !desiredIds.has(row.resourceId));
      if (toRelease.length > 0) {
        await tx.resourceReservation.updateMany({
          where: { id: { in: toRelease.map((row) => row.id) }, organizationId: ctx.organizationId },
          data: { releasedAt: new Date() },
        });
      }
    });
  } catch (error) {
    await recordAuditEvent(database, {
      organizationId: ctx.organizationId,
      actorUserProfileId: ctx.userId,
      action: "resource.hold_conflict_rejected",
      resourceType: "inquiry",
      resourceId: inquiry.id,
      metadata: { planId: plan.id, update: true },
    });
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
    action: "resource.hold_updated",
    resourceType: "inquiry",
    resourceId: inquiry.id,
    metadata: { planId: plan.id },
  });
  await database.inquiry.update({
    where: { id: inquiry.id },
    data: { workflowStage: INQUIRY_WORKFLOW_STAGES.HOLD_PLACED, salesStage: INQUIRY_SALES_STAGES.HOLD_PLACED },
  });
}

export async function extendInquiryHolds(
  ctx: RequestContext,
  database: HoldDb,
  inquiryId: string,
  additionalHours = DEFAULT_HOLD_HOURS,
) {
  await requirePermission(ctx, PERMISSIONS.EVENTS_EDIT, database);
  await requirePermission(ctx, PERMISSIONS.CRM_INQUIRIES_MANAGE, database);
  const holds = await database.resourceReservation.findMany({
    where: {
      organizationId: ctx.organizationId,
      inquiryId,
      status: RESOURCE_RESERVATION_STATUSES.HOLD,
      releasedAt: null,
    },
  });
  if (holds.length === 0) {
    throw new ResourceError("HOLD_NOT_FOUND");
  }
  const hours = additionalHours > 0 ? additionalHours : DEFAULT_HOLD_HOURS;
  const nextExpiry = new Date(Date.now() + hours * 60 * 60 * 1000);
  await database.resourceReservation.updateMany({
    where: { id: { in: holds.map((row) => row.id) }, organizationId: ctx.organizationId },
    data: { expiresAt: nextExpiry },
  });
  await recordAuditEvent(database, {
    organizationId: ctx.organizationId,
    actorUserProfileId: ctx.userId,
    action: "resource.hold_extended",
    resourceType: "inquiry",
    resourceId: inquiryId,
    metadata: { additionalHours: hours },
  });
  return nextExpiry;
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
  await database.inquiry.update({
    where: { id: inquiry.id },
    data: { workflowStage: INQUIRY_WORKFLOW_STAGES.AGENT_WORKING, readyToFinalizeAt: null },
  });
}
