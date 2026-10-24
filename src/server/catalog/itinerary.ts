import { formatDurationMinutes } from "@/lib/event-planner/labels";
import type { ItinerarySegment } from "@/types/catalog";
import { PRODUCT_SCHEDULING_BEHAVIORS } from "@/types/catalog";
import {
  resolveSchedulingBehavior,
  type ResolvedSchedulingRole,
} from "@/server/catalog/scheduling-behavior";
import { minutesToClock, parseClockToMinutes } from "@/server/resources/time-window";

function parseMinutes(startTime: string | null): number {
  return parseClockToMinutes(startTime) ?? 12 * 60;
}

export type ItineraryProduct = {
  id: string;
  name: string;
  kind: string;
  durationMinutes: number | null;
  schedulingBehavior?: string | null;
  hasResourceRequirements?: boolean;
};

export type ComposedItinerary = {
  /** Dining overlays, activities, and overlapping space windows. */
  itinerary: ItinerarySegment[];
  eventLengthMinutes: number;
  includedItems: ItineraryProduct[];
  sequenced: Array<{ id: string; name: string; durationMinutes: number }>;
  roomMinutes: number;
  /** False when timed activities cannot all fit in the requested window. */
  precise: boolean;
  overflowActivityNames: string[];
};

function roleOf(product: ItineraryProduct): ResolvedSchedulingRole {
  return resolveSchedulingBehavior(product);
}

function sequencedDuration(product: ItineraryProduct): number | null {
  if (product.durationMinutes && product.durationMinutes > 0) {
    return product.durationMinutes;
  }
  return null;
}

function isFlexibleDining(product: ItineraryProduct): boolean {
  return roleOf(product) === "DINING" && product.hasResourceRequirements !== true;
}

export function composeEventItinerary(input: {
  startTime: string | null;
  foodFirst: boolean;
  products: ItineraryProduct[];
  preserveOrder?: boolean;
  /** Used only when the proposal has no timed content and no requested window. */
  fallbackMinutes?: number;
  /** Customer-requested event length. Never shortened or lengthened. */
  requestedMinutes?: number | null;
}): ComposedItinerary {
  const start = parseMinutes(input.startTime);
  const windowMinutes =
    input.requestedMinutes && input.requestedMinutes > 0 ? input.requestedMinutes : null;
  const includedItems = input.products.filter(
    (product) => roleOf(product) === PRODUCT_SCHEDULING_BEHAVIORS.NON_SCHEDULED || isFlexibleDining(product),
  );
  const timedDining = input.products.filter(
    (product) => roleOf(product) === "DINING" && !isFlexibleDining(product),
  );
  const sequencedProducts = input.products.filter((product) => roleOf(product) === PRODUCT_SCHEDULING_BEHAVIORS.SCHEDULED);
  // Dining is concurrent/flexible, so foodFirst no longer reorders the activity clock.
  const ordered = input.preserveOrder ? sequencedProducts : [...sequencedProducts];

  let cursor = start;
  const segments: ItinerarySegment[] = [];
  const sequenced: ComposedItinerary["sequenced"] = [];
  const overflowActivityNames: string[] = [];

  for (const [index, product] of ordered.entries()) {
    const duration = sequencedDuration(product);
    if (!duration) {
      includedItems.push(product);
      continue;
    }
    if (windowMinutes != null && cursor - start + duration > windowMinutes) {
      overflowActivityNames.push(product.name);
      continue;
    }
    const next = cursor + duration;
    segments.push({
      id: `seg-${product.id}-${index}`,
      startTime: minutesToClock(cursor),
      endTime: minutesToClock(next),
      label: product.name,
      productId: product.id,
      startOffsetMinutes: cursor - start,
      durationMinutes: duration,
      consumesInventory: true,
      role: "ACTIVITY",
    });
    sequenced.push({ id: product.id, name: product.name, durationMinutes: duration });
    cursor = next;
  }

  const activitySpan = cursor - start;
  if (windowMinutes != null) {
    for (const [index, product] of timedDining.entries()) {
      const duration = sequencedDuration(product);
      if (!duration) {
        includedItems.push(product);
        continue;
      }
      const overlay = Math.min(duration, windowMinutes);
      segments.push({
        id: `seg-dining-${product.id}-${index}`,
        startTime: minutesToClock(start),
        endTime: minutesToClock(start + overlay),
        label: product.name,
        productId: product.id,
        startOffsetMinutes: 0,
        durationMinutes: overlay,
        consumesInventory: false,
        role: "DINING",
      });
    }
  } else {
    for (const product of timedDining) {
      includedItems.push(product);
    }
  }

  const rooms = input.products.filter((product) => roleOf(product) === PRODUCT_SCHEDULING_BEHAVIORS.SPACE_WINDOW);
  const roomMinutes = rooms.reduce((max, product) => Math.max(max, product.durationMinutes ?? 0), 0);
  const eventLengthMinutes =
    windowMinutes ??
    (activitySpan > 0 ? activitySpan : roomMinutes > 0 ? roomMinutes : (input.fallbackMinutes ?? 0));
  const resolvedLength = eventLengthMinutes > 0 ? eventLengthMinutes : (input.fallbackMinutes ?? 0);

  rooms.forEach((product, index) => {
    const entitlement = product.durationMinutes && product.durationMinutes > 0 ? product.durationMinutes : 0;
    const reservationMinutes = Math.max(entitlement, resolvedLength);
    segments.push({
      id: `seg-space-${product.id}-${index}`,
      startTime: minutesToClock(start),
      endTime: minutesToClock(start + reservationMinutes),
      label: product.name,
      productId: product.id,
      startOffsetMinutes: 0,
      durationMinutes: reservationMinutes,
      consumesInventory: true,
      role: "SPACE",
    });
  });

  return {
    itinerary: segments,
    eventLengthMinutes: resolvedLength,
    includedItems,
    sequenced,
    roomMinutes,
    precise: overflowActivityNames.length === 0,
    overflowActivityNames,
  };
}

