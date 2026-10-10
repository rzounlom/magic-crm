/**
 * Civil and absolute occupancy helpers for overnight / midnight-crossing events.
 *
 * Same-day conflict uses slotDate + minute ranges (DB int4range exclusion).
 * Cross-day conflict uses startsAt/endsAt (DB tstzrange exclusion + app queries).
 */
import { resolveStrictOccupancyInstants } from "@/lib/inquiries/strict-local-time";
import { eventLocalToUtc, tenantLocalDayBounds } from "@/lib/inquiries/tenant-datetime";
import { LOCAL_TIME_RESOLUTION_STATUSES } from "@/types/operating-hours";
import type { OccupancyWindow } from "@/server/resources/time-window";

export function nextCivilDate(slotDate: string): string {
  const [year, month, day] = slotDate.split("-").map(Number);
  return new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, (day ?? 1) + 1)).toISOString().slice(0, 10);
}

export function previousCivilDate(slotDate: string): string {
  const [year, month, day] = slotDate.split("-").map(Number);
  return new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, (day ?? 1) - 1)).toISOString().slice(0, 10);
}

/** Split a possibly overnight civil window into same-day segments (end capped at 1440). */
export function expandCivilOccupancyWindows(window: OccupancyWindow): OccupancyWindow[] {
  if (window.endMinute <= 1440) {
    return [window];
  }
  const segments: OccupancyWindow[] = [
    {
      slotDate: window.slotDate,
      startMinute: window.startMinute,
      endMinute: 1440,
    },
  ];
  let remaining = window.endMinute - 1440;
  let date = nextCivilDate(window.slotDate);
  while (remaining > 0) {
    const end = Math.min(remaining, 1440);
    segments.push({ slotDate: date, startMinute: 0, endMinute: end });
    remaining -= end;
    date = nextCivilDate(date);
  }
  return segments;
}

export function resolveOccupancyInstantsForConflict(input: {
  slotDate: string;
  startMinute: number;
  endMinute: number;
  timeZone: string;
}): { startsAt: Date; endsAt: Date } {
  const strict = resolveStrictOccupancyInstants(input);
  if (strict.status === LOCAL_TIME_RESOLUTION_STATUSES.VALID) {
    return { startsAt: strict.startsAt, endsAt: strict.endsAt };
  }
  // Advisory conflict probing may use permissive conversion when local time is invalid;
  // write paths still reject invalid local times via scheduling guards.
  return {
    startsAt: eventLocalToUtc({
      date: input.slotDate,
      minuteOfDay: input.startMinute,
      timeZone: input.timeZone,
    }),
    endsAt: eventLocalToUtc({
      date: input.slotDate,
      minuteOfDay: input.endMinute,
      timeZone: input.timeZone,
    }),
  };
}

/** True when two absolute intervals overlap [start, end). */
export function absoluteIntervalsOverlap(
  left: { startsAt: Date; endsAt: Date },
  right: { startsAt: Date; endsAt: Date },
): boolean {
  return left.startsAt.getTime() < right.endsAt.getTime() && right.startsAt.getTime() < left.endsAt.getTime();
}

export function civilDayInstantBounds(slotDate: string, timeZone: string): { start: Date; nextStart: Date } {
  return tenantLocalDayBounds(slotDate, timeZone);
}
