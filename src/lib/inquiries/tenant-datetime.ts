const EVENT_TIME_PATTERN = /^(\d{1,2}):(\d{2})(?::\d{2})?$/;
const ITINERARY_RANGE_PATTERN =
  /^(\d{1,2}:\d{2}(?::\d{2})?)\s*[–-]\s*(\d{1,2}:\d{2}(?::\d{2})?)\s*(.*)$/;
const MISSING_EVENT_LOCAL_LABEL = "Not specified";
/** Explicit fallback when stored timezone is missing or not a valid IANA identifier. */
export const FALLBACK_TIME_ZONE = "UTC";
const warnedInvalidTimeZones = new Set<string>();

export function formatEventLocalDate(value: Date | string | null | undefined): string | null {
  const parts = readEventCalendarDate(value);
  if (!parts) {
    return null;
  }
  const utcMidnight = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(utcMidnight);
}

export function formatEventLocalTime(value: string | null | undefined): string | null {
  const parsed = parseEventLocalTime(value);
  if (!parsed) {
    return value?.trim() ? value.trim() : null;
  }
  const utc = new Date(Date.UTC(1970, 0, 1, parsed.hour, parsed.minute));
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "UTC",
  }).format(utc);
}

const RAW_CLOCK_IN_PROSE = /\b(?:[01]?\d|2[0-3]):[0-5]\d\b/g;

/**
 * Format raw event-local clocks (`16:00`) once.
 * A clock already followed by AM/PM is left alone so `4:00 PM` is not parsed as 04:00 and rewritten to `4:00 AM PM`.
 */
export function formatCustomerFacingClocks(text: string | null | undefined): string {
  if (!text) {
    return "";
  }
  return text.replace(RAW_CLOCK_IN_PROSE, (match, offset: number) => {
    const rest = text.slice(offset + match.length);
    if (/^\s*[AP]M\b/i.test(rest)) {
      return match;
    }
    return formatEventLocalTime(match) ?? match;
  });
}

/** Format two raw event-local clocks once: `16:00` + `18:00` → `4:00 PM–6:00 PM`. */
export function formatEventLocalRange(
  start: string | null | undefined,
  end: string | null | undefined,
): string | null {
  const startLabel = formatEventLocalTime(start);
  const endLabel = formatEventLocalTime(end);
  if (startLabel && endLabel) {
    return `${startLabel}–${endLabel}`;
  }
  return startLabel || endLabel;
}

export function formatAdjustedEventWindow(
  startTime: string | null | undefined,
  durationMinutes: number | null | undefined,
): string | null {
  const parsed = parseEventLocalTime(startTime);
  if (!parsed || !durationMinutes || durationMinutes <= 0) {
    return formatEventLocalTime(startTime);
  }
  const total = parsed.hour * 60 + parsed.minute + durationMinutes;
  const endHour = Math.floor(total / 60) % 24;
  const endMinute = total % 60;
  return formatEventLocalRange(
    startTime,
    `${String(endHour).padStart(2, "0")}:${String(endMinute).padStart(2, "0")}`,
  );
}

export function formatEventLocalDateTime(input: {
  date?: Date | string | null;
  time?: string | null;
}): string {
  const date = formatEventLocalDate(input.date);
  const time = formatEventLocalTime(input.time);
  if (date && time) {
    return `${date} at ${time}`;
  }
  if (date) {
    return date;
  }
  if (time) {
    return time;
  }
  return MISSING_EVENT_LOCAL_LABEL;
}

export function isValidIanaTimeZone(timeZone: string | null | undefined): boolean {
  const zone = timeZone?.trim();
  if (!zone) {
    return false;
  }
  return isSupportedTimeZone(zone);
}

function warnInvalidTimeZone(timeZone: string) {
  if (warnedInvalidTimeZones.has(timeZone)) {
    return;
  }
  warnedInvalidTimeZones.add(timeZone);
  console.warn(
    JSON.stringify({
      scope: "magiccrm.config",
      event: "invalid_timezone",
      timeZone,
      fallback: FALLBACK_TIME_ZONE,
    }),
  );
}

export function resolveOrganizationTimeZone(timeZone: string | null | undefined): string {
  const zone = timeZone?.trim();
  if (!zone) {
    return FALLBACK_TIME_ZONE;
  }
  if (isSupportedTimeZone(zone)) {
    return zone;
  }
  warnInvalidTimeZone(zone);
  return FALLBACK_TIME_ZONE;
}

/**
 * Location override if it is a valid IANA zone, else organization timezone,
 * else UTC. The literal string "IANA" is invalid configuration.
 */
export function resolveTenantTimezone(input: {
  organizationTimezone?: string | null;
  locationTimezone?: string | null;
}): string {
  const location = input.locationTimezone?.trim();
  if (location) {
    if (isSupportedTimeZone(location)) {
      return location;
    }
    warnInvalidTimeZone(location);
  }
  return resolveOrganizationTimeZone(input.organizationTimezone);
}

