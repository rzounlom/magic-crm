/**
 * WordPress Event Planner `Itinerary` (3.4.0+ / 3.5.0) — presentation only.
 * Never mutates purchased play minutes or schedule timestamps used for pricing.
 */

import type { ItineraryRow } from "@/server/event-planner/wp-parity/types";

export type CompactItinerarySlot = ItineraryRow & {
  start: string;
  end: string;
};

export type CompactItineraryRow = {
  start: string;
  end: string;
  end_minute: number;
  slots: CompactItinerarySlot[];
  all: boolean;
};

export type CompactItinerary = {
  groups: string[];
  rows: CompactItineraryRow[];
  notes: string[];
};

function clock(row: ItineraryRow): { start: string; end: string } {
  return {
    start: row.start ?? "",
    end: row.end ?? "",
  };
}

/**
 * `Itinerary::compact($slots)` — side-by-side buckets + prep notes.
 * Shoe / axe-briefing details move into notes; activity times stay intact.
 */
export function compactWpItinerary(slots: readonly ItineraryRow[]): CompactItinerary {
  const groupSet = new Set<string>();
  for (const slot of slots) {
    if (slot.group !== "All guests") {
      groupSet.add(slot.group);
    }
  }

  const notes: string[] = [];
  const display: CompactItinerarySlot[] = [];

  for (const slot of slots) {
    const { start, end } = clock(slot);
    const group = slot.group;
    const label = slot.label;
    const multi = groupSet.size > 1;
    if (label === "Bowling check-in & shoes") {
      notes.push(`${multi ? `${group}: ` : ""}Bowling shoes ${start}–${end}.`);
      continue;
    }
    if (label === "Axe Check-In & Safety Briefing") {
      continue;
    }
    if (label === "Axe Throwing") {
      let merged: CompactItinerarySlot = { ...slot, start, end };
      for (const prep of slots) {
        if (
          prep.group === group &&
          prep.label === "Axe Check-In & Safety Briefing" &&
          prep.end_minute === slot.start_minute
        ) {
          const prepClock = clock(prep);
          notes.push(
            `${multi ? `${group}: ` : ""}Axe briefing ${prepClock.start}–${prepClock.end}; throwing ${start}–${end}.`,
          );
          merged = {
            ...merged,
            start: prepClock.start,
            start_minute: prep.start_minute,
            label: "Axe briefing + throwing",
          };
          break;
        }
      }
      display.push(merged);
      continue;
    }
    display.push({ ...slot, start, end });
  }

  // Preserve an unmatched briefing rather than accidentally hiding information.
  for (const prep of slots) {
    if (prep.label !== "Axe Check-In & Safety Briefing") {
      continue;
    }
    let paired = false;
    for (const slot of slots) {
      if (
        slot.label === "Axe Throwing" &&
        slot.group === prep.group &&
        prep.end_minute === slot.start_minute
      ) {
        paired = true;
        break;
      }
    }
    if (!paired) {
      const { start, end } = clock(prep);
      display.push({ ...prep, start, end });
    }
  }

  display.sort((a, b) => a.start_minute - b.start_minute);

  const buckets = new Map<string, CompactItineraryRow>();
  for (const slot of display) {
    const key = `${slot.start_minute}${slot.group === "All guests" ? "_all" : "_groups"}`;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = {
        start: slot.start,
        end: slot.end,
        end_minute: slot.end_minute,
        slots: [],
        all: slot.group === "All guests",
      };
      buckets.set(key, bucket);
    }
    if (slot.end_minute > bucket.end_minute) {
      bucket.end = slot.end;
      bucket.end_minute = slot.end_minute;
    }
    bucket.slots.push(slot);
  }

  return {
    groups: groupSet.size > 1 ? [...groupSet] : [],
    rows: [...buckets.values()],
    notes: [...new Set(notes)],
  };
}

function slotLabel(slot: CompactItinerarySlot, row: CompactItineraryRow): string {
  return `${slot.label}${slot.end_minute < row.end_minute ? ` (ends ${slot.end})` : ""}`;
}

/** Plain-text presentation (`Itinerary::text`) for staff copy / reports. */
export function formatWpItineraryText(slots: readonly ItineraryRow[]): string {
  const data = compactWpItinerary(slots);
  let text = "";
  for (const row of data.rows) {
    const labels = row.slots.map(
      (slot) => `${data.groups.length ? `${slot.group} — ` : ""}${slotLabel(slot, row)}`,
    );
    text += `${row.start}–${row.end} | ${labels.join(" | ")}\n`;
  }
  for (const note of data.notes) {
    text += `${note}\n`;
  }
  return text;
}
