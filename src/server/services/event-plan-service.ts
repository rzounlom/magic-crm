import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import {
  hashPublicConversationToken,
  isPlausiblePublicConversationToken,
} from "@/lib/ai/public-conversation-token";
import { getPublicRateLimiter, type RateLimiter } from "@/lib/ai/rate-limiter";
import { personalEventPlanNotification } from "@/lib/event-planner/email-context";
import { READY_FOR_HUMAN_REASONS } from "@/lib/inquiries/ready-for-human-reason";
import { InquiryError } from "@/server/errors";
import type { PlanAvailabilityProvider } from "@/server/event-planner/availability";
import {
  attractionInterestIdsFromJson,
  type PlannerInquiryFacts,
  type PlannerKnowledgeItem,
} from "@/server/event-planner/build-event-plans";
import { generateRecommendations } from "@/server/event-planner/generate-recommendations";
import { applyInventoryFeasibility } from "@/server/resources/feasibility";
import { planAvailabilityStatusFromCheck } from "@/server/resources/plan-availability-status";
import { checkResourceAvailability, createResourceScheduleAvailabilityProvider } from "@/server/services/resource-availability-service";
import { emitDomainEvent } from "@/server/domain-events/emit";
import { DOMAIN_EVENT_TYPES } from "@/server/domain-events/types";
import { recordAuditEvent } from "@/server/services/audit";
import { type EventPlanPayload } from "@/types/event-planner";
import {
  CONVERSATION_CHANNELS,
  EVENT_PLAN_KINDS,
  INQUIRY_STATUSES,
  INQUIRY_WORKFLOW_STAGES,
  SALES_KNOWLEDGE_TYPES,
} from "@/types/inquiry";
import { RESOURCE_QUANTITY_RULES, type ResourceQuantityRule } from "@/types/resource-schedule";

type PlannerDb = PrismaClient;

function isoDate(value: Date | null): string | null {
  if (!value) {
    return null;
  }
  return value.toISOString().slice(0, 10);
}

function toPlannerFacts(inquiry: {
  eventType: string | null;
  eventGoal: string | null;
  guestCount: number | null;
  guestMix: string | null;
  desiredDurationMinutes: number | null;
  desiredDate: Date | null;
  desiredStartTime: string | null;
  budgetMin: number | null;
  budgetMax: number | null;
  diningPreference: string | null;
  spacePreference: string | null;
  attractionInterestIds: Prisma.JsonValue | null;
  customerNotes: string | null;
}): PlannerInquiryFacts {
  return {
    eventType: inquiry.eventType,
    eventGoal: inquiry.eventGoal,
    guestCount: inquiry.guestCount ?? 1,
    guestMix: inquiry.guestMix,
    desiredDurationMinutes: inquiry.desiredDurationMinutes,
    desiredDate: isoDate(inquiry.desiredDate),
    desiredStartTime: inquiry.desiredStartTime,
    budgetMin: inquiry.budgetMin,
    budgetMax: inquiry.budgetMax,
    diningPreference: inquiry.diningPreference,
    spacePreference: inquiry.spacePreference,
    attractionInterestIds: attractionInterestIdsFromJson(inquiry.attractionInterestIds),
    customerNotes: inquiry.customerNotes,
  };
}

function isQuantityRule(value: string): value is ResourceQuantityRule {
  return (Object.values(RESOURCE_QUANTITY_RULES) as string[]).includes(value);
}

async function similarActivityNames(
  database: PlannerDb,
  organizationId: string,
  inquiry: { id: string; eventType: string | null; guestCount: number | null },
): Promise<string[]> {
  const guestCount = inquiry.guestCount;
  const similar = await database.inquiry.findMany({
    where: {
      organizationId,
      id: { not: inquiry.id },
      selectedEventPlanId: { not: null },
      ...(inquiry.eventType ? { eventType: inquiry.eventType } : {}),
      ...(guestCount
        ? {
            guestCount: {
              gte: Math.max(1, Math.floor(guestCount * 0.5)),
              lte: Math.ceil(guestCount * 1.5),
            },
          }
        : {}),
    },
    select: { selectedEventPlanId: true },
    take: 20,
  });
  const ids = similar
    .map((row) => row.selectedEventPlanId)
    .filter((id): id is string => Boolean(id));
  if (ids.length === 0) {
    return [];
  }
  const plans = await database.eventPlanRecommendation.findMany({
    where: { organizationId, id: { in: ids } },
    select: { payload: true },
  });
  const names: string[] = [];
  for (const plan of plans) {
    const payload = plan.payload as EventPlanPayload;
    for (const activity of payload.activities ?? []) {
      if (activity.name) {
        names.push(activity.name);
      }
    }
  }
  return names;
}

