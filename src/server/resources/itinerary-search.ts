import { composeEventItinerary, type ItineraryProduct } from "@/server/catalog/itinerary";
import { resolveSchedulingBehavior } from "@/server/catalog/scheduling-behavior";
import { PRODUCT_SCHEDULING_BEHAVIORS } from "@/types/catalog";
import {
  conflictingActivityLabels,
  customerAdjustmentNote,
  stampPlanResourceWindows,
} from "@/server/resources/segment-windows";
import { logAvailabilitySearch } from "@/server/logging";
import { NEARBY_START_OFFSETS_MINUTES } from "@/server/services/nearby-availability";
import { minutesToClock, parseClockToMinutes } from "@/server/resources/time-window";
import type { EventPlanItinerarySegment } from "@/types/event-planner";
import type { PlanResourceRequirement, ResourceAvailabilityResult } from "@/types/resource-schedule";
import { SCHEDULE_DAY_END_MINUTE, SCHEDULE_DAY_START_MINUTE } from "@/types/resource-schedule";

/**
 * Bounded deterministic search, not a generic constraint solver.
 *
 * Order of attempts:
 * 1. requested start, original activity order
 * 2. requested start, other bounded activity permutations (food stays first when configured)
 * 3. ±30 / ±60 / ±90 / ±120 minutes, original order then permutations
 *
 * Scoring is implied by that order: minimum event-start movement, then preserve
 * original activity order, then preserve requested attractions / package tier
 * (the caller already searches within one tier).
 */
export type ViableItinerarySearchResult = {
  startTime: string;
  eventLengthMinutes: number;
  itinerary: EventPlanItinerarySegment[];
  requirements: PlanResourceRequirement[];
  availability: ResourceAvailabilityResult;
  adjusted: boolean;
  orderChanged: boolean;
  originalConflictLabels: string[];
  adjustmentNote: string;
};

function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) {
    return [items];
  }
  if (items.length > 3) {
    return [items, [...items].reverse()];
  }
  const results: T[][] = [];
  const used = items.map(() => false);
  const current: T[] = [];
  function walk() {
    if (current.length === items.length) {
      results.push([...current]);
      return;
    }
    for (let index = 0; index < items.length; index += 1) {
      if (used[index]) {
        continue;
      }
      used[index] = true;
      current.push(items[index]!);
      walk();
      current.pop();
      used[index] = false;
    }
  }
  walk();
  return results;
}

function isSequencedProduct(product: ItineraryProduct): boolean {
  const role = resolveSchedulingBehavior(product);
  return role === "DINING" || role === PRODUCT_SCHEDULING_BEHAVIORS.SCHEDULED;
}

export function candidateProductOrders(input: {
  products: ItineraryProduct[];
  foodFirst: boolean;
}): ItineraryProduct[][] {
  const sequenced = input.products.filter(isSequencedProduct);
  const food = sequenced.filter((row) => resolveSchedulingBehavior(row) === "DINING");
  const activities = sequenced.filter((row) => resolveSchedulingBehavior(row) !== "DINING");
  const held = input.products.filter((row) => !isSequencedProduct(row));
  return permutations(activities).map((perm) => [
    ...(input.foodFirst ? [...food, ...perm] : [...perm, ...food]),
    ...held,
  ]);
}

export async function searchViableStructuredItinerary(input: {
  requestedStartTime: string | null;
  durationMinutes: number;
  foodFirst: boolean;
  products: ItineraryProduct[];
  baseRequirements: PlanResourceRequirement[];
  check: (input: {
    startTime: string;
    eventLengthMinutes: number;
    itinerary: EventPlanItinerarySegment[];
    requirements: PlanResourceRequirement[];
  }) => Promise<ResourceAvailabilityResult>;
  offsetsMinutes?: number[];
  dayStartMinute?: number;
  dayEndMinute?: number;
  queryPhaseMs?: () => number;
}): Promise<ViableItinerarySearchResult | null> {
  if (!input.requestedStartTime) {
    return null;
  }
  const base = parseClockToMinutes(input.requestedStartTime);
  if (base == null) {
    return null;
  }
  const dayStart = input.dayStartMinute ?? SCHEDULE_DAY_START_MINUTE;
  const dayEnd = input.dayEndMinute ?? SCHEDULE_DAY_END_MINUTE;
  const orders = candidateProductOrders({ products: input.products, foodFirst: input.foodFirst });
  let originalConflictLabels: string[] = [];
  let candidatesEvaluated = 0;
  const started = Date.now();
  const offsets = input.offsetsMinutes ?? NEARBY_START_OFFSETS_MINUTES;
  const horizonMinutes = offsets.length > 0 ? Math.max(...offsets) - Math.min(...offsets) : 0;

  for (const offset of offsets) {
    const next = base + offset;
    if (next < dayStart || next > dayEnd - 30) {
      continue;
    }
    const startTime = minutesToClock(next);
    for (const [orderIndex, products] of orders.entries()) {
      const composed = composeEventItinerary({
        startTime,
        foodFirst: input.foodFirst,
        preserveOrder: true,
        products,
        fallbackMinutes: input.durationMinutes,
      });
      const itinerary = composed.itinerary;
      const requirements = stampPlanResourceWindows({
        itinerary,
        startTime,
        resourceRequirements: input.baseRequirements,
      });
      candidatesEvaluated += 1;
      const availability = await input.check({
        startTime,
        eventLengthMinutes: composed.eventLengthMinutes,
        itinerary,
        requirements,
      });
      if (offset === 0 && orderIndex === 0 && (!availability.validated || !availability.available)) {
        originalConflictLabels = conflictingActivityLabels(requirements, availability.types);
      }
      if (availability.validated && availability.available) {
        const orderChanged = orderIndex > 0;
        const adjusted = offset !== 0 || orderChanged;
        logAvailabilitySearch({
          phase: "proposal_itinerary",
          candidatesEvaluated,
          horizonMinutes,
          queryPhaseMs: input.queryPhaseMs?.() ?? 0,
          totalMs: Date.now() - started,
          selectedStart: startTime,
        });
        return {
          startTime,
          eventLengthMinutes: composed.eventLengthMinutes,
          itinerary,
          requirements,
          availability,
          adjusted,
          orderChanged,
          originalConflictLabels,
          adjustmentNote: adjusted
            ? customerAdjustmentNote({
                conflictLabels: originalConflictLabels,
                requestedStartTime: input.requestedStartTime,
                viableStartTime: startTime,
                orderChanged,
              })
            : "",
        };
      }
    }
  }
  logAvailabilitySearch({
    phase: "proposal_itinerary",
    candidatesEvaluated,
    horizonMinutes,
    queryPhaseMs: input.queryPhaseMs?.() ?? 0,
    totalMs: Date.now() - started,
    selectedStart: null,
  });
  return null;
}