export function resolveSchedulingTimeZone(input: {
  locationTimeZone?: string | null;
  organizationTimeZone?: string | null;
}): string {
  return resolveTenantTimezone({
    organizationTimezone: input.organizationTimeZone,
    locationTimezone: input.locationTimeZone,
  });
}

/** Tenant/location calendar date for `now` (YYYY-MM-DD). Not the UTC date. */
export function calendarDateInTimeZone(now: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: resolveOrganizationTimeZone(timeZone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/**
 * Convert event-local wall-clock minutes on a calendar date into a UTC instant
 * using the location or organization IANA timezone.
 */
export function eventLocalToUtc(input: {
  date: string;
  minuteOfDay: number;
  timeZone: string;
}): Date {
  const zone = resolveOrganizationTimeZone(input.timeZone);
  const extraDays = Math.floor(input.minuteOfDay / 1440);
  const minutes = input.minuteOfDay - extraDays * 1440;
  const [year, month, day] = input.date.split("-").map(Number);
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const utcGuess = Date.UTC((year ?? 1970), (month ?? 1) - 1, (day ?? 1) + extraDays, hour, minute, 0);
  const guess = new Date(utcGuess);
  const offset = timezoneOffsetMs(guess, zone);
  const first = new Date(utcGuess - offset);
  const offset2 = timezoneOffsetMs(first, zone);
  if (offset2 !== offset) {
    return new Date(utcGuess - offset2);
  }
  return first;
}

export function occupancyInstants(input: {
  slotDate: string;
  startMinute: number;
  endMinute: number;
  timeZone: string;
}): { startsAt: Date; endsAt: Date } {
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

function timezoneOffsetMs(date: Date, timeZone: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return asUtc - date.getTime();
}

export function formatOrganizationTimestamp(
  value: Date,
  timeZone: string,
): string {
  return `${formatTenantDate(value, timeZone)} at ${formatTenantTime(value, timeZone)}`;
}

/** Real timestamp → tenant-local calendar date. */
export function formatTenantDate(value: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: resolveOrganizationTimeZone(timeZone),
  }).format(value);
}

/** Real timestamp → tenant-local 12-hour time. */
export function formatTenantTime(value: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: resolveOrganizationTimeZone(timeZone),
  }).format(value);
}

export const formatTenantTimestamp = formatOrganizationTimestamp;
export const formatItineraryTime = formatEventLocalTime;

export function formatItineraryRange(start: string | null | undefined, end: string | null | undefined): string {
  return formatEventLocalRange(start, end) ?? "";
}

/** Display a stored itinerary line such as `17:30–18:30 Fajita Bar` in 12-hour time. */
export function formatItineraryLine(line: string): string {
  const match = ITINERARY_RANGE_PATTERN.exec(line.trim());
  if (!match) {
    return line;
  }
  const range = formatItineraryRange(match[1], match[2]);
  const label = match[3]?.trim() ?? "";
  return label ? `${range} ${label}` : range;
}

/**
 * Occupancy DATE key for an event-local calendar day (YYYY-MM-DD).
 * Stored as that civil date at UTC midnight — not "UTC's September 17."
 */
export function eventLocalSlotDate(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

/** UTC instants for the start of a tenant-local calendar day and the next day. */
export function tenantLocalDayBounds(date: string, timeZone: string): { start: Date; nextStart: Date } {
  const [year, month, day] = date.split("-").map(Number);
  const next = new Date(Date.UTC(year ?? 2026, (month ?? 1) - 1, (day ?? 1) + 1)).toISOString().slice(0, 10);
  return {
    start: eventLocalToUtc({ date, minuteOfDay: 0, timeZone }),
    nextStart: eventLocalToUtc({ date: next, minuteOfDay: 0, timeZone }),
  };
}

function readEventCalendarDate(value: Date | string | null | undefined): {
  year: number;
  month: number;
  day: number;
} | null {
  if (value == null) {
    return null;
  }
  if (typeof value === "string") {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
    if (!match) {
      return null;
    }
    return {
      year: Number(match[1]),
      month: Number(match[2]),
      day: Number(match[3]),
    };
  }
  if (Number.isNaN(value.getTime())) {
    return null;
  }
  return {
    year: value.getUTCFullYear(),
    month: value.getUTCMonth() + 1,
    day: value.getUTCDate(),
  };
}

function parseEventLocalTime(value: string | null | undefined): { hour: number; minute: number } | null {
  const match = EVENT_TIME_PATTERN.exec(value?.trim() ?? "");
  if (!match) {
    return null;
  }
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) {
    return null;
  }
  return { hour, minute };
}

function isSupportedTimeZone(timeZone: string): boolean {
  try {
    Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}
