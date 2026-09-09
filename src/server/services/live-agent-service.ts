import type { PrismaClient } from "@/generated/prisma/client";
import { planPayloadTotal, summarizePlanChanges, workingPlanAffectsHold } from "@/lib/inquiries/plan-diff";
import { READY_FOR_HUMAN_REASONS } from "@/lib/inquiries/ready-for-human-reason";
import { deriveInquiryWorkflowStage } from "@/lib/inquiries/workflow-stage";
import { InquiryError } from "@/server/errors";
import type { PlannerKnowledgeItem } from "@/server/event-planner/build-event-plans";
import { repriceWorkingPlan } from "@/server/event-planner/reprice-working-plan";
import { requirePermission } from "@/server/policies/require-permission";
import type { RequestContext } from "@/server/request-context";
import { applyInventoryFeasibility } from "@/server/resources/feasibility";
import { planAvailabilityStatusFromCheck } from "@/server/resources/plan-availability-status";
import {
  derivePlanResourceRequirements,
  type StoredKnowledgeResourceRequirement,
} from "@/server/resources/requirements";
import { applyRotationWindows } from "@/server/resources/rotation-windows";
import { recordAuditEvent } from "@/server/services/audit";
import { checkResourceAvailability } from "@/server/services/resource-availability-service";
import type { EventPlanPayload, EventPlanRotation } from "@/types/event-planner";
import { EVENT_PLAN_KINDS, INQUIRY_STATUSES, INQUIRY_WORKFLOW_STAGES, SALES_KNOWLEDGE_TYPES } from "@/types/inquiry";
import { PERMISSIONS } from "@/types/permissions";
import { RESOURCE_QUANTITY_RULES, type ResourceQuantityRule } from "@/types/resource-schedule";

type LiveAgentDb = PrismaClient;

export type WorkingPlanInput = {
  eventDate: string | null;
  startTime: string | null;
  durationMinutes: number;
  guestCount: number;
  activityIds: string[];
  activityQuantities: Record<string, number>;
  diningKnowledgeItemId: string | null;
  spaceKnowledgeItemId: string | null;
  scheduleLines: string[];
  rotations: EventPlanRotation[];
};

function isQuantityRule(value: string): value is ResourceQuantityRule {
  return (Object.values(RESOURCE_QUANTITY_RULES) as string[]).includes(value);
}

export async function copySelectedPlanToWorkingDraft(database: LiveAgentDb, inquiryId: string, organizationId: string) {
  const inquiry = await database.inquiry.findFirst({
    where: { id: inquiryId, organizationId },
    include: { eventPlanRecommendations: true },
  });
  if (!inquiry?.selectedEventPlanId) {
    throw new InquiryError("PLAN_NOT_FOUND");
  }
  const existing = inquiry.eventPlanRecommendations.find((row) => row.kind === EVENT_PLAN_KINDS.AGENT_WORKING);
  if (existing) {
    if (inquiry.agentWorkingPlanId !== existing.id) {
      await database.inquiry.update({
        where: { id: inquiry.id },
        data: { agentWorkingPlanId: existing.id },
      });
    }
    return existing;
  }
  const selected = inquiry.eventPlanRecommendations.find((row) => row.id === inquiry.selectedEventPlanId);
  if (!selected) {
    throw new InquiryError("PLAN_NOT_FOUND");
  }
  const created = await database.eventPlanRecommendation.create({
    data: {
      organizationId,
      inquiryId: inquiry.id,
      kind: EVENT_PLAN_KINDS.AGENT_WORKING,
      tier: selected.tier,
      title: `${selected.title} (working)`,
      sortOrder: selected.sortOrder + 100,
      estimatedTotalCents: selected.estimatedTotalCents,
      currency: selected.currency,
      guestCount: selected.guestCount,
      durationMinutes: selected.durationMinutes,
      customerFacingReason: selected.customerFacingReason,
      availabilityValidated: selected.availabilityValidated,
      availabilityNote: selected.availabilityNote,
      availabilityStatus: selected.availabilityStatus,
      availabilityCheckedAt: selected.availabilityCheckedAt,
      payload: selected.payload as object,
    },
  });
  await database.inquiry.update({
    where: { id: inquiry.id },
    data: { agentWorkingPlanId: created.id },
  });
  return created;
}