export async function listPublicPlannerCatalog(database: PlannerDb, organizationSlug: string) {
  const organization = await database.organization.findFirst({
    where: { slug: organizationSlug.trim().toLowerCase(), onboardingStatus: "ACTIVE" },
    select: { id: true, name: true, slug: true },
  });
  if (!organization) {
    throw new InquiryError("TENANT_NOT_AVAILABLE");
  }

  const items = await database.salesKnowledgeItem.findMany({
    where: {
      organizationId: organization.id,
      active: true,
      type: {
        in: [
          SALES_KNOWLEDGE_TYPES.ATTRACTION,
          SALES_KNOWLEDGE_TYPES.FOOD_BEVERAGE,
          SALES_KNOWLEDGE_TYPES.ADD_ON,
        ],
      },
    },
    select: {
      id: true,
      type: true,
      name: true,
      shortDescription: true,
    },
    orderBy: { name: "asc" },
  });

  const attractions = items.filter((item) => item.type === SALES_KNOWLEDGE_TYPES.ATTRACTION);
  const diningItems = items.filter(
    (item) =>
      item.type === SALES_KNOWLEDGE_TYPES.FOOD_BEVERAGE ||
      (item.type === SALES_KNOWLEDGE_TYPES.ADD_ON &&
        /food|pizza|cater|dining|menu|appetizer|entree|tableside/i.test(
          `${item.name} ${item.shortDescription}`,
        )),
  );

  return { organization, attractions, diningItems };
}

export async function generateEventPlansForInquiry(
  database: PlannerDb,
  input: {
    organizationId: string;
    inquiryId: string;
    availabilityProvider?: PlanAvailabilityProvider;
    planNotification?: ReturnType<typeof personalEventPlanNotification>;
  },
) {
  const inquiry = await database.inquiry.findFirst({
    where: { id: input.inquiryId, organizationId: input.organizationId },
  });
  if (!inquiry) {
    throw new InquiryError("PLAN_NOT_FOUND");
  }

  const [organization, knowledge, resourceCatalog, storedRequirementRows] = await Promise.all([
    database.organization.findFirstOrThrow({
      where: { id: input.organizationId },
      select: { currency: true },
    }),
    database.salesKnowledgeItem.findMany({
      where: { organizationId: input.organizationId, active: true },
    }),
    database.resourceType.findMany({
      where: { organizationId: input.organizationId, active: true },
      select: {
        id: true,
        slug: true,
        name: true,
        inventoryConfigured: true,
        _count: { select: { resources: { where: { active: true } } } },
      },
    }),
    database.knowledgeResourceRequirement.findMany({
      where: { organizationId: input.organizationId },
      include: {
        resourceType: {
          select: { id: true, slug: true, name: true, inventoryConfigured: true, active: true },
        },
      },
    }),
  ]);

  const storedRequirements = storedRequirementRows.flatMap((row) => {
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

  const historical = await similarActivityNames(database, input.organizationId, inquiry);
  const drafts = await generateRecommendations({
    inquiry: toPlannerFacts(inquiry),
    knowledge: knowledge as PlannerKnowledgeItem[],
    similarActivityNames: historical,
    currency: organization.currency,
    resourceCatalog: resourceCatalog.map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      inventoryConfigured: row.inventoryConfigured,
      activeCount: row._count.resources,
    })),
    storedRequirements,
    excludeInquiryId: inquiry.id,
    availabilityProvider:
      input.availabilityProvider ?? createResourceScheduleAvailabilityProvider(database, input.organizationId),
  });

  await database.$transaction(async (tx) => {
    await tx.eventPlanRecommendation.deleteMany({
      where: {
        organizationId: input.organizationId,
        inquiryId: inquiry.id,
        kind: EVENT_PLAN_KINDS.RECOMMENDATION,
      },
    });
    if (drafts.length > 0) {
      await tx.eventPlanRecommendation.createMany({
        data: drafts.map((draft) => ({
          organizationId: input.organizationId,
          inquiryId: inquiry.id,
          tier: draft.tier,
          title: draft.title,
          sortOrder: draft.sortOrder,
          estimatedTotalCents: draft.estimatedTotalCents,
          currency: draft.currency,
          guestCount: draft.guestCount,
          durationMinutes: draft.durationMinutes,
          customerFacingReason: draft.customerFacingReason,
          availabilityValidated: draft.availabilityValidated === true,
          availabilityNote: draft.availabilityNote,
          availabilityStatus: draft.availabilityStatus ?? "NOT_VALIDATED",
          availabilityCheckedAt: new Date(),
          kind: EVENT_PLAN_KINDS.RECOMMENDATION,
          payload: draft.payload as Prisma.InputJsonValue,
        })),
      });
    }
    await tx.inquiry.update({
      where: { id: inquiry.id },
      data: {
        recommendationsGeneratedAt: new Date(),
        status: drafts.length > 0 ? INQUIRY_STATUSES.AWAITING_CUSTOMER : INQUIRY_STATUSES.NEEDS_FOLLOW_UP,
        humanHandoffReason:
          drafts.length > 0 ? inquiry.humanHandoffReason : READY_FOR_HUMAN_REASONS.NO_FEASIBLE_PLAN,
        internalSummary:
          drafts.length > 0
            ? `Personal Event Planner generated ${drafts.length} option${drafts.length === 1 ? "" : "s"}.`
            : "No feasible event plan could be generated from current sales knowledge.",
      },
    });
  });

  await recordAuditEvent(database, {
    organizationId: input.organizationId,
    action: "inquiry.plan_generated",
    resourceType: "inquiry",
    resourceId: inquiry.id,
    metadata: {
      planCount: drafts.length,
      ...(input.planNotification
        ? { planUrl: input.planNotification.planUrl, eventDate: input.planNotification.eventDate }
        : {}),
    },
  });

  return drafts.length;
}

