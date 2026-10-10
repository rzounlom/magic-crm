/**
 * Strict venue-local time resolution for new scheduling writes.
 *
 * Duration semantics: purchased experience length is wall-clock minutes
 * (`endMinute - startMinute`). When a DST transition makes absolute UTC elapsed
 * time differ from that wall duration, the interval is rejected rather than
 * silently shortened or lengthened.
 *
 * Historical records must not be reinterpreted through this resolver.
 * Permissive `eventLocalToUtc` remains for legacy display/compat only.
 */
import {
  eventLocalToUtc,
  isValidIanaTimeZone,
} from "@/lib/inquiries/tenant-datetime";
import {
  LOCAL_TIME_RESOLUTION_STATUSES,
  type LocalTimeResolutionStatus,
} from "@/types/operating-hours";

const CIVIL_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export type StrictLocalInstantSuccess = {
  status: typeof LOCAL_TIME_RESOLUTION_STATUSES.VALID;
  utcInstant: Date;
  timeZone: string;
  date: string;
  minuteOfDay: number;
};

export type StrictLocalInstantFailure = {
  status: Exclude<LocalTimeResolutionStatus, typeof LOCAL_TIME_RESOLUTION_STATUSES.VALID>;
  timeZone: string | null;
  date: string | null;
  minuteOfDay: number | null;
  reason: string;
  candidates?: Date[];
};

export type StrictLocalInstantResult = StrictLocalInstantSuccess | StrictLocalInstantFailure;

export type StrictOccupancySuccess = {
  status: typeof LOCAL_TIME_RESOLUTION_STATUSES.VALID;
  startsAt: Date;
  endsAt: Date;
  timeZone: string;
  slotDate: string;
  startMinute: number;
  endMinute: number;
  wallDurationMinutes: number;
  utcDurationMinutes: number;
};

export type StrictOccupancyFailure = {
  status: Exclude<LocalTimeResolutionStatus, typeof LOCAL_TIME_RESOLUTION_STATUSES.VALID>;
  timeZone: string | null;
  slotDate: string | null;
  startMinute: number | null;
  endMinute: number | null;
  reason: string;
  candidates?: Date[];
};

export type StrictOccupancyResult = StrictOccupancySuccess | StrictOccupancyFailure;

function isValidCivilDate(date: string): boolean {
  const match = CIVIL_DATE_PATTERN.exec(date.trim());
  if (!match) {
    return false;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utc = new Date(Date.UTC(year, month - 1, day));
  return (
    utc.getUTCFullYear() === year &&
    utc.getUTCMonth() === month - 1 &&
    utc.getUTCDate() === day
  );
}

function wallParts(
  instant: Date,
  timeZone: string,
): { year: number; month: number; day: number; hour: number; minute: number } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(instant)
      .map((part) => [part.type, part.value]),
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  };
}

function requestedWall(
  date: string,
  minuteOfDay: number,
): { year: number; month: number; day: number; hour: number; minute: number } | null {
  const extraDays = Math.floor(minuteOfDay / 1440);
  const minutes = minuteOfDay - extraDays * 1440;
  if (minutes < 0 || minutes >= 1440) {
    return null;
  }
  const [year, month, day] = date.split("-").map(Number);
  const base = Date.UTC(year ?? 1970, (month ?? 1) - 1, (day ?? 1) + extraDays);
  const shifted = new Date(base);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: Math.floor(minutes / 60),
    minute: minutes % 60,
  };
}

function wallsMatch(
  left: { year: number; month: number; day: number; hour: number; minute: number },
  right: { year: number; month: number; day: number; hour: number; minute: number },
): boolean {
  return (
    left.year === right.year &&
    left.month === right.month &&
    left.day === right.day &&
    left.hour === right.hour &&
    left.minute === right.minute
  );
}

/**
 * Resolve a single venue-local wall clock to a UTC instant without silent DST fold.
 */
