import { estimateKnowledgePriceCents } from "@/server/event-planner/parse-knowledge-price";
import type { PlannerKnowledgeItem } from "@/server/event-planner/build-event-plans";
import type { EventPlanActivity, EventPlanDining, EventPlanPayload, EventPlanSpace } from "@/types/event-planner";

export function repriceWorkingPlan(input: {
  payload: EventPlanPayload;
  knowledge: PlannerKnowledgeItem[];
  guestCount: number;
  guestMix?: string | null;
}): EventPlanPayload {
  const byId = new Map(input.knowledge.map((item) => [item.id, item]));
  const activities = input.payload.activities.map((activity) =>
    repriceActivity(activity, byId.get(activity.knowledgeItemId), input.guestCount, input.guestMix),
  );
  const dining = repriceDining(input.payload.dining, byId.get(input.payload.dining.knowledgeItemId ?? ""), input.guestCount);
  const spaces = input.payload.spaces.map((space) => repriceSpace(space, byId.get(space.knowledgeItemId), input.guestCount));
  return {
    ...input.payload,
    guestCount: input.guestCount,
    activities,
    dining,
    spaces,
    pricingComplete:
      activities.every((row) => row.priceCents > 0 || !row.priceText) &&
      (dining.priceCents > 0 || !dining.priceText) &&
      spaces.every((space) => space.priceCents > 0 || !space.priceText),
  };
}

function repriceActivity(
  activity: EventPlanActivity,
  item: PlannerKnowledgeItem | undefined,
  guestCount: number,
  guestMix?: string | null,
): EventPlanActivity {
  if (!item) {
    return { ...activity, priceCents: 0 };
  }
  const estimate = estimateKnowledgePriceCents({
    priceText: item.priceText,
    guestCount,
    guestMix,
    quantity: activity.quantity,
  });
  return {
    ...activity,
    name: item.name,
    priceCents: estimate.cents,
    priceText: item.priceText,
  };
}

function repriceDining(
  dining: EventPlanDining,
  item: PlannerKnowledgeItem | undefined,
  guestCount: number,
): EventPlanDining {
  if (!item) {
    return dining;
  }
  const estimate = estimateKnowledgePriceCents({
    priceText: item.priceText,
    guestCount,
  });
  return {
    ...dining,
    knowledgeItemId: item.id,
    label: item.name,
    priceCents: estimate.cents,
    priceText: item.priceText,
  };
}

function repriceSpace(
  space: EventPlanSpace,
  item: PlannerKnowledgeItem | undefined,
  guestCount: number,
): EventPlanSpace {
  if (!item) {
    return { ...space, priceCents: 0 };
  }
  const estimate = estimateKnowledgePriceCents({
    priceText: item.priceText,
    guestCount,
  });
  return {
    ...space,
    name: item.name,
    priceCents: estimate.cents,
    priceText: item.priceText,
  };
}
