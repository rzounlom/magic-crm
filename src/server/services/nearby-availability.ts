import { SCHEDULE_DAY_END_MINUTE, SCHEDULE_DAY_START_MINUTE } from "@/types/resource-schedule";
import type { ResourceAvailabilityResult } from "@/types/resource-schedule";

const DEFAULT_OFFSETS_MINUTES = [-90, -60, -30, 30, 60, 90, 120];

function parseClock(startTime: string): number | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)/.exec(startTime);
  if (!match) {
    return null;
  }
  return Number(match[1]) * 60 + Number(match[2]);
}

function formatClock(totalMinutes: number): string {
  const hour = Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export type NearbyAvailableStart = {
  startTime: string;
  note: string;
};

export async function findNearbyAvailableStarts(input: {
  startTime: string | null;
  check: (startTime: string) => Promise<ResourceAvailabilityResult>;
  offsetsMinutes?: number[];
  limit?: number;
  dayStartMinute?: number;
  dayEndMinute?: number;
}): Promise<NearbyAvailableStart[]> {
  if (!input.startTime) {
    return [];
  }
  const base = parseClock(input.startTime);
  if (base == null) {
    return [];
  }
  const dayStart = input.dayStartMinute ?? SCHEDULE_DAY_START_MINUTE;
  const dayEnd = input.dayEndMinute ?? SCHEDULE_DAY_END_MINUTE;
  const suggestions: NearbyAvailableStart[] = [];
  for (const offset of input.offsetsMinutes ?? DEFAULT_OFFSETS_MINUTES) {
    const next = base + offset;
    if (next < dayStart || next > dayEnd - 30) {
      continue;
    }
    const startTime = formatClock(next);
    const result = await input.check(startTime);
    if (result.validated && result.available) {
      suggestions.push({
        startTime,
        note: `Start at ${startTime} currently fits the required resources.`,
      });
    }
    if (suggestions.length >= (input.limit ?? 3)) {
      break;
    }
  }
  return suggestions;
}