export function resolveStrictEventLocalToUtc(input: {
  date: string;
  minuteOfDay: number;
  timeZone: string;
}): StrictLocalInstantResult {
  const zone = input.timeZone?.trim() ?? "";
  if (!zone || !isValidIanaTimeZone(zone)) {
    return {
      status: LOCAL_TIME_RESOLUTION_STATUSES.INVALID_TIMEZONE,
      timeZone: zone || null,
      date: input.date ?? null,
      minuteOfDay: input.minuteOfDay,
      reason: "Time zone must be a valid IANA identifier.",
    };
  }
  if (!input.date || !isValidCivilDate(input.date)) {
    return {
      status: LOCAL_TIME_RESOLUTION_STATUSES.INVALID_DATE,
      timeZone: zone,
      date: input.date ?? null,
      minuteOfDay: input.minuteOfDay,
      reason: "Event date must be a valid civil YYYY-MM-DD date.",
    };
  }
  if (!Number.isInteger(input.minuteOfDay) || input.minuteOfDay < 0) {
    return {
      status: LOCAL_TIME_RESOLUTION_STATUSES.INVALID_TIME,
      timeZone: zone,
      date: input.date,
      minuteOfDay: input.minuteOfDay,
      reason: "Wall-clock minute-of-day must be a non-negative integer.",
    };
  }
  const wanted = requestedWall(input.date, input.minuteOfDay);
  if (!wanted) {
    return {
      status: LOCAL_TIME_RESOLUTION_STATUSES.INVALID_TIME,
      timeZone: zone,
      date: input.date,
      minuteOfDay: input.minuteOfDay,
      reason: "Wall-clock time is outside 00:00–23:59 for its local day component.",
    };
  }

  // Permissive conversion yields a candidate; strict checks reject gap/ambiguity.
  const candidate = eventLocalToUtc({
    date: input.date,
    minuteOfDay: input.minuteOfDay,
    timeZone: zone,
  });
  const rendered = wallParts(candidate, zone);
  if (!wallsMatch(rendered, wanted)) {
    return {
      status: LOCAL_TIME_RESOLUTION_STATUSES.NONEXISTENT_LOCAL_TIME,
      timeZone: zone,
      date: input.date,
      minuteOfDay: input.minuteOfDay,
      reason: "That local time does not exist in the venue time zone (DST gap).",
    };
  }

  const candidates = [candidate];
  for (const deltaHours of [-2, -1, 1, 2]) {
    const probe = new Date(candidate.getTime() + deltaHours * 60 * 60 * 1000);
    if (wallsMatch(wallParts(probe, zone), wanted)) {
      if (!candidates.some((row) => row.getTime() === probe.getTime())) {
        candidates.push(probe);
      }
    }
  }
  if (candidates.length > 1) {
    candidates.sort((a, b) => a.getTime() - b.getTime());
    return {
      status: LOCAL_TIME_RESOLUTION_STATUSES.AMBIGUOUS_LOCAL_TIME,
      timeZone: zone,
      date: input.date,
      minuteOfDay: input.minuteOfDay,
      reason: "That local time is ambiguous (DST fall-back). Choose an explicit occurrence.",
      candidates,
    };
  }

  return {
    status: LOCAL_TIME_RESOLUTION_STATUSES.VALID,
    utcInstant: candidate,
    timeZone: zone,
    date: input.date,
    minuteOfDay: input.minuteOfDay,
  };
}

/**
 * Resolve a wall-clock occupancy interval. Rejects DST-crossing intervals where
 * UTC elapsed minutes ≠ wall-clock duration.
 */
export function resolveStrictOccupancyInstants(input: {
  slotDate: string;
  startMinute: number;
  endMinute: number;
  timeZone: string;
}): StrictOccupancyResult {
  if (!Number.isInteger(input.endMinute) || input.endMinute <= input.startMinute) {
    return {
      status: LOCAL_TIME_RESOLUTION_STATUSES.INVALID_TIME,
      timeZone: input.timeZone ?? null,
      slotDate: input.slotDate ?? null,
      startMinute: input.startMinute,
      endMinute: input.endMinute,
      reason: "Event end must be after start using positive wall-clock duration.",
    };
  }

  const start = resolveStrictEventLocalToUtc({
    date: input.slotDate,
    minuteOfDay: input.startMinute,
    timeZone: input.timeZone,
  });
  if (start.status !== LOCAL_TIME_RESOLUTION_STATUSES.VALID) {
    return {
      status: start.status,
      timeZone: start.timeZone,
      slotDate: input.slotDate,
      startMinute: input.startMinute,
      endMinute: input.endMinute,
      reason: start.reason,
      candidates: start.candidates,
    };
  }

  const end = resolveStrictEventLocalToUtc({
    date: input.slotDate,
    minuteOfDay: input.endMinute,
    timeZone: input.timeZone,
  });
  if (end.status !== LOCAL_TIME_RESOLUTION_STATUSES.VALID) {
    return {
      status: end.status,
      timeZone: end.timeZone,
      slotDate: input.slotDate,
      startMinute: input.startMinute,
      endMinute: input.endMinute,
      reason: end.reason,
      candidates: end.candidates,
    };
  }

  const wallDurationMinutes = input.endMinute - input.startMinute;
  const utcDurationMinutes = Math.round(
    (end.utcInstant.getTime() - start.utcInstant.getTime()) / 60_000,
  );
  if (utcDurationMinutes <= 0) {
    return {
      status: LOCAL_TIME_RESOLUTION_STATUSES.DST_INTERVAL_UNSAFE,
      timeZone: input.timeZone,
      slotDate: input.slotDate,
      startMinute: input.startMinute,
      endMinute: input.endMinute,
      reason: "Event interval does not advance in absolute UTC time.",
    };
  }
  if (utcDurationMinutes !== wallDurationMinutes) {
    return {
      status: LOCAL_TIME_RESOLUTION_STATUSES.DST_INTERVAL_UNSAFE,
      timeZone: input.timeZone,
      slotDate: input.slotDate,
      startMinute: input.startMinute,
      endMinute: input.endMinute,
      reason:
        "Event crosses a DST transition where wall-clock duration differs from elapsed time. Choose a window that does not cross the transition.",
    };
  }

  return {
    status: LOCAL_TIME_RESOLUTION_STATUSES.VALID,
    startsAt: start.utcInstant,
    endsAt: end.utcInstant,
    timeZone: input.timeZone,
    slotDate: input.slotDate,
    startMinute: input.startMinute,
    endMinute: input.endMinute,
    wallDurationMinutes,
    utcDurationMinutes,
  };
}