export async function startWorkingInquiry(ctx: RequestContext, database: LiveAgentDb, inquiryId: string) {
  await requirePermission(ctx, PERMISSIONS.CRM_INQUIRIES_MANAGE, database);
  const inquiry = await database.inquiry.findFirst({
    where: { id: inquiryId, organizationId: ctx.organizationId },
  });
  if (!inquiry) {
    throw new InquiryError("PLAN_NOT_FOUND");
  }
  if (inquiry.status === INQUIRY_STATUSES.BOOKED) {
    throw new InquiryError("INQUIRY_ALREADY_BOOKED");
  }
  if (!inquiry.selectedEventPlanId) {
    throw new InquiryError("WORKING_PLAN_INVALID", "Start working from a customer-selected plan.");
  }
  const draft = await copySelectedPlanToWorkingDraft(database, inquiry.id, ctx.organizationId);
  const updated = await database.inquiry.update({
    where: { id: inquiry.id },
    data: {
      assignedUserProfileId: inquiry.assignedUserProfileId ?? ctx.userId,
      assignedAt: inquiry.assignedAt ?? new Date(),
      aiHandlingEnabled: false,
      status: INQUIRY_STATUSES.READY_FOR_HUMAN,
      humanHandoffReason: inquiry.humanHandoffReason ?? READY_FOR_HUMAN_REASONS.CUSTOMER_SELECTED_PLAN,
      workflowStage: INQUIRY_WORKFLOW_STAGES.AGENT_WORKING,
      agentWorkingPlanId: draft.id,
    },
  });
  await recordAuditEvent(database, {
    organizationId: ctx.organizationId,
    actorUserProfileId: ctx.userId,
    action: "inquiry.started_working",
    resourceType: "inquiry",
    resourceId: inquiry.id,
  });
  return updated;
}

async function loadCatalog(database: LiveAgentDb, organizationId: string) {
  const [knowledge, resourceCatalog, storedRequirementRows] = await Promise.all([
    database.salesKnowledgeItem.findMany({ where: { organizationId, active: true } }),
    database.resourceType.findMany({
      where: { organizationId, active: true },
      select: {
        id: true,
        slug: true,
        name: true,
        inventoryConfigured: true,
        _count: { select: { resources: { where: { active: true } } } },
      },
    }),
    database.knowledgeResourceRequirement.findMany({
      where: { organizationId },
      include: {
        resourceType: {
          select: { id: true, slug: true, name: true, inventoryConfigured: true, active: true },
        },
      },
    }),
  ]);
  const storedRequirements: StoredKnowledgeResourceRequirement[] = storedRequirementRows.flatMap((row) => {
    if (!row.resourceType.active || !isQuantityRule(row.quantityRule)) {
      return [];
    }
    return [
      {
        salesKnowledgeItemId: row.salesKnowledgeItemId,
        resourceTypeId: row.resourceType.id,
        resourceTypeSlug: row.resourceType.slug,
        resourceTypeName: row.resourceType.name,
        inventoryConfigured: row.resourceType.inventoryConfigured,
        quantityRule: row.quantityRule,
        quantity: row.quantity,
        guestsPerUnit: row.guestsPerUnit,
        durationMinutes: row.durationMinutes,
        requiresStaffConfiguration: row.requiresStaffConfiguration,
      },
    ];
  });
  return { knowledge: knowledge as PlannerKnowledgeItem[], resourceCatalog, storedRequirements };
}

