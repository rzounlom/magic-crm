import { describe, expect, it } from "vitest";

import { resolveStrictOccupancyInstants } from "@/lib/inquiries/strict-local-time";
import {
  aggregateSchedulingAvailability,
  evaluateOperatingHours,
} from "@/server/resources/operating-hours";
import {
  LOCAL_TIME_RESOLUTION_STATUSES,
  OPERATING_HOURS_EVALUATION_STATUSES,
  OPERATING_HOURS_EXCEPTION_KINDS,
  OPERATING_HOURS_VERIFICATION_STATUSES,
  SCHEDULING_AVAILABILITY_STATUSES,
} from "@/types/operating-hours";

const verifiedPolicy = {
  verificationStatus: OPERATING_HOURS_VERIFICATION_STATUSES.VERIFIED,
  weeklyWindows: [
    // Thursday 12:00–22:00
    { dayOfWeek: 4, startMinute: 12 * 60, endMinute: 22 * 60 },
    // Friday overnight 20:00–26:00 (to Saturday 02:00)
    { dayOfWeek: 5, startMinute: 20 * 60, endMinute: 26 * 60 },
  ],
  exceptions: [
    {
      localDate: "2026-10-15",
      kind: OPERATING_HOURS_EXCEPTION_KINDS.CLOSED,
      startMinute: null,
      endMinute: null,
    },
    {
      localDate: "2026-10-16",
      kind: OPERATING_HOURS_EXCEPTION_KINDS.CUSTOM,
      startMinute: 10 * 60,
      endMinute: 12 * 60,
    },
  ],
};

describe("operating hours evaluation", () => {
  it("treats missing policy as HOURS_UNCONFIGURED, not open", () => {
    const result = evaluateOperatingHours({
      policy: null,
      slotDate: "2026-10-22",
      startMinute: 14 * 60,
      endMinute: 16 * 60,
    });
    expect(result.status).toBe(OPERATING_HOURS_EVALUATION_STATUSES.HOURS_UNCONFIGURED);
  });

  it("treats DRAFT policy as HOURS_UNVERIFIED", () => {
    const result = evaluateOperatingHours({
      policy: {
        ...verifiedPolicy,
        verificationStatus: OPERATING_HOURS_VERIFICATION_STATUSES.DRAFT,
      },
      slotDate: "2026-10-22",
      startMinute: 14 * 60,
      endMinute: 16 * 60,
    });
    expect(result.status).toBe(OPERATING_HOURS_EVALUATION_STATUSES.HOURS_UNVERIFIED);
  });

  it("evaluates weekly open intervals", () => {
    const within = evaluateOperatingHours({
      policy: {
        verificationStatus: OPERATING_HOURS_VERIFICATION_STATUSES.VERIFIED,
        weeklyWindows: verifiedPolicy.weeklyWindows,
        exceptions: [],
      },
      slotDate: "2026-10-22", // Thursday
      startMinute: 14 * 60,
      endMinute: 16 * 60,
    });
    expect(within.status).toBe(OPERATING_HOURS_EVALUATION_STATUSES.WITHIN_HOURS);

    const outside = evaluateOperatingHours({
      policy: {
        verificationStatus: OPERATING_HOURS_VERIFICATION_STATUSES.VERIFIED,
        weeklyWindows: verifiedPolicy.weeklyWindows,
        exceptions: [],
      },
      slotDate: "2026-10-22",
      startMinute: 8 * 60,
      endMinute: 10 * 60,
    });
    expect(outside.status).toBe(OPERATING_HOURS_EVALUATION_STATUSES.OUTSIDE_HOURS);
  });

  it("applies special closures and extended custom hours", () => {
    const closed = evaluateOperatingHours({
      policy: verifiedPolicy,
      slotDate: "2026-10-15",
      startMinute: 14 * 60,
      endMinute: 16 * 60,
    });
    expect(closed.status).toBe(OPERATING_HOURS_EVALUATION_STATUSES.OUTSIDE_HOURS);

    const extended = evaluateOperatingHours({
      policy: verifiedPolicy,
      slotDate: "2026-10-16",
      startMinute: 10 * 60,
      endMinute: 11 * 60,
    });
    expect(extended.status).toBe(OPERATING_HOURS_EVALUATION_STATUSES.WITHIN_HOURS);
  });

  it("supports overnight weekly windows via next-day spill", () => {
    const fridayLate = evaluateOperatingHours({
      policy: {
        verificationStatus: OPERATING_HOURS_VERIFICATION_STATUSES.VERIFIED,
        weeklyWindows: verifiedPolicy.weeklyWindows,
        exceptions: [],
      },
      slotDate: "2026-10-23", // Friday
      startMinute: 21 * 60,
      endMinute: 23 * 60,
    });
    expect(fridayLate.status).toBe(OPERATING_HOURS_EVALUATION_STATUSES.WITHIN_HOURS);

    const saturdayEarly = evaluateOperatingHours({
      policy: {
        verificationStatus: OPERATING_HOURS_VERIFICATION_STATUSES.VERIFIED,
        weeklyWindows: verifiedPolicy.weeklyWindows,
        exceptions: [],
      },
      slotDate: "2026-10-24", // Saturday
      startMinute: 30,
      endMinute: 90,
    });
    expect(saturdayEarly.status).toBe(OPERATING_HOURS_EVALUATION_STATUSES.WITHIN_HOURS);
  });

  it("does not collapse unresolved hours into available inventory", () => {
    const localTime = resolveStrictOccupancyInstants({
      slotDate: "2026-10-22",
      startMinute: 14 * 60,
      endMinute: 16 * 60,
      timeZone: "America/Indiana/Indianapolis",
    });
    expect(localTime.status).toBe(LOCAL_TIME_RESOLUTION_STATUSES.VALID);

    const unresolved = aggregateSchedulingAvailability({
      localTime,
      operatingHours: evaluateOperatingHours({
        policy: null,
        slotDate: "2026-10-22",
        startMinute: 14 * 60,
        endMinute: 16 * 60,
      }),
      resourceAvailable: true,
    });
    expect(unresolved.status).toBe(SCHEDULING_AVAILABILITY_STATUSES.UNRESOLVED);
    expect(unresolved.legacyCompatibilityAllow).toBe(true);

    const closed = aggregateSchedulingAvailability({
      localTime,
      operatingHours: evaluateOperatingHours({
        policy: verifiedPolicy,
        slotDate: "2026-10-15",
        startMinute: 14 * 60,
        endMinute: 16 * 60,
      }),
      resourceAvailable: true,
    });
    expect(closed.status).toBe(SCHEDULING_AVAILABILITY_STATUSES.UNAVAILABLE);

    const resourceBlocked = aggregateSchedulingAvailability({
      localTime,
      operatingHours: evaluateOperatingHours({
        policy: {
          verificationStatus: OPERATING_HOURS_VERIFICATION_STATUSES.VERIFIED,
          weeklyWindows: verifiedPolicy.weeklyWindows,
          exceptions: [],
        },
        slotDate: "2026-10-22",
        startMinute: 14 * 60,
        endMinute: 16 * 60,
      }),
      resourceAvailable: false,
    });
    expect(resourceBlocked.status).toBe(SCHEDULING_AVAILABILITY_STATUSES.UNAVAILABLE);
  });
});
