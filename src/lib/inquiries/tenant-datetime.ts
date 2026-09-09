const EVENT_TIME_PATTERN = /^(\d{1,2}):(\d{2})(?::\d{2})?$/;
const MISSING_EVENT_LOCAL_LABEL = "Not specified";

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

export function resolveOrganizationTimeZone(timeZone: string | null | undefined): string {
  const zone = timeZone?.trim() || "UTC";
  return isSupportedTimeZone(zone) ? zone : "UTC";
}

export function formatOrganizationTimestamp(
  value: Date,
  timeZone: string,
): string {
  const zone = resolveOrganizationTimeZone(timeZone);
  const datePart = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: zone,
  }).format(value);
  const timePart = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: zone,
  }).format(value);
  return `${datePart} at ${timePart}`;
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