export async function refreshWorkingPlanAvailability(
  database: LiveAgentDb,
  organizationId: string,
  payload: EventPlanPayload,
  excludeInquiryId: string,
) {
  const { knowledge, resourceCatalog, storedRequirements } = await loadCatalog(database, organizationId);
  const inventory = resourceCatalog.map((row) => ({ id: row.id, activeCount: row._count.resources }));
  const derived = derivePlanResourceRequirements({
    activities: payload.activities,
    spaces: payload.spaces,
    guestCount: payload.guestCount,
    durationMinutes: payload.durationMinutes,
    knowledge,
    catalog: resourceCatalog,
    storedRequirements,
  });
  const withRotations = applyRotationWindows(applyInventoryFeasibility(derived, inventory), payload);
  const result = await checkResourceAvailability(database, {
    organizationId,
    date: payload.eventDate,
    startTime: payload.startTime,
    durationMinutes: payload.durationMinutes,
    resourceRequirements: withRotations,
    excludeInquiryId,
  });
  return {
    resourceRequirements: withRotations,
    result,
    status: planAvailabilityStatusFromCheck({ previouslyValidated: false, result }),
    knowledge,
  };
}

export function validateWorkingPlanInput(
  payload: EventPlanPayload,
  knowledge: PlannerKnowledgeItem[],
): string[] {
  const errors: string[] = [];
  if (!payload.eventDate) {
    errors.push("Choose an event date.");
  }
  if (!payload.startTime) {
    errors.push("Choose a start time.");
  }
  if (!payload.guestCount || payload.guestCount < 1) {
    errors.push("Enter a valid guest count.");
  }
  if (payload.durationMinutes < 30) {
    errors.push("Event duration must be at least 30 minutes.");
  }
  const byId = new Map(knowledge.map((item) => [item.id, item]));
  for (const activity of payload.activities) {
    const item = byId.get(activity.knowledgeItemId);
    if (!item) {
      errors.push(`${activity.name} is no longer an active offering.`);
      continue;
    }
    if (item.maxGuests && item.type !== SALES_KNOWLEDGE_TYPES.ATTRACTION && payload.guestCount > item.maxGuests) {
      errors.push(`${item.name} capacity is ${item.maxGuests}, but current guest count is ${payload.guestCount}.`);
    }
  }
  for (const space of payload.spaces) {
    const item = byId.get(space.knowledgeItemId);
    if (item?.maxGuests && payload.guestCount > item.maxGuests) {
      errors.push(`${item.name} capacity is ${item.maxGuests}, but current guest count is ${payload.guestCount}.`);
    }
  }
  return errors;
}

