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
  /** Dining, activities, and overlapping space windows. */
  itinerary: ItinerarySegment[];
  eventLengthMinutes: number;
  includedItems: ItineraryProduct[];
  sequenced: Array<{ id: string; name: string; durationMinutes: number }>;
  roomMinutes: number;
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

export function composeEventItinerary(input: {
  startTime: string | null;
  foodFirst: boolean;
  products: ItineraryProduct[];
  preserveOrder?: boolean;
  /** Used only when the proposal has no timed content. */
  fallbackMinutes?: number;
}): ComposedItinerary {
  const start = parseMinutes(input.startTime);
  const includedItems = input.products.filter(
    (product) => roleOf(product) === PRODUCT_SCHEDULING_BEHAVIORS.NON_SCHEDULED,
  );
  const sequencedProducts = input.products.filter((product) => {
    const role = roleOf(product);
    return role === "DINING" || role === PRODUCT_SCHEDULING_BEHAVIORS.SCHEDULED;
  });
  const ordered = input.preserveOrder
    ? sequencedProducts
    : orderSequenced(sequencedProducts, input.foodFirst);

  let cursor = start;
  const segments: ItinerarySegment[] = [];
  const sequenced: ComposedItinerary["sequenced"] = [];
  for (const [index, product] of ordered.entries()) {
    const duration = sequencedDuration(product);
    if (!duration) {
      includedItems.push(product);
      continue;
    }
    const role = roleOf(product) === "DINING" ? "DINING" : "ACTIVITY";
    const next = cursor + duration;
    segments.push({
      id: `seg-${product.id}-${index}`,
      startTime: minutesToClock(cursor),
      endTime: minutesToClock(next),
      label: product.name,
      productId: product.id,
      startOffsetMinutes: cursor - start,
      durationMinutes: duration,
      consumesInventory: role === "ACTIVITY",
      role,
    });
    sequenced.push({ id: product.id, name: product.name, durationMinutes: duration });
    cursor = next;
  }

  const activitySpan = cursor - start;
  const rooms = input.products.filter((product) => roleOf(product) === PRODUCT_SCHEDULING_BEHAVIORS.SPACE_WINDOW);
  const roomMinutes = rooms.reduce((max, product) => Math.max(max, product.durationMinutes ?? 0), 0);
  // Customer event length is the dining/activity span. A longer room entitlement
  // stays on the space reservation and does not stretch the event.
  const eventLengthMinutes =
    activitySpan > 0 ? activitySpan : roomMinutes > 0 ? roomMinutes : (input.fallbackMinutes ?? 0);
  const resolvedLength = eventLengthMinutes > 0 ? eventLengthMinutes : (input.fallbackMinutes ?? 0);

  rooms.forEach((product, index) => {
    const entitlement = product.durationMinutes && product.durationMinutes > 0 ? product.durationMinutes : 0;
    const reservationMinutes = Math.max(entitlement, activitySpan > 0 ? activitySpan : resolvedLength);
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
  };
}

function orderSequenced(products: ItineraryProduct[], foodFirst: boolean): ItineraryProduct[] {
  const food = products.filter((product) => roleOf(product) === "DINING");
  const rest = products.filter((product) => roleOf(product) !== "DINING");
  return foodFirst ? [...food, ...rest] : [...rest, ...food];
}

export function itinerarySpanMinutes(
  segments: Array<{ startTime: string; endTime: string; role?: string | null }>,
): number {
  const timed = segments.filter((segment) => segment.role !== "SPACE" && segment.startTime && segment.endTime);
  if (timed.length === 0) {
    return 0;
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
  }).itinerary.filter((segment) => segment.role !== "SPACE");
}

export function itineraryProductsFromOrder(products: ItineraryProduct[]): ItineraryProduct[] {
  return products;
}
