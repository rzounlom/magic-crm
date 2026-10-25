import { formatDurationMinutes } from "@/lib/event-planner/labels";
import type { ItinerarySegment } from "@/types/catalog";
import { PRODUCT_SCHEDULING_BEHAVIORS } from "@/types/catalog";
import {
  diningBlockMinutes,
  diningIsSequential,
  diningPlacementFromFlags,
  diningSegmentLabel,
  type DiningPlacement,
} from "@/server/catalog/dining-placement";
import {
  customerActivityName,
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
  /** Dining blocks, activities, and overlapping space windows. */
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
  diningPlacement?: DiningPlacement | string | null;
  products: ItineraryProduct[];
  preserveOrder?: boolean;
  /** Used only when the proposal has no timed content and no requested window. */
  fallbackMinutes?: number;
  /** Customer-requested event length. Never shortened or lengthened. */
  requestedMinutes?: number | null;
}): ComposedItinerary {
  const placement = diningPlacementFromFlags(input.foodFirst, input.diningPlacement);
  const start = parseMinutes(input.startTime);
  const windowMinutes =
    input.requestedMinutes && input.requestedMinutes > 0 ? input.requestedMinutes : null;
  const allDining = input.products.filter((product) => roleOf(product) === "DINING");
  const sequentialDining =
    placement === "none" ? [] : diningIsSequential(placement) ? allDining : allDining.filter((product) => !isFlexibleDining(product));
  const flexibleDining =
    placement === "none"
      ? allDining
      : diningIsSequential(placement)
        ? []
        : allDining.filter(isFlexibleDining);
  const includedItems = input.products.filter(
    (product) =>
      roleOf(product) === PRODUCT_SCHEDULING_BEHAVIORS.NON_SCHEDULED ||
      flexibleDining.some((row) => row.id === product.id),
  );
  const sequencedProducts = input.products.filter((product) => roleOf(product) === PRODUCT_SCHEDULING_BEHAVIORS.SCHEDULED);
  const ordered = input.preserveOrder ? sequencedProducts : [...sequencedProducts];

  let cursor = start;
  const segments: ItinerarySegment[] = [];
  const sequenced: ComposedItinerary["sequenced"] = [];
  const overflowActivityNames: string[] = [];
  let overflowing = false;

  const fits = (duration: number) =>
    windowMinutes == null || cursor - start + duration <= windowMinutes;

  const pushDining = (products: ItineraryProduct[]) => {
    for (const [index, product] of products.entries()) {
      const duration = diningBlockMinutes(product);
      if (overflowing || !fits(duration)) {
        overflowing = true;
        overflowActivityNames.push(product.name);
        continue;
      }
      const next = cursor + duration;
      segments.push({
        id: `seg-dining-${product.id}-${index}`,
        startTime: minutesToClock(cursor),
        endTime: minutesToClock(next),
        label: diningSegmentLabel(product.name),
        productId: product.id,
        startOffsetMinutes: cursor - start,
        durationMinutes: duration,
        consumesInventory: false,
        role: "DINING",
      });
      cursor = next;
    }
  };

  if (placement === "first") {
    pushDining(sequentialDining);
  }

  for (const [index, product] of ordered.entries()) {
    const duration = sequencedDuration(product);
    if (!duration) {
      includedItems.push(product);
      continue;
    }
    if (overflowing || !fits(duration)) {
      overflowing = true;
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

  if (placement === "last") {
    pushDining(sequentialDining);
  } else if (placement === "flexible" && windowMinutes != null) {
    for (const [index, product] of sequentialDining.entries()) {
      const duration = diningBlockMinutes(product);
      if (!duration) {
        includedItems.push(product);
        continue;
      }
      const overlay = Math.min(duration, windowMinutes);
      segments.push({
        id: `seg-dining-${product.id}-${index}`,
        startTime: minutesToClock(start),
        endTime: minutesToClock(start + overlay),
        label: diningSegmentLabel(product.name),
        productId: product.id,
        startOffsetMinutes: 0,
        durationMinutes: overlay,
        consumesInventory: false,
        role: "DINING",
      });
    }
  } else if (placement === "flexible") {
    for (const product of sequentialDining) {
      includedItems.push(product);
    }
  }

  const activitySpan = cursor - start;
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
  diningPlacement?: DiningPlacement | string | null;
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
  const named = input.overflowActivityNames.map((name) => customerActivityName(name));
  const listed =
    named.length <= 1
      ? named[0]
      : named.length === 2
        ? `${named[0]} and ${named[1]}`
        : `${named.slice(0, -1).join(", ")}, and ${named[named.length - 1]}`;
  const preserved = listed
    ? ` ${listed} still ${named.length === 1 ? "needs" : "need"} to be scheduled.`
    : "";
  if (!requested) {
    return `These activities need a longer event window than we can confirm from the request.${preserved} The timeline is a sample until our team confirms the flow.`;
  }
  return `These activities need ${formatDurationMinutes(input.neededMinutes)}, which is longer than the requested ${formatDurationMinutes(requested)}.${preserved} The timeline is a sample until our team confirms the flow.`;
}
