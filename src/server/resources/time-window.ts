const EVENT_TIME_PATTERN = /^(\d{1,2}):(\d{2})(?::\d{2})?$/;

export function parseClockToMinutes(value: string | null | undefined): number | null {
  const match = EVENT_TIME_PATTERN.exec(value?.trim() ?? "");
  if (!match) {
    return null;
  }
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) {
    return null;
  }
  return hour * 60 + minute;
}

export function localEventWindow(input: {
  date: string | null;
  startTime: string | null;
  durationMinutes: number;
}): { slotDate: string; startMinute: number; endMinute: number } | null {
  if (!input.date || input.durationMinutes <= 0) {
    return null;
  }
  const startMinute = parseClockToMinutes(input.startTime);
  if (startMinute == null) {
    return null;
  }
  return {
    slotDate: input.date,
    startMinute,
    endMinute: startMinute + input.durationMinutes,
  };
}

export function rangesOverlap(
  left: { startMinute: number; endMinute: number },
  right: { startMinute: number; endMinute: number },
): boolean {
  return left.startMinute < right.endMinute && right.startMinute < left.endMinute;
}

export function minutesToClock(total: number): string {
  const normalized = ((total % (24 * 60)) + 24 * 60) % (24 * 60);
  const hour = Math.floor(normalized / 60);
  const minute = normalized % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}
