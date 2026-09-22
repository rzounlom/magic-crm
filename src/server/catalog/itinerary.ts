import type { ItinerarySegment } from "@/types/catalog";
import { minutesToClock, parseClockToMinutes } from "@/server/resources/time-window";

function parseMinutes(startTime: string | null): number {
  return parseClockToMinutes(startTime) ?? 12 * 60;
}

export type ItineraryProduct = {
  id: string;
  name: string;
  kind: string;
  durationMinutes: number | null;
};

export function buildItinerary(input: {
  startTime: string | null;
  durationMinutes: number;
  foodFirst: boolean;
  products: ItineraryProduct[];
  preserveOrder?: boolean;
}): ItinerarySegment[] {
  const remaining = Math.max(30, input.durationMinutes);
  const start = parseMinutes(input.startTime);
  const food = input.products.filter((row) => row.kind === "FOOD");
  const rest = input.products.filter((row) => row.kind !== "FOOD");
  const ordered = input.preserveOrder
    ? input.products
    : input.foodFirst
      ? [...food, ...rest]
      : [...rest, ...food];
  if (ordered.length === 0) {
    return [
      {
        id: "seg-event-window",
        startTime: minutesToClock(start),
        endTime: minutesToClock(start + remaining),
        label: "Event window",
        startOffsetMinutes: 0,
        durationMinutes: remaining,
        consumesInventory: false,
      },
    ];
  }

  const fallbackShare = Math.max(30, Math.floor(remaining / ordered.length));
  let cursor = start;
  const segments: ItinerarySegment[] = [];
  for (const [index, product] of ordered.entries()) {
    const isLast = index === ordered.length - 1;
    const duration =
      product.durationMinutes && product.durationMinutes > 0
        ? product.durationMinutes
        : isLast
          ? Math.max(30, start + remaining - cursor)
          : fallbackShare;
    const next = cursor + duration;
    segments.push({
      id: `seg-${product.id}-${index}`,
      startTime: minutesToClock(cursor),
      endTime: minutesToClock(next),
      label: product.name,
      productId: product.id,
      startOffsetMinutes: cursor - start,
      durationMinutes: duration,
      consumesInventory: product.kind !== "FOOD",
    });
    cursor = next;
  }
  return segments;
}

export function itineraryProductsFromOrder(products: ItineraryProduct[]): ItineraryProduct[] {
  return products;
}