export async function saveAgentWorkingPlan(
  ctx: RequestContext,
  database: LiveAgentDb,
  inquiryId: string,
  input: WorkingPlanInput,
  expectedUpdatedAt?: string | null,
) {
  await requirePermission(ctx, PERMISSIONS.CRM_INQUIRIES_MANAGE, database);
  const inquiry = await database.inquiry.findFirst({
    where: { id: inquiryId, organizationId: ctx.organizationId },
    include: { eventPlanRecommendations: true },
  });
  if (!inquiry?.selectedEventPlanId) {
    throw new InquiryError("PLAN_NOT_FOUND");
  }
  if (inquiry.status === INQUIRY_STATUSES.BOOKED) {
    throw new InquiryError("INQUIRY_ALREADY_BOOKED");
  }
  if (expectedUpdatedAt && inquiry.updatedAt.toISOString() !== expectedUpdatedAt) {
    throw new InquiryError("STALE_INQUIRY");
  }
  const selected = inquiry.eventPlanRecommendations.find((row) => row.id === inquiry.selectedEventPlanId);
  if (!selected) {
    throw new InquiryError("PLAN_NOT_FOUND");
  }
  const draft = await copySelectedPlanToWorkingDraft(database, inquiry.id, ctx.organizationId);
  const { knowledge } = await loadCatalog(database, ctx.organizationId);
  const byId = new Map(knowledge.map((item) => [item.id, item]));
  const currentPayload = draft.payload as EventPlanPayload;
  const activities = input.activityIds.flatMap((id) => {
    const item = byId.get(id);
    if (!item) {
      return [];
    }
    const quantity = Math.max(1, input.activityQuantities[id] ?? 1);
    return [
      {
        knowledgeItemId: item.id,
        name: item.name,
        quantity,
        priceCents: 0,
        priceText: item.priceText,
      },
    ];
  });
  const diningItem = input.diningKnowledgeItemId ? byId.get(input.diningKnowledgeItemId) : null;
  const spaceItem = input.spaceKnowledgeItemId ? byId.get(input.spaceKnowledgeItemId) : null;
  const nextPayload = repriceWorkingPlan({
    payload: {
      ...currentPayload,
      eventDate: input.eventDate,
      startTime: input.startTime,
      durationMinutes: input.durationMinutes,
      guestCount: input.guestCount,
      activities,
      dining: diningItem
        ? { knowledgeItemId: diningItem.id, label: diningItem.name, priceCents: 0, priceText: diningItem.priceText }
        : currentPayload.dining,
      spaces: spaceItem
        ? [{ knowledgeItemId: spaceItem.id, name: spaceItem.name, priceCents: 0, priceText: spaceItem.priceText }]
        : [],
      schedule: input.scheduleLines,
      rotations: input.rotations,
    },
    knowledge,
    guestCount: input.guestCount,
    guestMix: inquiry.guestMix,
  });
  const errors = validateWorkingPlanInput(nextPayload, knowledge);
  if (errors.length > 0) {
    throw new InquiryError("WORKING_PLAN_INVALID", errors[0]);
  }
  const refreshed = await refreshWorkingPlanAvailability(database, ctx.organizationId, nextPayload, inquiry.id);
  nextPayload.resourceRequirements = refreshed.resourceRequirements;
  const selectedPayload = selected.payload as EventPlanPayload;
  const changes = summarizePlanChanges(selectedPayload, nextPayload, draft.currency);
  const holdAffected = workingPlanAffectsHold(draft.payload as EventPlanPayload, nextPayload);
  const updated = await database.eventPlanRecommendation.update({
    where: { id: draft.id },
    data: {
      guestCount: nextPayload.guestCount,
      durationMinutes: nextPayload.durationMinutes,
      estimatedTotalCents: planPayloadTotal(nextPayload),
      availabilityValidated: refreshed.result.validated,
      availabilityNote: refreshed.result.note,
      availabilityStatus: refreshed.status,
      availabilityCheckedAt: new Date(),
      payload: nextPayload as object,
    },
  });
  const nextStage = deriveInquiryWorkflowStage({
    selectedEventPlanId: inquiry.selectedEventPlanId,
    assignedUserProfileId: inquiry.assignedUserProfileId ?? ctx.userId,
    readyToFinalizeAt: inquiry.readyToFinalizeAt,
    hasActiveHold: false,
    workflowStage: inquiry.workflowStage,
  });
  await database.inquiry.update({
    where: { id: inquiry.id },
    data: {
      workflowStage:
        inquiry.workflowStage === INQUIRY_WORKFLOW_STAGES.READY_TO_FINALIZE
          ? INQUIRY_WORKFLOW_STAGES.AGENT_WORKING
          : (inquiry.workflowStage ?? nextStage),
      readyToFinalizeAt: null,
    },
  });
  await recordAuditEvent(database, {
    organizationId: ctx.organizationId,
    actorUserProfileId: ctx.userId,
    action: "inquiry.working_plan_updated",
    resourceType: "inquiry",
    resourceId: inquiry.id,
    metadata: {
      changeCount: changes.length,
      guestCount: nextPayload.guestCount,
      estimatedTotalCents: planPayloadTotal(nextPayload),
    },
  });
  return { plan: updated, holdAffected, changes, availability: refreshed };
}

