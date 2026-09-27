import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import {
  hashPublicConversationToken,
  isPlausiblePublicConversationToken,
} from "@/lib/ai/public-conversation-token";
import { getPublicRateLimiter, type RateLimiter } from "@/lib/ai/rate-limiter";
import { personalEventPlanNotification } from "@/lib/event-planner/email-context";
import { engineDiningPreference } from "@/lib/event-planner/intake-contract";
import { readEventPlanPayload } from "@/lib/event-planner/payload";
import { READY_FOR_HUMAN_REASONS } from "@/lib/inquiries/ready-for-human-reason";
import { resolveTenantTimezone } from "@/lib/inquiries/tenant-datetime";
import { InquiryError } from "@/server/errors";
import type { PlanAvailabilityProvider } from "@/server/event-planner/availability";
import {
  attractionInterestIdsFromJson,
  type PlannerInquiryFacts,
  type PlannerKnowledgeItem,
} from "@/server/event-planner/build-event-plans";
import { generateRecommendations } from "@/server/event-planner/generate-recommendations";
import {
  customerAttractionChoices,
  expandAttractionSelections,
} from "@/server/catalog/attraction-interests";
import { loadCatalogForProposal } from "@/server/catalog/load-for-proposal";
import { attractionModeFromIntake, audienceFromGuestMix } from "@/server/catalog/audience";
import { depositPercentFromTenant } from "@/server/catalog/pricing";
import { resolveInquiryLocationId } from "@/server/locations/primary-location";
import { applyInventoryFeasibility } from "@/server/resources/feasibility";
import { resourcesInLocationWhere } from "@/server/resources/location-scope";
import { planAvailabilityStatusFromCheck } from "@/server/resources/plan-availability-status";
import { stampPlanResourceWindows } from "@/server/resources/segment-windows";
import { buildCatalogEventPlans } from "@/server/services/proposal-engine";
import { checkResourceAvailability, createResourceScheduleAvailabilityProvider } from "@/server/services/resource-availability-service";
import { upsertPendingBookingFromPlan } from "@/server/services/pending-booking-service";
import { emitDomainEvent } from "@/server/domain-events/emit";
import { DOMAIN_EVENT_TYPES } from "@/server/domain-events/types";
import { recordAuditEvent } from "@/server/services/audit";
import { type EventPlanPayload } from "@/types/event-planner";
import { BOOKING_STATUSES } from "@/types/booking";
import {
  CONVERSATION_CHANNELS,
  EVENT_PLAN_KINDS,
  INQUIRY_SALES_STAGES,
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
  budgetPreference?: string | null;
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
    budgetFlexible: inquiry.budgetPreference === "FLEXIBLE",
    diningPreference: engineDiningPreference(inquiry.diningPreference),
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

export async function listSelectablePublicAttractions(database: PlannerDb, organizationId: string) {
  const [interests, products] = await Promise.all([
    database.attractionInterest.findMany({
      where: { organizationId },
      select: {
        id: true,
        organizationId: true,
        label: true,
        description: true,
        active: true,
        displayOrder: true,
      },
      orderBy: [{ displayOrder: "asc" }, { label: "asc" }],
    }),
    database.product.findMany({
      where: { organizationId, active: true, kind: "ATTRACTION" },
      select: { id: true, name: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
  ]);
  const knowledge =
    products.length > 0
      ? []
      : await database.salesKnowledgeItem.findMany({
          where: {
            organizationId,
            active: true,
            type: SALES_KNOWLEDGE_TYPES.ATTRACTION,
          },
          select: { id: true, name: true, shortDescription: true },
          orderBy: { name: "asc" },
        });
  const choices = customerAttractionChoices({
    interests,
    organizationId,
    fallback:
      products.length > 0
        ? products.map((item) => ({ id: item.id, name: item.name, description: null }))
        : knowledge.map((item) => ({
            id: item.id,
            name: item.name,
            description: item.shortDescription,
          })),
  });
  return choices.map((item) => ({
    id: item.id,
    type: "ATTRACTION" as const,
    name: item.name,
    shortDescription: item.description,
  }));
}

export async function loadAttractionCompositionInputs(
  database: PlannerDb,
  organizationId: string,
  storedIds: string[],
) {
  if (storedIds.length === 0) {
    return { selections: [], directProductIds: [] as string[] };
  }
  const interests = await database.attractionInterest.findMany({
    where: { organizationId, id: { in: storedIds } },
    select: {
      id: true,
      slug: true,
      products: { orderBy: { sortOrder: "asc" }, select: { productId: true } },
    },
  });
  const interestIds = new Set(interests.map((row) => row.id));
  return {
    selections: interests.map((row) => ({
      interestSlug: row.slug,
      productIds: row.products.map((product) => product.productId),
    })),
    directProductIds: storedIds.filter((id) => !interestIds.has(id)),
  };
}

export async function expandStoredAttractionSelections(
  database: PlannerDb,
  organizationId: string,
  storedIds: string[],
) {
  if (storedIds.length === 0) {
    return [];
  }
  const interests = await database.attractionInterest.findMany({
    where: { organizationId, id: { in: storedIds } },
    select: {
      id: true,
      products: {
        orderBy: { sortOrder: "asc" },
        select: { productId: true },
      },
    },
  });
  return expandAttractionSelections({
    storedIds,
    interests: interests.map((row) => ({
      id: row.id,
      productIds: row.products.map((product) => product.productId),
    })),
  });
}

export async function assertSelectablePublicAttractions(
  database: PlannerDb,
  organizationId: string,
  attractionIds: string[],
) {
  if (attractionIds.length === 0) {
    return;
  }
  const allowed = new Set((await listSelectablePublicAttractions(database, organizationId)).map((item) => item.id));
  if (attractionIds.some((id) => !allowed.has(id))) {
    throw new InquiryError("INVALID_INTAKE", "Choose attractions offered by this venue.");
  }
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

  const attractions = await listSelectablePublicAttractions(database, organization.id);
  const catalogDining = await database.product.findMany({
    where: { organizationId: organization.id, active: true, kind: "FOOD" },
    select: { id: true, name: true, slug: true },
    orderBy: { sortOrder: "asc" },
  });

  const diningItems =
    catalogDining.length > 0
      ? catalogDining.map((item) => ({
          id: item.slug,
          type: "FOOD",
          name: item.name,
          shortDescription: null,
        }))
      : items.filter(
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

  const locationId = await resolveInquiryLocationId(database, inquiry);
  const resourceWhere = resourcesInLocationWhere(locationId);
  const [organization, knowledge, resourceCatalog, storedRequirementRows] = await Promise.all([
    database.organization.findFirstOrThrow({
      where: { id: input.organizationId },
      select: { currency: true, depositPercent: true },
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
        _count: { select: { resources: { where: resourceWhere } } },
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

  const facts = toPlannerFacts(inquiry);
  const audience = audienceFromGuestMix(inquiry.guestMix);
  const attractionMode = attractionModeFromIntake({
    attractionMode: inquiry.attractionMode,
    attractionInterestIds: facts.attractionInterestIds,
  });
  const attractionInputs = await loadAttractionCompositionInputs(
    database,
    input.organizationId,
    facts.attractionInterestIds,
  );
  const engineFacts = {
    ...facts,
    attractionInterestIds: await expandStoredAttractionSelections(
      database,
      input.organizationId,
      facts.attractionInterestIds,
    ),
  };
  const availabilityProvider =
    input.availabilityProvider ??
    createResourceScheduleAvailabilityProvider(database, input.organizationId, locationId);

  const catalog = await loadCatalogForProposal(database, input.organizationId, locationId);
  let drafts;
  if (catalog.products.length > 0) {
    drafts = await buildCatalogEventPlans({
      organizationId: input.organizationId,
      locationId,
      inquiry: engineFacts,
      products: catalog.products,
      profiles: catalog.profiles,
      resourceRequirements: catalog.resourceRequirements,
      currency: organization.currency,
      depositPercent: depositPercentFromTenant(organization.depositPercent),
      availabilityProvider,
      excludeInquiryId: inquiry.id,
      attractionSelections: attractionInputs.selections,
      directAttractionProductIds: attractionInputs.directProductIds,
    });
  } else {
    const historical = await similarActivityNames(database, input.organizationId, inquiry);
    drafts = await generateRecommendations({
      inquiry: engineFacts,
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
      availabilityProvider,
    });
  }

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
        audience,
        attractionMode,
        salesStage: drafts.length > 0 ? INQUIRY_SALES_STAGES.PROPOSAL_READY : inquiry.salesStage,
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
          bookings: {
            where: {
              status: { in: [BOOKING_STATUSES.CONFIRMED, BOOKING_STATUSES.PENDING_PAYMENT] },
            },
            orderBy: { createdAt: "desc" },
            take: 5,
            select: {
              id: true,
              bookingNumber: true,
              status: true,
              eventDate: true,
              startTime: true,
              endTime: true,
              guestCount: true,
              totalCents: true,
              depositRequiredCents: true,
              currency: true,
              selectedEventPlanId: true,
            },
          },
          resourceReservations: {
            where: {
              releasedAt: null,
              status: "HOLD",
              OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
            },
            include: {
              resource: { select: { name: true, resourceType: { select: { name: true } } } },
            },
            orderBy: [{ startMinute: "asc" }, { createdAt: "asc" }],
          },
          location: { select: { timezone: true } },
        },
      },
      organization: { select: { name: true, slug: true, currency: true, timezone: true, depositPercent: true } },
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

  const { bookings, resourceReservations, location, ...inquiryFields } = conversation.inquiry;
  const activeHold = resourceReservations[0] ?? null;
  const confirmedBooking = bookings.find((row) => row.status === BOOKING_STATUSES.CONFIRMED) ?? null;
  const pendingBooking = confirmedBooking
    ? null
    : (bookings.find((row) => row.status === BOOKING_STATUSES.PENDING_PAYMENT) ?? null);

  return {
    organizationName: conversation.organization.name,
    organizationSlug: conversation.organization.slug,
    currency: conversation.organization.currency,
    timeZone: resolveTenantTimezone({
      organizationTimezone: conversation.organization.timezone,
      locationTimezone: location?.timezone,
    }),
    depositPercent: depositPercentFromTenant(conversation.organization.depositPercent),
    inquiry: {
      ...inquiryFields,
      employeeInternalNotes: null,
    },
    booking: confirmedBooking,
    pendingBooking,
    hold: activeHold
      ? {
          expiresAt: activeHold.expiresAt,
          resources: resourceReservations.map((row) => row.resource.name),
        }
      : null,
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
  if (conversation.inquiry.status === INQUIRY_STATUSES.BOOKED) {
    throw new InquiryError("INQUIRY_ALREADY_BOOKED");
  }
  if (
    conversation.inquiry.salesStage === INQUIRY_SALES_STAGES.HOLD_PLACED ||
    conversation.inquiry.salesStage === INQUIRY_SALES_STAGES.DEPOSIT_PENDING ||
    conversation.inquiry.salesStage === INQUIRY_SALES_STAGES.BOOKED
  ) {
    throw new InquiryError("PLAN_ALREADY_CONSUMED");
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

  const planPayload = readEventPlanPayload(plan.payload);
  const locationId = await resolveInquiryLocationId(database, conversation.inquiry);
  const inventory = await database.resourceType.findMany({
    where: { organizationId: conversation.organizationId },
    select: {
      id: true,
      _count: { select: { resources: { where: resourcesInLocationWhere(locationId) } } },
    },
  });
  const requirements = stampPlanResourceWindows(
    planPayload,
    applyInventoryFeasibility(
      planPayload.resourceRequirements ?? [],
      inventory.map((row) => ({ id: row.id, activeCount: row._count.resources })),
    ),
  );
  const recheck = await checkResourceAvailability(database, {
    organizationId: conversation.organizationId,
    locationId,
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
        salesStage: INQUIRY_SALES_STAGES.READY_TO_BOOK,
        status: INQUIRY_STATUSES.READY_FOR_HUMAN,
        workflowStage: INQUIRY_WORKFLOW_STAGES.READY_FOR_LIVE_AGENT,
        aiHandlingEnabled: false,
        humanHandoffRequestedAt: conversation.inquiry.humanHandoffRequestedAt ?? new Date(),
        humanHandoffReason: READY_FOR_HUMAN_REASONS.CUSTOMER_SELECTED_PLAN,
        internalSummary: `Customer submitted an inquiry for ${plan.title} (${plan.tier}). No booking was created and inventory is not reserved.`,
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
    action: "inquiry.submitted_for_followup",
    resourceType: "inquiry",
    resourceId: conversation.inquiryId,
    metadata: { planId: plan.id, tier: plan.tier, availabilityStatus },
  });
  await recordAuditEvent(database, {
    organizationId: conversation.organizationId,
    action: "inquiry.plan_selected",
    resourceType: "inquiry",
    resourceId: conversation.inquiryId,
    metadata: { planId: plan.id, tier: plan.tier, availabilityStatus, hold: false },
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

export async function bookPublicEventPlan(
  database: PlannerDb,
  input: { token: string; planId: string; rateLimitKey: string; now?: Date },
  rateLimiter: RateLimiter = getPublicRateLimiter(),
) {
  if (!isPlausiblePublicConversationToken(input.token)) {
    throw new InquiryError("CONVERSATION_NOT_FOUND");
  }
  const limited = await rateLimiter.consume(`plan-reserve:${input.rateLimitKey}`, 10, 10 * 60_000);
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
  if (conversation.inquiry.status === INQUIRY_STATUSES.BOOKED) {
    throw new InquiryError("INQUIRY_ALREADY_BOOKED");
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

  const planPayload = readEventPlanPayload(plan.payload);
  const locationId = await resolveInquiryLocationId(database, conversation.inquiry);
  const inventory = await database.resourceType.findMany({
    where: { organizationId: conversation.organizationId },
    select: {
      id: true,
      _count: { select: { resources: { where: resourcesInLocationWhere(locationId) } } },
    },
  });
  const requirements = stampPlanResourceWindows(
    planPayload,
    applyInventoryFeasibility(
      planPayload.resourceRequirements ?? [],
      inventory.map((row) => ({ id: row.id, activeCount: row._count.resources })),
    ),
  );
  const recheck = await checkResourceAvailability(database, {
    organizationId: conversation.organizationId,
    locationId,
    date: planPayload.eventDate ?? conversation.inquiry.desiredDate?.toISOString().slice(0, 10) ?? null,
    startTime: planPayload.startTime ?? conversation.inquiry.desiredStartTime,
    durationMinutes: plan.durationMinutes ?? planPayload.durationMinutes,
    resourceRequirements: requirements,
    excludeInquiryId: conversation.inquiryId,
  });
  if (!recheck.available) {
    try {
      await generateEventPlansForInquiry(database, {
        organizationId: conversation.organizationId,
        inquiryId: conversation.inquiryId,
      });
    } catch {
      // Regeneration is best-effort. The customer-facing result is still that this snapshot is stale.
    }
    throw new InquiryError("AVAILABILITY_CHANGED");
  }

  const pending = await upsertPendingBookingFromPlan(database, {
    organizationId: conversation.organizationId,
    inquiryId: conversation.inquiryId,
    planId: plan.id,
    source: "customer_book_now",
  });
  void input.now;
  return {
    booking: pending.booking,
    created: pending.created,
    availabilityStatus: "UNCONFIRMED" as const,
  };
}

/** @deprecated Use bookPublicEventPlan. Kept as a name alias for older call sites. */
export const reservePublicEventPlan = bookPublicEventPlan;

