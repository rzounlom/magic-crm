import { buildItinerary, itinerarySpanMinutes } from "@/server/catalog/itinerary";
import { isSampleItinerarySegment } from "@/server/catalog/scheduling-behavior";
import { applyAvailabilityProvider, type PlanAvailabilityProvider } from "@/server/event-planner/availability";
import {
  buildEventPlans,
  type BuildEventPlansInput,
  type PlannerKnowledgeItem,
} from "@/server/event-planner/build-event-plans";
import { applyInventoryFeasibility, type InventoryCount } from "@/server/resources/feasibility";
import { planAvailabilityStatusFromCheck } from "@/server/resources/plan-availability-status";
import {
  conflictingActivityLabels,
  customerAdjustmentNote,
  shiftItineraryToStart,
  stampPlanResourceWindows,
} from "@/server/resources/segment-windows";
import {
  derivePlanResourceRequirements,
  type StoredKnowledgeResourceRequirement,
} from "@/server/resources/requirements";
import { minutesToClock, parseClockToMinutes } from "@/server/resources/time-window";
import { NEARBY_START_OFFSETS_MINUTES } from "@/server/services/nearby-availability";
import type { EventPlanDraft, EventPlanItinerarySegment, EventPlanPayload } from "@/types/event-planner";
import {
  PLAN_AVAILABILITY_STATUSES,
  SCHEDULE_DAY_END_MINUTE,
  SCHEDULE_DAY_START_MINUTE,
  type PlanResourceRequirement,
  type ResourceAvailabilityResult,
} from "@/types/resource-schedule";

export type ResourceCatalogEntry = {
  id: string;
  slug: string;
  name: string;
  inventoryConfigured: boolean;
  activeCount?: number;
};

export type GenerateRecommendationsInput = BuildEventPlansInput & {
  availabilityProvider?: PlanAvailabilityProvider;
  resourceCatalog?: ResourceCatalogEntry[];
  storedRequirements?: StoredKnowledgeResourceRequirement[];
  excludeInquiryId?: string | null;
};

function itineraryFromKnowledgeDraft(
  draft: EventPlanDraft,
  knowledge: PlannerKnowledgeItem[],
): EventPlanItinerarySegment[] {
  if (draft.payload.itinerary && draft.payload.itinerary.length > 0) {
    return draft.payload.itinerary;
  }
  const byId = new Map(knowledge.map((item) => [item.id, item]));
  const products = [
    ...(draft.payload.dining.knowledgeItemId
      ? [
          {
            id: draft.payload.dining.knowledgeItemId,
            name: draft.payload.dining.label,
            kind: byId.get(draft.payload.dining.knowledgeItemId)?.type ?? "FOOD",
            durationMinutes: byId.get(draft.payload.dining.knowledgeItemId)?.durationMinutes ?? 60,
          },
        ]
      : []),
    ...draft.payload.activities.map((activity) => ({
      id: activity.knowledgeItemId,
      name: activity.name,
      kind: byId.get(activity.knowledgeItemId)?.type ?? "ATTRACTION",
      durationMinutes: byId.get(activity.knowledgeItemId)?.durationMinutes ?? null,
    })),
  ];
  return buildItinerary({
    startTime: draft.payload.startTime,
    durationMinutes: draft.durationMinutes,
    foodFirst: true,
    products,
  });
}

function toAvailabilityResult(
  availability: Awaited<ReturnType<typeof applyAvailabilityProvider>>,
  fallbackNote: string,
): ResourceAvailabilityResult {
  const validated = availability.validated === true;
  return {
    validated,
    available: availability.available ?? validated,
    note: availability.note ?? fallbackNote,
    types: availability.types ?? [],
  };
}

async function searchNearbyKnowledgeItinerary(input: {
  draft: EventPlanDraft;
  derived: PlanResourceRequirement[];
  inventory: InventoryCount[];
  availabilityProvider: PlanAvailabilityProvider;
  excludeInquiryId?: string | null;
  original: ResourceAvailabilityResult;
  originalRequirements: PlanResourceRequirement[];
}): Promise<{
  startTime: string | null;
  itinerary: EventPlanPayload["itinerary"];
  requirements: PlanResourceRequirement[];
  result: ResourceAvailabilityResult;
  itineraryAdjusted: boolean;
  adjustmentNote: string;
}> {
  const requestedStartTime = input.draft.payload.startTime;
  const itinerary = input.draft.payload.itinerary ?? [];
  const originalConflictLabels = conflictingActivityLabels(input.originalRequirements, input.original.types);
  const base = parseClockToMinutes(requestedStartTime);
  if (base == null || itinerary.length === 0) {
    return {
      startTime: requestedStartTime,
      itinerary,
      requirements: input.originalRequirements,
      result: input.original,
      itineraryAdjusted: false,
      adjustmentNote: "",
    };
  }

  for (const offset of NEARBY_START_OFFSETS_MINUTES) {
    if (offset === 0) {
      continue;
    }
    const next = base + offset;
    if (next < SCHEDULE_DAY_START_MINUTE || next > SCHEDULE_DAY_END_MINUTE - 30) {
      continue;
    }
    const startTime = minutesToClock(next);
    const nextItinerary = shiftItineraryToStart(itinerary, startTime);
    const requirements = stampPlanResourceWindows(
      { ...input.draft.payload, itinerary: nextItinerary, startTime },
      applyInventoryFeasibility(input.derived, input.inventory),
    );
    const availability = await applyAvailabilityProvider(
      {
        eventDate: input.draft.payload.eventDate,
        startTime,
        durationMinutes: input.draft.durationMinutes,
        guestCount: input.draft.guestCount,
        activities: input.draft.payload.activities,
        spaces: input.draft.payload.spaces,
        resourceRequirements: requirements,
        excludeInquiryId: input.excludeInquiryId,
      },
      input.availabilityProvider,
    );
    const result = toAvailabilityResult(availability, input.draft.availabilityNote);
    if (result.validated && result.available) {
      return {
        startTime,
        itinerary: nextItinerary,
        requirements,
        result,
        itineraryAdjusted: true,
        adjustmentNote: customerAdjustmentNote({
          conflictLabels: originalConflictLabels,
          requestedStartTime,
          viableStartTime: startTime,
          orderChanged: false,
        }),
      };
    }
  }

  return {
    startTime: requestedStartTime,
    itinerary,
    requirements: input.originalRequirements,
    result: input.original,
    itineraryAdjusted: false,
    adjustmentNote: "",
  };
}