export async function getPublicEventPlanByToken(database: PlannerDb, token: string) {
  if (!isPlausiblePublicConversationToken(token)) {
    throw new InquiryError("CONVERSATION_NOT_FOUND");
  }
  const hash = hashPublicConversationToken(token);
  const conversation = await database.conversation.findFirst({
    where: { publicTokenHash: hash, channel: CONVERSATION_CHANNELS.WEB },
    include: {
      inquiry: {
        include: {
          eventPlanRecommendations: {
            where: { kind: EVENT_PLAN_KINDS.RECOMMENDATION },
            orderBy: { sortOrder: "asc" },
          },
        },
      },
      organization: { select: { name: true, slug: true, currency: true } },
    },
  });
  if (!conversation) {
    throw new InquiryError("CONVERSATION_NOT_FOUND");
  }

  if (!conversation.inquiry.recommendationsViewedAt) {
    await database.inquiry.update({
      where: { id: conversation.inquiry.id },
      data: { recommendationsViewedAt: new Date() },
    });
    conversation.inquiry.recommendationsViewedAt = new Date();
    await recordAuditEvent(database, {
      organizationId: conversation.organizationId,
      action: "inquiry.plan_viewed",
      resourceType: "inquiry",
      resourceId: conversation.inquiry.id,
    });
  }

  return {
    organizationName: conversation.organization.name,
    organizationSlug: conversation.organization.slug,
    currency: conversation.organization.currency,
    inquiry: {
      ...conversation.inquiry,
      employeeInternalNotes: null,
    },
    plans: conversation.inquiry.eventPlanRecommendations,
  };
}

