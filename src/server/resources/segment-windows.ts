import { occupancyInstants, resolveSchedulingTimeZone } from "@/lib/inquiries/tenant-datetime";
import { customerActivityName } from "@/server/catalog/scheduling-behavior";
import { applyRotationWindows } from "@/server/resources/rotation-windows";
import {
  minutesToClock,
  parseClockToMinutes,
  requirementOccupancyWindow,
  type OccupancyWindow,
} from "@/server/resources/time-window";
import type { EventPlanItinerarySegment, EventPlanPayload } from "@/types/event-planner";
import type { PlanResourceRequirement } from "@/types/resource-schedule";

export type SegmentResourceWindow = {
  resourceRequirement: PlanResourceRequirement;
  startsAt: Date;
  endsAt: Date;
  startMinute: number;
  endMinute: number;
  segmentId: string | null;
};

function eventStartMinutes(startTime: string | null | undefined): number {
  return parseClockToMinutes(startTime) ?? 12 * 60;
}

function durationFromClocks(startTime: string, endTime: string): number {
  const start = parseClockToMinutes(startTime);
  const end = parseClockToMinutes(endTime);
  if (start == null || end == null) {
    return 0;
  }
  return end <= start ? end + 24 * 60 - start : end - start;
}

/**
 * Fill startOffsetMinutes / durationMinutes and recompute clocks from event start.
 * Legacy snapshots that only have startTime/endTime remain renderable.
 */
export function materializeItinerarySegments(input: {
  itinerary: EventPlanItinerarySegment[];
  eventStartTime: string | null | undefined;
}): EventPlanItinerarySegment[] {
  const eventStart = eventStartMinutes(input.eventStartTime);
  return input.itinerary.map((segment, index) => {
    const offset =
      segment.startOffsetMinutes != null
        ? segment.startOffsetMinutes
        : (parseClockToMinutes(segment.startTime) ?? eventStart) - eventStart;
    const duration =
      segment.durationMinutes && segment.durationMinutes > 0
        ? segment.durationMinutes
        : durationFromClocks(segment.startTime, segment.endTime) || 30;
    const startMinute = eventStart + offset;
    return {
      ...segment,
      id: segment.id ?? `seg-${segment.productId ?? "item"}-${index}`,
      startOffsetMinutes: offset,
      durationMinutes: duration,
      startTime: minutesToClock(startMinute),
      endTime: minutesToClock(startMinute + duration),
    };
  });
}

export function shiftItineraryToStart(
  itinerary: EventPlanItinerarySegment[],
  newStartTime: string | null,
): EventPlanItinerarySegment[] {
  return materializeItinerarySegments({
    itinerary,
    eventStartTime: newStartTime,
  });
}

function matchSegment(
  itinerary: EventPlanItinerarySegment[],
  requirement: PlanResourceRequirement,
): EventPlanItinerarySegment | null {
  const productId = requirement.productId ?? requirement.knowledgeItemId;
  const byProduct = itinerary.find(
    (segment) => segment.productId && (segment.productId === productId || segment.productId === requirement.knowledgeItemId),
  );
  if (byProduct) {
    return byProduct;
  }
  const name = requirement.knowledgeItemName.trim().toLowerCase();
  if (!name) {
    return null;
  }
  return (
    itinerary.find((segment) => segment.label.trim().toLowerCase() === name) ?? null
  );
}

/**
 * Stamp each requirement with the itinerary segment window for that product.
 * Requirements without a matching segment keep the full event window (legacy snapshots).
 * Call applyRotationWindows after this so rotation waves still override.
 */
export function applyItineraryWindows(
  requirements: PlanResourceRequirement[],
  payload: Pick<EventPlanPayload, "itinerary" | "startTime">,
): PlanResourceRequirement[] {
  const itinerary = materializeItinerarySegments({
    itinerary: payload.itinerary ?? [],
    eventStartTime: payload.startTime,
  });
  if (itinerary.length === 0) {
    return requirements;
  }
  const consumingIds = new Set(
    requirements.map((row) => row.productId ?? row.knowledgeItemId).filter(Boolean),
  );
  const labeled = itinerary.map((segment) => ({
    ...segment,
    consumesInventory:
      Boolean(segment.productId && consumingIds.has(segment.productId)) ||
      segment.consumesInventory === true,
  }));
  return requirements.map((requirement) => {
    const segment = matchSegment(labeled, requirement);
    if (!segment) {
      return requirement;
    }
    return {
      ...requirement,
      segmentId: segment.id ?? null,
      windowStartTime: segment.startTime,
      windowEndTime: segment.endTime,
      durationMinutes: segment.durationMinutes ?? requirement.durationMinutes,
    };
  });
}

export function stampPlanResourceWindows(
  payload: Pick<EventPlanPayload, "itinerary" | "startTime" | "rotations" | "resourceRequirements">,
  requirements = payload.resourceRequirements ?? [],
): PlanResourceRequirement[] {
  return applyRotationWindows(applyItineraryWindows(requirements, payload), payload as EventPlanPayload);
}

export function resolveSegmentResourceWindows(input: {
  eventDate: string;
  eventStartTime: string | null;
  durationMinutes: number;
  itinerary: EventPlanItinerarySegment[];
  requirements: PlanResourceRequirement[];
  timeZone: string;
  fallbackWindow: OccupancyWindow;
}): SegmentResourceWindow[] {
  const stamped = stampPlanResourceWindows({
    itinerary: input.itinerary,
    startTime: input.eventStartTime,
    resourceRequirements: input.requirements,
  });
  const zone = resolveSchedulingTimeZone({ organizationTimeZone: input.timeZone });
  return stamped.map((requirement) => {
    const window = requirementOccupancyWindow(requirement, input.fallbackWindow);
    const instants = occupancyInstants({ ...window, timeZone: zone });
    return {
      resourceRequirement: requirement,
      startsAt: instants.startsAt,
      endsAt: instants.endsAt,
      startMinute: window.startMinute,
      endMinute: window.endMinute,
      segmentId: requirement.segmentId ?? null,
    };
  });
}

export function conflictingActivityLabels(
  requirements: PlanResourceRequirement[],
  types: Array<{ resourceTypeSlug: string; conflict: boolean }>,
): string[] {
  const conflictSlugs = new Set(types.filter((row) => row.conflict).map((row) => row.resourceTypeSlug));
  const labels: string[] = [];
  for (const requirement of requirements) {
    if (!conflictSlugs.has(requirement.resourceTypeSlug)) {
      continue;
    }
    const label = requirement.knowledgeItemName.trim();
    if (label && !labels.includes(label)) {
      labels.push(label);
    }
  }
  if (labels.length > 0) {
    return labels;
  }
  return types.filter((row) => row.conflict).map((row) => row.resourceTypeSlug);
}

export function customerAdjustmentNote(input: {
  conflictLabels: string[];
  requestedStartTime: string | null;
  viableStartTime: string;
  orderChanged: boolean;
}): string {
  const activity = customerActivityName(input.conflictLabels[0] ?? "an activity");
  if (input.orderChanged && input.viableStartTime === input.requestedStartTime) {
    return `Your requested time overlaps existing ${activity} reservations, so the activity order was adjusted.`;
  }
  return `Your requested time overlaps existing ${activity} reservations, so this option has been adjusted to start at ${input.viableStartTime}.`;
}