export async function generateRecommendations(
  input: GenerateRecommendationsInput,
): Promise<EventPlanDraft[]> {
  const drafts = buildEventPlans(input);
  const inventory: InventoryCount[] = (input.resourceCatalog ?? []).map((row) => ({
    id: row.id,
    activeCount: row.activeCount ?? 0,
  }));
  return Promise.all(
    drafts.map(async (draft) => {
      const derived = derivePlanResourceRequirements({
        activities: draft.payload.activities,
        spaces: draft.payload.spaces,
        guestCount: draft.guestCount,
        durationMinutes: draft.durationMinutes,
        knowledge: input.knowledge,
        catalog: input.resourceCatalog,
        storedRequirements: input.storedRequirements,
      });
      const builtItinerary = itineraryFromKnowledgeDraft(draft, input.knowledge);
      const spanMinutes = itinerarySpanMinutes(builtItinerary.filter(isSampleItinerarySegment));
      const durationMinutes = spanMinutes > 0 ? spanMinutes : draft.durationMinutes;
      const structuredPayload = {
        ...draft.payload,
        durationMinutes,
        itinerary: builtItinerary,
      };
      const stampedDraft = { ...draft, durationMinutes, payload: structuredPayload };
      let resourceRequirements = stampPlanResourceWindows(
        structuredPayload,
        applyInventoryFeasibility(derived, inventory),
      );
      const availability = await applyAvailabilityProvider(
        {
          eventDate: structuredPayload.eventDate,
          startTime: structuredPayload.startTime,
          durationMinutes,
          guestCount: draft.guestCount,
          activities: structuredPayload.activities,
          spaces: structuredPayload.spaces,
          resourceRequirements,
          excludeInquiryId: input.excludeInquiryId,
        },
        input.availabilityProvider,
      );
      let result = toAvailabilityResult(availability, draft.availabilityNote);
      let itinerary = structuredPayload.itinerary;
      let startTime = structuredPayload.startTime;
      let itineraryAdjusted = false;
      let adjustmentNote = "";

      if (input.availabilityProvider && !result.available) {
        const nearby = await searchNearbyKnowledgeItinerary({
          draft: stampedDraft,
          derived,
          inventory,
          availabilityProvider: input.availabilityProvider,
          excludeInquiryId: input.excludeInquiryId,
          original: result,
          originalRequirements: resourceRequirements,
        });
        itinerary = nearby.itinerary ?? itinerary;
        startTime = nearby.startTime;
        resourceRequirements = nearby.requirements;
        result = nearby.result;
        itineraryAdjusted = nearby.itineraryAdjusted;
        adjustmentNote = nearby.adjustmentNote;
      }

      const rotationNotes = resourceRequirements
        .map((row) => row.rotationNote)
        .filter((note): note is string => Boolean(note));
      const viable = result.validated && result.available;
      const sampleItinerary = (itinerary ?? []).filter(isSampleItinerarySegment);
      return {
        ...draft,
        durationMinutes,
        availabilityValidated: viable,
        availabilityNote: itineraryAdjusted && adjustmentNote ? adjustmentNote : result.note,
        availabilityStatus: viable
          ? PLAN_AVAILABILITY_STATUSES.AVAILABLE
          : planAvailabilityStatusFromCheck({
              previouslyValidated: false,
              result,
            }),
        payload: {
          ...structuredPayload,
          startTime,
          itinerary,
          requestedStartTime: draft.payload.startTime,
          itineraryAdjusted,
          adjustmentNote: itineraryAdjusted ? adjustmentNote : undefined,
          customerAvailabilityNote:
            itineraryAdjusted && adjustmentNote ? adjustmentNote : draft.payload.customerAvailabilityNote,
          resourceRequirements,
          schedule: [
            ...(sampleItinerary.length > 0
              ? sampleItinerary.map((row) => `${row.startTime}–${row.endTime} ${row.label}`)
              : draft.payload.schedule),
            ...rotationNotes,
          ],
        },
      };
    }),
  );
}
