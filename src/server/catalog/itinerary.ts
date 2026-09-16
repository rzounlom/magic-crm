import type { ItinerarySegment } from "@/types/catalog";

function parseMinutes(startTime: string | null): number {
  if (!startTime) {
    return 12 * 60;
  }
  const [hour, minute] = startTime.split(":").map(Number);
  return (hour ?? 12) * 60 + (minute ?? 0);
}

function clock(totalMinutes: number): string {
  const wrapped = ((totalMinutes % (24 * 60)) + 24 * 60) % (24 * 60);
  const hour = Math.floor(wrapped / 60);
  const minute = wrapped % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
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
}): ItinerarySegment[] {
  const remaining = Math.max(30, input.durationMinutes);
  const start = parseMinutes(input.startTime);
  const food = input.products.filter((row) => row.kind === "FOOD");
  const rest = input.products.filter((row) => row.kind !== "FOOD");
  const ordered = input.foodFirst ? [...food, ...rest] : [...rest, ...food];
  if (ordered.length === 0) {
    return [
      {
        startTime: clock(start),
        endTime: clock(start + remaining),
        label: "Event window",
      },
    ];
  }

  const explicit = ordered.reduce((sum, row) => sum + (row.durationMinutes ?? 0), 0);
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
      startTime: clock(cursor),
      endTime: clock(next),
      label: product.name,
      productId: product.id,
    });
    cursor = next;
  }
  if (explicit === 0) {
    return segments;
  }
  return segments;
}
