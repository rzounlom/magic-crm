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
    includedItems: Array.isArray(payload.includedItems) ? payload.includedItems : [],
    dining: payload.dining ?? { label: "Dining to be confirmed", priceCents: 0 },
    spaces: Array.isArray(payload.spaces) ? payload.spaces : [],
    durationNote: payload.durationNote ?? null,
    schedule: Array.isArray(payload.schedule) ? payload.schedule : [],
    rotations: Array.isArray(payload.rotations) ? payload.rotations : [],
    pricingComplete: payload.pricingComplete === true,
    historicalInfluence: payload.historicalInfluence ?? null,
    customerAvailabilityNote: payload.customerAvailabilityNote,
    ranking: payload.ranking,
    resourceRequirements: Array.isArray(payload.resourceRequirements) ? payload.resourceRequirements : [],
    lineItems: Array.isArray(payload.lineItems) ? payload.lineItems : [],
    depositPreviewCents: payload.depositPreviewCents ?? null,
    depositPreviewPercent: payload.depositPreviewPercent ?? null,
    depositPreviewNote: payload.depositPreviewNote,
    itinerary: Array.isArray(payload.itinerary) ? payload.itinerary : [],
    suggestedStartTimes: Array.isArray(payload.suggestedStartTimes) ? payload.suggestedStartTimes : [],
    requestedStartTime: payload.requestedStartTime ?? payload.startTime ?? null,
    itineraryAdjusted: payload.itineraryAdjusted === true,
    adjustmentNote: payload.adjustmentNote,
    conflictingActivityLabels: Array.isArray(payload.conflictingActivityLabels)
      ? payload.conflictingActivityLabels
      : [],
    catalogBacked: payload.catalogBacked === true,
    locationExclusive: payload.locationExclusive === true,
    budgetFit: payload.budgetFit,
    spaceUnmet: payload.spaceUnmet === true,
    unfulfilledInterestSlugs: Array.isArray(payload.unfulfilledInterestSlugs)
      ? payload.unfulfilledInterestSlugs
      : [],
    compositionDelta: payload.compositionDelta,
    selectionAvailability: payload.selectionAvailability,
  };
}

export function isBestFitTier(tier: string): boolean {
  return tier === EVENT_PLAN_TIERS.BEST_FIT;
}
