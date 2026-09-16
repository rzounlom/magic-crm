import type { PrismaClient } from "@/generated/prisma/client";

import { readEventPlanPayload } from "@/lib/event-planner/payload";
import { generateEventPlansForInquiry } from "@/server/services/event-plan-service";
import { checkResourceAvailability } from "@/server/services/resource-availability-service";
import { EVENT_PLAN_KINDS } from "@/types/inquiry";

type AgentDb = PrismaClient;

function proposalDto(row: {
  id: string;
  tier: string;
  title: string;
  estimatedTotalCents: number | null;
  currency: string;
  durationMinutes: number | null;
  customerFacingReason: string;
  availabilityStatus: string | null;
  availabilityNote: string | null;
  payload: unknown;
}) {
  const payload = readEventPlanPayload(row.payload);
  return {
    id: row.id,
    tier: row.tier,
    title: row.title,
    estimatedTotalCents: row.estimatedTotalCents,
    currency: row.currency,
    durationMinutes: row.durationMinutes,
    customerFacingReason: row.customerFacingReason,
    availabilityStatus: row.availabilityStatus,
    availabilityNote: row.availabilityNote,
    lineItems: payload.lineItems,
    itinerary: payload.itinerary,
    suggestedStartTimes: payload.suggestedStartTimes,
    depositPreviewCents: payload.depositPreviewCents,
    activities: payload.activities.map((item) => item.name),
    dining: payload.dining.label,
    spaces: payload.spaces.map((item) => item.name),
  };
}

export async function recommendProposalsForAgent(
  database: AgentDb,
  input: { organizationId: string; inquiryId: string },
) {
  let plans = await database.eventPlanRecommendation.findMany({
    where: {
      organizationId: input.organizationId,
      inquiryId: input.inquiryId,
      kind: EVENT_PLAN_KINDS.RECOMMENDATION,
    },
    orderBy: { sortOrder: "asc" },
  });
  if (plans.length === 0) {
    await generateEventPlansForInquiry(database, {
      organizationId: input.organizationId,
      inquiryId: input.inquiryId,
    });
    plans = await database.eventPlanRecommendation.findMany({
      where: {
        organizationId: input.organizationId,
        inquiryId: input.inquiryId,
        kind: EVENT_PLAN_KINDS.RECOMMENDATION,
      },
      orderBy: { sortOrder: "asc" },
    });
  }
  return plans.map(proposalDto);
}

export async function lookupAvailabilityForAgent(
  database: AgentDb,
  input: {
    organizationId: string;
    inquiryId: string;
    date?: string | null;
    startTime?: string | null;
  },
) {
  const inquiry = await database.inquiry.findFirst({
    where: { id: input.inquiryId, organizationId: input.organizationId },
    include: {
      eventPlanRecommendations: {
        where: { kind: EVENT_PLAN_KINDS.RECOMMENDATION },
        orderBy: { sortOrder: "asc" },
      },
    },
  });
  if (!inquiry) {
    return { error: "Inquiry not found" };
  }
  const plan =
    inquiry.eventPlanRecommendations.find((row) => row.id === inquiry.selectedEventPlanId) ??
    inquiry.eventPlanRecommendations[0];
  if (!plan) {
    return {
      validated: false,
      available: false,
      note: "Generate proposals before looking up availability.",
      types: [],
    };
  }
  const payload = readEventPlanPayload(plan.payload);
  return checkResourceAvailability(database, {
    organizationId: input.organizationId,
    locationId: inquiry.locationId,
    date: input.date ?? payload.eventDate,
    startTime: input.startTime ?? payload.startTime,
    durationMinutes: plan.durationMinutes ?? payload.durationMinutes,
    resourceRequirements: payload.resourceRequirements ?? [],
    excludeInquiryId: inquiry.id,
  });
}
