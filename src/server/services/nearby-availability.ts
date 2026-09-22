import { SCHEDULE_DAY_END_MINUTE, SCHEDULE_DAY_START_MINUTE } from "@/types/resource-schedule";
import type { ResourceAvailabilityResult } from "@/types/resource-schedule";
import { minutesToClock, parseClockToMinutes } from "@/server/resources/time-window";

/**
 * Closest-first nearby search. Include 0 so callers can reuse the same loop for
 * the requested time. Tenant operating hours, when configured, should be passed
 * as dayStartMinute/dayEndMinute — do not hardcode a location's hours here.
 */
export const NEARBY_START_OFFSETS_MINUTES = [0, -30, 30, -60, 60, -90, 90, -120, 120];

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
  includeRequested?: boolean;
}): Promise<NearbyAvailableStart[]> {
  if (!input.startTime) {
    return [];
  }
  const base = parseClockToMinutes(input.startTime);
  if (base == null) {
    return [];
  }
  const dayStart = input.dayStartMinute ?? SCHEDULE_DAY_START_MINUTE;
  const dayEnd = input.dayEndMinute ?? SCHEDULE_DAY_END_MINUTE;
  const suggestions: NearbyAvailableStart[] = [];
  for (const offset of input.offsetsMinutes ?? NEARBY_START_OFFSETS_MINUTES) {
    if (offset === 0 && input.includeRequested !== true) {
      continue;
    }
    const next = base + offset;
    if (next < dayStart || next > dayEnd - 30) {
      continue;
    }
    const startTime = minutesToClock(next);
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