export async function markInquiryReadyToFinalize(
  ctx: RequestContext,
  database: LiveAgentDb,
  inquiryId: string,
  expectedUpdatedAt?: string | null,
) {
  await requirePermission(ctx, PERMISSIONS.CRM_INQUIRIES_MANAGE, database);
  const inquiry = await database.inquiry.findFirst({
    where: { id: inquiryId, organizationId: ctx.organizationId },
    include: {
      resourceReservations: {
        where: { releasedAt: null, status: "HOLD" },
        select: { id: true },
      },
    },
  });
  if (!inquiry?.selectedEventPlanId) {
    throw new InquiryError("PLAN_NOT_FOUND");
  }
  if (inquiry.status === INQUIRY_STATUSES.BOOKED) {
    throw new InquiryError("INQUIRY_ALREADY_BOOKED");
  }
  if (expectedUpdatedAt && inquiry.updatedAt.toISOString() !== expectedUpdatedAt) {
    throw new InquiryError("STALE_INQUIRY");
  }
  if (!inquiry.assignedUserProfileId) {
    throw new InquiryError("WORKING_PLAN_INVALID", "Start working this inquiry before marking it ready to finalize.");
  }
  if (inquiry.resourceReservations.length === 0) {
    throw new InquiryError("WORKING_PLAN_INVALID", "Place a resource hold before marking this inquiry ready to finalize.");
  }
  const updated = await database.inquiry.update({
    where: { id: inquiry.id },
    data: {
      workflowStage: INQUIRY_WORKFLOW_STAGES.READY_TO_FINALIZE,
      readyToFinalizeAt: new Date(),
      status: INQUIRY_STATUSES.READY_FOR_HUMAN,
    },
  });
  await recordAuditEvent(database, {
    organizationId: ctx.organizationId,
    actorUserProfileId: ctx.userId,
    action: "inquiry.ready_to_finalize",
    resourceType: "inquiry",
    resourceId: inquiry.id,
  });
  return updated;
}

export async function saveEmployeeInternalNotes(
  ctx: RequestContext,
  database: LiveAgentDb,
  inquiryId: string,
  notes: string,
) {
  await requirePermission(ctx, PERMISSIONS.CRM_INQUIRIES_MANAGE, database);
  const inquiry = await database.inquiry.findFirst({
    where: { id: inquiryId, organizationId: ctx.organizationId },
    select: { id: true },
  });
  if (!inquiry) {
    throw new InquiryError("PLAN_NOT_FOUND");
  }
  const updated = await database.inquiry.update({
    where: { id: inquiry.id },
    data: { employeeInternalNotes: notes.trim() || null },
  });
  await recordAuditEvent(database, {
    organizationId: ctx.organizationId,
    actorUserProfileId: ctx.userId,
    action: "inquiry.internal_note_added",
    resourceType: "inquiry",
    resourceId: inquiry.id,
  });
  return updated;
}

export async function markCustomerContacted(ctx: RequestContext, database: LiveAgentDb, inquiryId: string) {
  await requirePermission(ctx, PERMISSIONS.CRM_INQUIRIES_MANAGE, database);
  const inquiry = await database.inquiry.findFirst({
    where: { id: inquiryId, organizationId: ctx.organizationId },
    select: { id: true },
  });
  if (!inquiry) {
    throw new InquiryError("PLAN_NOT_FOUND");
  }
  const updated = await database.inquiry.update({
    where: { id: inquiry.id },
    data: { customerContactedAt: new Date() },
  });
  await recordAuditEvent(database, {
    organizationId: ctx.organizationId,
    actorUserProfileId: ctx.userId,
    action: "inquiry.customer_contacted",
    resourceType: "inquiry",
    resourceId: inquiry.id,
  });
  return updated;
}

