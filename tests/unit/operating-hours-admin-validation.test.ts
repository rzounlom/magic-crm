import { describe, expect, it } from "vitest";

import {
  hhMmFromMinutes,
  minutesFromHhMm,
  validateDateException,
  validateWeeklyWindows,
} from "@/lib/operating-hours/admin-validation";
import { OPERATING_HOURS_EXCEPTION_KINDS } from "@/types/operating-hours";

describe("operating hours admin validation", () => {
  it("parses and formats local times including overnight closes", () => {
    expect(minutesFromHhMm("10:30")).toBe(630);
    expect(minutesFromHhMm("26:00")).toBe(1560);
    expect(hhMmFromMinutes(1560)).toBe("26:00");
    expect(minutesFromHhMm("99:99")).toBeNull();
  });

  it("rejects overlapping windows on the same day", () => {
    expect(
      validateWeeklyWindows([
        { dayOfWeek: 1, startMinute: 600, endMinute: 900 },
        { dayOfWeek: 1, startMinute: 800, endMinute: 1000 },
      ]),
    ).toMatch(/overlapping/i);
  });

  it("allows multiple non-overlapping windows and overnight ends", () => {
    expect(
      validateWeeklyWindows([
        { dayOfWeek: 5, startMinute: 600, endMinute: 900 },
        { dayOfWeek: 5, startMinute: 1080, endMinute: 1560 },
      ]),
    ).toBeNull();
  });

  it("validates closed and custom date exceptions", () => {
    expect(
      validateDateException({
        localDate: "2026-12-25",
        kind: OPERATING_HOURS_EXCEPTION_KINDS.CLOSED,
      }),
    ).toBeNull();
    expect(
      validateDateException({
        localDate: "2026-12-25",
        kind: OPERATING_HOURS_EXCEPTION_KINDS.CUSTOM,
        startMinute: 600,
        endMinute: 1200,
      }),
    ).toBeNull();
    expect(
      validateDateException({
        localDate: "2026-12-25",
        kind: OPERATING_HOURS_EXCEPTION_KINDS.CUSTOM,
      }),
    ).toMatch(/opening and closing/i);
  });
});
