import { EVENT_PLAN_TIERS, type EventPlanPayload } from "@/types/event-planner";

export function readEventPlanPayload(value: unknown): EventPlanPayload {
  const payload = (value ?? {}) as EventPlanPayload;
  return {
    organizationId: payload.organizationId,
    locationId: payload.locationId,
    guestCount: payload.guestCount ?? 0,
    eventDate: payload.eventDate ?? null,
    startTime: payload.startTime ?? null,
    durationMinutes: payload.durationMinutes ?? 0,
    activities: Array.isArray(payload.activities) ? payload.activities : [],
    dining: payload.dining ?? { label: "Dining to be confirmed", priceCents: 0 },
    spaces: Array.isArray(payload.spaces) ? payload.spaces : [],
    schedule: Array.isArray(payload.schedule) ? payload.schedule : [],
    rotations: Array.isArray(payload.rotations) ? payload.rotations : [],
    pricingComplete: payload.pricingComplete === true,
    historicalInfluence: payload.historicalInfluence ?? null,
    customerAvailabilityNote: payload.customerAvailabilityNote,
    ranking: payload.ranking,
    resourceRequirements: Array.isArray(payload.resourceRequirements) ? payload.resourceRequirements : [],
    lineItems: Array.isArray(payload.lineItems) ? payload.lineItems : [],
    depositPreviewCents: payload.depositPreviewCents ?? null,
    depositPreviewNote: payload.depositPreviewNote,
    itinerary: Array.isArray(payload.itinerary) ? payload.itinerary : [],
    suggestedStartTimes: Array.isArray(payload.suggestedStartTimes) ? payload.suggestedStartTimes : [],
    catalogBacked: payload.catalogBacked === true,
    selectionAvailability: payload.selectionAvailability,
  };
}

export function isBestFitTier(tier: string): boolean {
  return tier === EVENT_PLAN_TIERS.BEST_FIT;
}
