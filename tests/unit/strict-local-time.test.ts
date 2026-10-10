import { describe, expect, it } from "vitest";

import {
  resolveStrictEventLocalToUtc,
  resolveStrictOccupancyInstants,
} from "@/lib/inquiries/strict-local-time";
import { LOCAL_TIME_RESOLUTION_STATUSES } from "@/types/operating-hours";

describe("strict local-time resolver", () => {
  it("accepts a normal Indiana local-to-UTC conversion", () => {
    const result = resolveStrictEventLocalToUtc({
      date: "2026-10-15",
      minuteOfDay: 18 * 60,
      timeZone: "America/Indiana/Indianapolis",
    });
    expect(result.status).toBe(LOCAL_TIME_RESOLUTION_STATUSES.VALID);
    if (result.status === LOCAL_TIME_RESOLUTION_STATUSES.VALID) {
      expect(result.utcInstant.toISOString()).toBe("2026-10-15T22:00:00.000Z");
    }
  });

  it("rejects spring-forward nonexistent local times", () => {
    const result = resolveStrictEventLocalToUtc({
      date: "2026-03-08",
      minuteOfDay: 2 * 60 + 30,
      timeZone: "America/Indiana/Indianapolis",
    });
    expect(result.status).toBe(LOCAL_TIME_RESOLUTION_STATUSES.NONEXISTENT_LOCAL_TIME);
  });

  it("rejects fall-back ambiguous local times instead of choosing an occurrence", () => {
    const result = resolveStrictEventLocalToUtc({
      date: "2026-11-01",
      minuteOfDay: 90,
      timeZone: "America/Indiana/Indianapolis",
    });
    expect(result.status).toBe(LOCAL_TIME_RESOLUTION_STATUSES.AMBIGUOUS_LOCAL_TIME);
    if (result.status === LOCAL_TIME_RESOLUTION_STATUSES.AMBIGUOUS_LOCAL_TIME) {
      expect(result.candidates?.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("rejects invalid IANA time zones without falling back to UTC", () => {
    const result = resolveStrictEventLocalToUtc({
      date: "2026-10-15",
      minuteOfDay: 18 * 60,
      timeZone: "Not/AZone",
    });
    expect(result.status).toBe(LOCAL_TIME_RESOLUTION_STATUSES.INVALID_TIMEZONE);
  });

  it("rejects invalid civil dates and wall clocks", () => {
    expect(
      resolveStrictEventLocalToUtc({
        date: "2026-02-30",
        minuteOfDay: 12 * 60,
        timeZone: "UTC",
      }).status,
    ).toBe(LOCAL_TIME_RESOLUTION_STATUSES.INVALID_DATE);
    expect(
      resolveStrictEventLocalToUtc({
        date: "2026-10-15",
        minuteOfDay: -1,
        timeZone: "UTC",
      }).status,
    ).toBe(LOCAL_TIME_RESOLUTION_STATUSES.INVALID_TIME);
  });

  it("accepts midnight-crossing intervals that do not cross DST", () => {
    const result = resolveStrictOccupancyInstants({
      slotDate: "2026-10-18",
      startMinute: 23 * 60,
      endMinute: 25 * 60,
      timeZone: "America/Indiana/Indianapolis",
    });
    expect(result.status).toBe(LOCAL_TIME_RESOLUTION_STATUSES.VALID);
    if (result.status === LOCAL_TIME_RESOLUTION_STATUSES.VALID) {
      expect(result.wallDurationMinutes).toBe(120);
      expect(result.utcDurationMinutes).toBe(120);
      expect(result.startsAt.toISOString()).toBe("2026-10-19T03:00:00.000Z");
      expect(result.endsAt.toISOString()).toBe("2026-10-19T05:00:00.000Z");
    }
  });

  it("rejects DST-crossing intervals where wall duration differs from elapsed UTC", () => {
    const result = resolveStrictOccupancyInstants({
      slotDate: "2026-03-08",
      startMinute: 90,
      endMinute: 210,
      timeZone: "America/Indiana/Indianapolis",
    });
    expect(result.status).toBe(LOCAL_TIME_RESOLUTION_STATUSES.DST_INTERVAL_UNSAFE);
  });

  it("accepts intervals entirely before or after a DST transition", () => {
    const before = resolveStrictOccupancyInstants({
      slotDate: "2026-03-08",
      startMinute: 0,
      endMinute: 60,
      timeZone: "America/Indiana/Indianapolis",
    });
    const after = resolveStrictOccupancyInstants({
      slotDate: "2026-03-08",
      startMinute: 3 * 60,
      endMinute: 5 * 60,
      timeZone: "America/Indiana/Indianapolis",
    });
    expect(before.status).toBe(LOCAL_TIME_RESOLUTION_STATUSES.VALID);
    expect(after.status).toBe(LOCAL_TIME_RESOLUTION_STATUSES.VALID);
  });

  it("supports a legitimate UTC tenant without rejecting UTC", () => {
    const result = resolveStrictOccupancyInstants({
      slotDate: "2026-10-15",
      startMinute: 18 * 60,
      endMinute: 20 * 60,
      timeZone: "UTC",
    });
    expect(result.status).toBe(LOCAL_TIME_RESOLUTION_STATUSES.VALID);
    if (result.status === LOCAL_TIME_RESOLUTION_STATUSES.VALID) {
      expect(result.startsAt.toISOString()).toBe("2026-10-15T18:00:00.000Z");
    }
  });
});