export function itinerarySpanMinutes(
  segments: Array<{ startTime: string; endTime: string; role?: string | null }>,
): number {
  const timed = segments.filter((segment) => segment.role !== "SPACE" && segment.role !== "DINING" && segment.startTime && segment.endTime);
  if (timed.length === 0) {
    const dining = segments.filter((segment) => segment.role === "DINING" && segment.startTime && segment.endTime);
    if (dining.length === 0) {
      return 0;
    }
    const starts = dining.map((segment) => parseClockToMinutes(segment.startTime) ?? 0);
    const ends = dining.map((segment) => {
      const start = parseClockToMinutes(segment.startTime) ?? 0;
      const end = parseClockToMinutes(segment.endTime) ?? start;
      return end <= start ? end + 24 * 60 : end;
    });
    return Math.max(...ends) - Math.min(...starts);
  }
  const starts = timed.map((segment) => parseClockToMinutes(segment.startTime) ?? 0);
  const ends = timed.map((segment) => {
    const start = parseClockToMinutes(segment.startTime) ?? 0;
    const end = parseClockToMinutes(segment.endTime) ?? start;
    return end <= start ? end + 24 * 60 : end;
  });
  return Math.max(...ends) - Math.min(...starts);
}

export function buildItinerary(input: {
  startTime: string | null;
  durationMinutes: number;
  foodFirst: boolean;
  products: ItineraryProduct[];
  preserveOrder?: boolean;
}): ItinerarySegment[] {
  return composeEventItinerary({
    ...input,
    fallbackMinutes: input.durationMinutes,
    requestedMinutes: input.durationMinutes,
  }).itinerary.filter((segment) => segment.role !== "SPACE");
}

export function itineraryProductsFromOrder(products: ItineraryProduct[]): ItineraryProduct[] {
  return products;
}

export function scheduleLimitationText(input: {
  overflowActivityNames: string[];
  requestedMinutes: number | null | undefined;
  neededMinutes: number;
}): string | null {
  if (input.overflowActivityNames.length === 0) {
    return null;
  }
  const requested = input.requestedMinutes && input.requestedMinutes > 0 ? input.requestedMinutes : null;
  if (!requested) {
    return "These activities need a longer event window than we can confirm from the request.";
  }
  return `These activities need ${formatDurationMinutes(input.neededMinutes)}, which is longer than the requested ${formatDurationMinutes(requested)}. The timeline is a sample until our team confirms the flow.`;
}
