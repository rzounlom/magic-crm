import {
  OPERATING_HOURS_EXCEPTION_KINDS,
  type OperatingHoursExceptionKind,
} from "@/types/operating-hours";

export const DAY_OF_WEEK_LABELS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

/** Overnight spill supports endMinute past midnight; cap at 48h of local minutes. */
export const MAX_END_MINUTE = 48 * 60;

export type WeeklyWindowInput = {
  dayOfWeek: number;
  startMinute: number;
  endMinute: number;
};

export type DateExceptionInput = {
  localDate: string;
  kind: OperatingHoursExceptionKind;
  startMinute?: number | null;
  endMinute?: number | null;
  note?: string | null;
};

export function minutesFromHhMm(value: string): number | null {
  const trimmed = value.trim();
  const match = /^(\d{1,2}):(\d{2})$/.exec(trimmed);
  if (!match) {
    return null;
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) {
    return null;
  }
  if (hours < 0 || minutes < 0 || minutes > 59) {
    return null;
  }
  return hours * 60 + minutes;
}

export function hhMmFromMinutes(total: number): string {
  const safe = Math.max(0, Math.trunc(total));
  const hours = Math.floor(safe / 60);
  const minutes = safe % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function validateWeeklyWindows(windows: WeeklyWindowInput[]): string | null {
  for (const row of windows) {
    if (!Number.isInteger(row.dayOfWeek) || row.dayOfWeek < 0 || row.dayOfWeek > 6) {
      return "Each weekly window must use a weekday from Sunday (0) through Saturday (6).";
    }
    if (!Number.isInteger(row.startMinute) || !Number.isInteger(row.endMinute)) {
      return "Opening and closing times must be whole minutes.";
    }
    if (row.startMinute < 0 || row.startMinute >= 24 * 60) {
      return "Opening time must be between 00:00 and 23:59.";
    }
    if (row.endMinute <= row.startMinute) {
      return "Closing time must be after opening time (overnight closes may exceed 24:00).";
    }
    if (row.endMinute > MAX_END_MINUTE) {
      return "Closing time is too far past midnight for an overnight window.";
    }
  }

  const byDay = new Map<number, WeeklyWindowInput[]>();
  for (const row of windows) {
    const list = byDay.get(row.dayOfWeek) ?? [];
    list.push(row);
    byDay.set(row.dayOfWeek, list);
  }
  for (const [day, list] of byDay) {
    const sorted = [...list].sort((a, b) => a.startMinute - b.startMinute);
    for (let i = 1; i < sorted.length; i += 1) {
      const previous = sorted[i - 1]!;
      const current = sorted[i]!;
      if (current.startMinute < previous.endMinute) {
        return `${DAY_OF_WEEK_LABELS[day]} has overlapping open windows.`;
      }
    }
  }
  return null;
}

export function validateDateException(input: DateExceptionInput): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.localDate)) {
    return "Exception dates must use YYYY-MM-DD.";
  }
  if (
    input.kind !== OPERATING_HOURS_EXCEPTION_KINDS.CLOSED &&
    input.kind !== OPERATING_HOURS_EXCEPTION_KINDS.CUSTOM
  ) {
    return "Exception kind must be CLOSED or CUSTOM.";
  }
  if (input.kind === OPERATING_HOURS_EXCEPTION_KINDS.CLOSED) {
    if (input.startMinute != null || input.endMinute != null) {
      return "Closed dates do not use open intervals.";
    }
    return null;
  }
  if (
    input.startMinute == null ||
    input.endMinute == null ||
    !Number.isInteger(input.startMinute) ||
    !Number.isInteger(input.endMinute)
  ) {
    return "Custom open dates require opening and closing times.";
  }
  if (input.startMinute < 0 || input.startMinute >= 24 * 60) {
    return "Custom opening time must be between 00:00 and 23:59.";
  }
  if (input.endMinute <= input.startMinute) {
    return "Custom closing time must be after opening time.";
  }
  if (input.endMinute > MAX_END_MINUTE) {
    return "Custom closing time is too far past midnight.";
  }
  if (input.note && input.note.trim().length > 500) {
    return "Exception notes must be 500 characters or fewer.";
  }
  return null;
}