export async function listInquiryActivity(ctx: RequestContext, database: LiveAgentDb, inquiryId: string) {
  await requirePermission(ctx, PERMISSIONS.CRM_INQUIRIES_VIEW, database);
  const inquiry = await database.inquiry.findFirst({
    where: { id: inquiryId, organizationId: ctx.organizationId },
    select: { id: true },
  });
  if (!inquiry) {
    return [];
  }
  const [inquiryRows, bookingRows] = await Promise.all([
    database.auditLog.findMany({
      where: { organizationId: ctx.organizationId, resourceType: "inquiry", resourceId: inquiry.id },
      orderBy: { createdAt: "asc" },
      take: 80,
    }),
    database.auditLog.findMany({
      where: {
        organizationId: ctx.organizationId,
        resourceType: "booking",
        action: {
          in: [
            "booking.confirmed",
            "resource.converted_to_booked",
            "communication.booking_confirmation_skipped",
          ],
        },
      },
      orderBy: { createdAt: "asc" },
      take: 80,
    }),
  ]);
  const relatedBookingRows = bookingRows.filter((row) => {
    const metadata = row.metadata;
    return Boolean(
      metadata &&
        typeof metadata === "object" &&
        !Array.isArray(metadata) &&
        "inquiryId" in metadata &&
        metadata.inquiryId === inquiry.id,
    );
  });
  const rows = [...inquiryRows, ...relatedBookingRows].sort(
    (left, right) => left.createdAt.getTime() - right.createdAt.getTime(),
  );
  const actorIds = [...new Set(rows.map((row) => row.actorUserProfileId).filter((id): id is string => Boolean(id)))];
  const actors =
    actorIds.length > 0
      ? await database.userProfile.findMany({
          where: { organizationId: ctx.organizationId, id: { in: actorIds } },
          select: { id: true, firstName: true, lastName: true, displayName: true, email: true },
        })
      : [];
  const byId = new Map(actors.map((row) => [row.id, row]));
  return rows.map((row) => ({
    ...row,
    actor: row.actorUserProfileId ? byId.get(row.actorUserProfileId) ?? null : null,
  }));
}

export async function suggestClosestAvailableAlternatives(
  ctx: RequestContext,
  database: LiveAgentDb,
  inquiryId: string,
) {
  await requirePermission(ctx, PERMISSIONS.CRM_INQUIRIES_VIEW, database);
  const inquiry = await database.inquiry.findFirst({
    where: { id: inquiryId, organizationId: ctx.organizationId },
    include: { eventPlanRecommendations: true },
  });
  if (!inquiry) {
    throw new InquiryError("PLAN_NOT_FOUND");
  }
  const working =
    inquiry.eventPlanRecommendations.find((row) => row.id === inquiry.agentWorkingPlanId) ??
    inquiry.eventPlanRecommendations.find((row) => row.kind === EVENT_PLAN_KINDS.AGENT_WORKING);
  if (!working) {
    throw new InquiryError("WORKING_PLAN_INVALID", "Save a working version before requesting alternatives.");
  }
  const payload = working.payload as EventPlanPayload;
  const start = payload.startTime;
  if (!start) {
    return [];
  }
  const [hour, minute] = start.split(":").map(Number);
  const base = (hour ?? 0) * 60 + (minute ?? 0);
  const offsets = [-60, -30, 30, 60, 90];
  const suggestions: Array<{ startTime: string; available: boolean; note: string }> = [];
  for (const offset of offsets) {
    const next = base + offset;
    if (next < 8 * 60 || next > 21 * 60) {
      continue;
    }
    const startTime = `${String(Math.floor(next / 60)).padStart(2, "0")}:${String(next % 60).padStart(2, "0")}`;
    const refreshed = await refreshWorkingPlanAvailability(
      database,
      ctx.organizationId,
      { ...payload, startTime },
      inquiry.id,
    );
    if (refreshed.result.available && refreshed.result.validated) {
      suggestions.push({
        startTime,
        available: true,
        note: `Start at ${startTime} currently fits the required resources.`,
      });
    }
  }
  return suggestions.slice(0, 3);
}

export async function listWorkspaceKnowledge(ctx: RequestContext, database: LiveAgentDb) {
  await requirePermission(ctx, PERMISSIONS.CRM_INQUIRIES_VIEW, database);
  return database.salesKnowledgeItem.findMany({
    where: { organizationId: ctx.organizationId, active: true },
    select: { id: true, name: true, type: true, maxGuests: true, priceText: true },
    orderBy: { name: "asc" },
  });
}
