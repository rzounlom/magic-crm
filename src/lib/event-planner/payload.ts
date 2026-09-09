import { EVENT_PLAN_TIERS, type EventPlanPayload } from "@/types/event-planner";

export function readEventPlanPayload(value: unknown): EventPlanPayload {
  const payload = (value ?? {}) as EventPlanPayload;
  return {
    guestCount: payload.guestCount ?? 0,
    eventDate: payload.eventDate ?? null,
    startTime: payload.startTime ?? null,
    durationMinutes: payload.durationMinutes ?? 0,
    activities: Array.isArray(payload.activities) ? payload.activities : [],
    dining: payload.dining ?? { label: "Dining to be confirmed", priceCents: 0 },
    spaces: Array.isArray(payload.spaces) ? payload.spaces : [],
    schedule: Array.isArray(payload.schedule) ? payload.schedule : [],
    pricingComplete: payload.pricingComplete === true,
    historicalInfluence: payload.historicalInfluence ?? null,
    customerAvailabilityNote: payload.customerAvailabilityNote,
    ranking: payload.ranking,
    resourceRequirements: Array.isArray(payload.resourceRequirements) ? payload.resourceRequirements : [],
    selectionAvailability: payload.selectionAvailability,
  };
}

export function isBestFitTier(tier: string): boolean {
  return tier === EVENT_PLAN_TIERS.BEST_FIT;
}
