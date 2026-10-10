import { describe, expect, it } from "vitest";

import { assertHoursExceptionMatches } from "@/server/resources/hours-exception";
import {
  OPERATING_HOURS_EVALUATION_STATUSES,
  OPERATING_HOURS_EXCEPTION_PURPOSES,
} from "@/types/operating-hours";
import { expandCivilOccupancyWindows } from "@/server/resources/occupancy-windows";
import { absoluteIntervalsOverlap, resolveOccupancyInstantsForConflict } from "@/server/resources/occupancy-windows";

describe("operating-hours staff exception matching", () => {
  const fingerprint = {
    organizationId: "org-1",
    locationId: "loc-1",
    slotDate: "2026-10-22",
    startMinute: 14 * 60,
    endMinute: 16 * 60,
    purpose: OPERATING_HOURS_EXCEPTION_PURPOSES.CONFIRM_BOOKING,
    inquiryId: "inq-1",
  };

  const baseException = {
    id: "ex-1",
    organizationId: "org-1",
    locationId: "loc-1",
    purpose: OPERATING_HOURS_EXCEPTION_PURPOSES.CONFIRM_BOOKING,
    slotDate: new Date("2026-10-22T00:00:00.000Z"),
    startMinute: 14 * 60,
    endMinute: 16 * 60,
    overriddenStatus: OPERATING_HOURS_EVALUATION_STATUSES.HOURS_UNCONFIGURED,
    inquiryId: "inq-1",
    bookingId: null,
    expiresAt: new Date("2026-12-01T00:00:00.000Z"),
    revokedAt: null,
    consumedAt: null,
  };

  it("accepts a matching unconsumed exception", () => {
    const result = assertHoursExceptionMatches(
      baseException,
      fingerprint,
      OPERATING_HOURS_EVALUATION_STATUSES.HOURS_UNCONFIGURED,
      new Date("2026-10-10T00:00:00.000Z"),
    );
    expect(result.ok).toBe(true);
  });

  it("rejects revoked, consumed, expired, or mismatched fingerprints", () => {
    expect(
      assertHoursExceptionMatches(
        { ...baseException, revokedAt: new Date() },
        fingerprint,
        OPERATING_HOURS_EVALUATION_STATUSES.HOURS_UNCONFIGURED,
      ).ok,
    ).toBe(false);
    expect(
      assertHoursExceptionMatches(
        { ...baseException, consumedAt: new Date() },
        fingerprint,
        OPERATING_HOURS_EVALUATION_STATUSES.HOURS_UNCONFIGURED,
      ).ok,
    ).toBe(false);
    expect(
      assertHoursExceptionMatches(
        { ...baseException, expiresAt: new Date("2020-01-01T00:00:00.000Z") },
        fingerprint,
        OPERATING_HOURS_EVALUATION_STATUSES.HOURS_UNCONFIGURED,
      ).ok,
    ).toBe(false);
    expect(
      assertHoursExceptionMatches(
        baseException,
        { ...fingerprint, startMinute: 15 * 60 },
        OPERATING_HOURS_EVALUATION_STATUSES.HOURS_UNCONFIGURED,
      ).ok,
    ).toBe(false);
    expect(
      assertHoursExceptionMatches(
        baseException,
        fingerprint,
        OPERATING_HOURS_EVALUATION_STATUSES.OUTSIDE_HOURS,
      ).ok,
    ).toBe(false);
  });

  it("never treats invalid local time as overridable", () => {
    const result = assertHoursExceptionMatches(
      {
        ...baseException,
        overriddenStatus: OPERATING_HOURS_EVALUATION_STATUSES.INVALID_LOCAL_TIME,
      },
      fingerprint,
      OPERATING_HOURS_EVALUATION_STATUSES.INVALID_LOCAL_TIME,
    );
    expect(result.ok).toBe(false);
  });

  it("rejects CONFIRM_BOOKING vs PLACE_HOLD purpose mismatch and cross-org/location", () => {
    expect(
      assertHoursExceptionMatches(
        {
          ...baseException,
          purpose: OPERATING_HOURS_EXCEPTION_PURPOSES.PLACE_HOLD,
        },
        fingerprint,
        OPERATING_HOURS_EVALUATION_STATUSES.HOURS_UNCONFIGURED,
      ).ok,
    ).toBe(false);
    expect(
      assertHoursExceptionMatches(
        { ...baseException, organizationId: "org-2" },
        fingerprint,
        OPERATING_HOURS_EVALUATION_STATUSES.HOURS_UNCONFIGURED,
      ).ok,
    ).toBe(false);
    expect(
      assertHoursExceptionMatches(
        { ...baseException, locationId: "loc-2" },
        fingerprint,
        OPERATING_HOURS_EVALUATION_STATUSES.HOURS_UNCONFIGURED,
      ).ok,
    ).toBe(false);
  });
});

describe("overnight occupancy windows", () => {
  it("expands midnight-crossing civil windows into day segments", () => {
    const segments = expandCivilOccupancyWindows({
      slotDate: "2026-10-25",
      startMinute: 23 * 60,
      endMinute: 25 * 60,
    });
    expect(segments).toEqual([
      { slotDate: "2026-10-25", startMinute: 1380, endMinute: 1440 },
      { slotDate: "2026-10-26", startMinute: 0, endMinute: 60 },
    ]);
  });

  it("detects absolute overlap across calendar dates for the same resource window", () => {
    const overnight = resolveOccupancyInstantsForConflict({
      slotDate: "2026-10-25",
      startMinute: 23 * 60,
      endMinute: 25 * 60,
      timeZone: "America/Indiana/Indianapolis",
    });
    const sundayMorning = resolveOccupancyInstantsForConflict({
      slotDate: "2026-10-26",
      startMinute: 30,
      endMinute: 90,
      timeZone: "America/Indiana/Indianapolis",
    });
    const backToBack = resolveOccupancyInstantsForConflict({
      slotDate: "2026-10-26",
      startMinute: 60,
      endMinute: 120,
      timeZone: "America/Indiana/Indianapolis",
    });
    expect(absoluteIntervalsOverlap(overnight, sundayMorning)).toBe(true);
    expect(absoluteIntervalsOverlap(overnight, backToBack)).toBe(false);
  });
});