export async function selectPublicEventPlan(
  database: PlannerDb,
  input: { token: string; planId: string; rateLimitKey: string },
  rateLimiter: RateLimiter = getPublicRateLimiter(),
) {
  if (!isPlausiblePublicConversationToken(input.token)) {
    throw new InquiryError("CONVERSATION_NOT_FOUND");
  }
  const limited = await rateLimiter.consume(`plan:${input.rateLimitKey}`, 10, 10 * 60_000);
  if (!limited.ok) {
    throw new InquiryError("RATE_LIMITED");
  }

  const hash = hashPublicConversationToken(input.token);
  const conversation = await database.conversation.findFirst({
    where: { publicTokenHash: hash, channel: CONVERSATION_CHANNELS.WEB },
    include: {
      inquiry: true,
      organization: { select: { name: true } },
    },
  });
  if (!conversation) {
    throw new InquiryError("CONVERSATION_NOT_FOUND");
  }

  const plan = await database.eventPlanRecommendation.findFirst({
    where: {
      id: input.planId,
      organizationId: conversation.organizationId,
      inquiryId: conversation.inquiryId,
      kind: EVENT_PLAN_KINDS.RECOMMENDATION,
    },
  });
  if (!plan) {
    throw new InquiryError("PLAN_NOT_FOUND");
  }

  const planPayload = plan.payload as EventPlanPayload;
  const inventory = await database.resourceType.findMany({
    where: { organizationId: conversation.organizationId },
    select: { id: true, _count: { select: { resources: { where: { active: true } } } } },
  });
  const requirements = applyInventoryFeasibility(
    planPayload.resourceRequirements ?? [],
    inventory.map((row) => ({ id: row.id, activeCount: row._count.resources })),
  );
  const recheck = await checkResourceAvailability(database, {
    organizationId: conversation.organizationId,
    date: planPayload.eventDate ?? isoDate(conversation.inquiry.desiredDate),
    startTime: planPayload.startTime ?? conversation.inquiry.desiredStartTime,
    durationMinutes: plan.durationMinutes ?? planPayload.durationMinutes,
    resourceRequirements: requirements,
    excludeInquiryId: conversation.inquiryId,
  });
  const availabilityStatus = planAvailabilityStatusFromCheck({
    previouslyValidated: plan.availabilityValidated,
    result: recheck,
  });
  const nextPayload: EventPlanPayload = {
    ...planPayload,
    resourceRequirements: requirements,
    selectionAvailability: {
      status: availabilityStatus,
      checkedAt: new Date().toISOString(),
      types: recheck.types,
      note: recheck.note,
    },
  };

  const [updated, updatedPlan] = await database.$transaction([
    database.inquiry.update({
      where: { id: conversation.inquiryId },
      data: {
        selectedEventPlanId: plan.id,
        customerSelectedAt: new Date(),
        status: INQUIRY_STATUSES.READY_FOR_HUMAN,
        workflowStage: INQUIRY_WORKFLOW_STAGES.READY_FOR_LIVE_AGENT,
        aiHandlingEnabled: false,
        humanHandoffRequestedAt: conversation.inquiry.humanHandoffRequestedAt ?? new Date(),
        humanHandoffReason: READY_FOR_HUMAN_REASONS.CUSTOMER_SELECTED_PLAN,
        internalSummary: `Customer selected ${plan.title} (${plan.tier}). Estimated total is stored on the selected plan. Selection is intent only — inventory is not reserved.`,
      },
    }),
    database.eventPlanRecommendation.update({
      where: { id: plan.id },
      data: {
        availabilityValidated: recheck.validated === true,
        availabilityNote: recheck.note,
        availabilityStatus,
        availabilityCheckedAt: new Date(),
        payload: nextPayload as Prisma.InputJsonValue,
      },
    }),
  ]);

  await recordAuditEvent(database, {
    organizationId: conversation.organizationId,
    action: "inquiry.plan_selected",
    resourceType: "inquiry",
    resourceId: conversation.inquiryId,
    metadata: { planId: plan.id, tier: plan.tier, availabilityStatus },
  });
  try {
    await emitDomainEvent(database, {
      type: DOMAIN_EVENT_TYPES.EVENT_PLAN_SELECTED,
      payload: {
        organizationId: conversation.organizationId,
        inquiryId: conversation.inquiryId,
        selectedPlanId: plan.id,
        organizationName: conversation.organization.name,
        customerEmail: conversation.inquiry.customerEmail,
        customerFirstName: conversation.inquiry.customerFirstName,
        customerLastName: conversation.inquiry.customerLastName,
        customerGroupName: conversation.inquiry.customerGroupName,
        eventDate: isoDate(conversation.inquiry.desiredDate),
        guestCount: conversation.inquiry.guestCount,
        planTitle: plan.title,
        activities: (planPayload.activities ?? []).map((row) => row.name),
        dining: planPayload.dining?.label ?? "Dining to be confirmed",
        spaces: (planPayload.spaces ?? []).map((row) => row.name),
        estimatedTotalCents: plan.estimatedTotalCents,
        currency: plan.currency,
      },
    });
  } catch {
    await recordAuditEvent(database, {
      organizationId: conversation.organizationId,
      action: "communication.plan_selection_skipped",
      resourceType: "inquiry",
      resourceId: conversation.inquiryId,
      metadata: { selectedPlanId: plan.id, skipReason: "EMIT_FAILED" },
    });
  }

  return { inquiry: updated, plan: updatedPlan, availabilityStatus };
}
