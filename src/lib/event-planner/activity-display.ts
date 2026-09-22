import { formatDurationMinutes } from "@/lib/event-planner/labels";
import type { EventPlanActivity, EventPlanItinerarySegment } from "@/types/event-planner";

function pluralizeUnit(unit: string, quantity: number): string {
  if (quantity === 1) {
    return unit;
  }
  if (unit.endsWith("s")) {
    return unit;
  }
  return `${unit}s`;
}

export function formatActivityQuantity(
  activity: Pick<EventPlanActivity, "quantity" | "unitLabel">,
  guestCount?: number | null,
): string | null {
  if (activity.unitLabel) {
    return `${activity.quantity} ${pluralizeUnit(activity.unitLabel, activity.quantity)}`;
  }
  if (guestCount && guestCount > 0 && (activity.quantity === 1 || activity.quantity === guestCount)) {
    return `${guestCount} guests`;
  }
  if (activity.quantity > 1) {
    return String(activity.quantity);
  }
  return null;
}

export function durationMinutesForActivity(
  activity: Pick<EventPlanActivity, "name" | "startTime" | "endTime">,
  itinerary?: EventPlanItinerarySegment[] | null,
  knowledgeDurationMinutes?: number | null,
): number | null {
  const matching = itinerary?.find((segment) => {
    const label = segment.label.toLowerCase();
    const name = activity.name.toLowerCase();
    return label.includes(name) || name.includes(label);
  });
  if (matching?.durationMinutes && matching.durationMinutes > 0) {
    return matching.durationMinutes;
  }
  if (knowledgeDurationMinutes && knowledgeDurationMinutes > 0) {
    return knowledgeDurationMinutes;
  }
  return null;
}

export function formatActivityDetails(
  activity: EventPlanActivity,
  options?: {
    guestCount?: number | null;
    durationMinutes?: number | null;
    itinerary?: EventPlanItinerarySegment[] | null;
  },
): string {
  const duration =
    options?.durationMinutes ??
    durationMinutesForActivity(activity, options?.itinerary ?? null);
  const parts: string[] = [];
  if (duration && duration > 0) {
    parts.push(formatDurationMinutes(duration));
  }
  const quantity = formatActivityQuantity(activity, options?.guestCount);
  if (quantity) {
    parts.push(quantity);
  }
  return parts.join(" · ");
}

export function formatActivityLine(
  activity: EventPlanActivity,
  options?: {
    guestCount?: number | null;
    durationMinutes?: number | null;
    itinerary?: EventPlanItinerarySegment[] | null;
  },
): string {
  const details = formatActivityDetails(activity, options);
  return details ? `${activity.name} · ${details}` : activity.name;
}
