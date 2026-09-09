import { applyAvailabilityProvider, type PlanAvailabilityProvider } from "@/server/event-planner/availability";
import { buildEventPlans, type BuildEventPlansInput } from "@/server/event-planner/build-event-plans";
import { applyInventoryFeasibility, type InventoryCount } from "@/server/resources/feasibility";
import { planAvailabilityStatusFromCheck } from "@/server/resources/plan-availability-status";
import {
  derivePlanResourceRequirements,
  type StoredKnowledgeResourceRequirement,
} from "@/server/resources/requirements";
import type { EventPlanDraft } from "@/types/event-planner";
import type { ResourceAvailabilityResult } from "@/types/resource-schedule";

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
      const resourceRequirements = applyInventoryFeasibility(derived, inventory);
      const rotationNotes = resourceRequirements
        .map((row) => row.rotationNote)
        .filter((note): note is string => Boolean(note));
      const availability = await applyAvailabilityProvider(
        {
          eventDate: draft.payload.eventDate,
          startTime: draft.payload.startTime,
          durationMinutes: draft.durationMinutes,
          guestCount: draft.guestCount,
          activities: draft.payload.activities,
          spaces: draft.payload.spaces,
          resourceRequirements,
          excludeInquiryId: input.excludeInquiryId,
        },
        input.availabilityProvider,
      );
      const validated = availability.validated === true;
      const result: ResourceAvailabilityResult = {
        validated,
        available: availability.available ?? validated,
        note: availability.note ?? draft.availabilityNote,
        types: availability.types ?? [],
      };
      return {
        ...draft,
        availabilityValidated: result.validated,
        availabilityNote: result.note,
        availabilityStatus: planAvailabilityStatusFromCheck({
          previouslyValidated: false,
          result,
        }),
        payload: {
          ...draft.payload,
          resourceRequirements,
          schedule: [...draft.payload.schedule, ...rotationNotes],
        },
      };
    }),
  );
}
