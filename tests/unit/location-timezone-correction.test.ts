import { describe, expect, it } from "vitest";

import {
  assertDevDatabaseHost,
  assertNonProductionRuntime,
  defaultGenerationsLocationTimezoneTarget,
  evaluateLocationTimezoneCorrectionSafety,
  EXPECTED_CORRECTED_LOCATION_TIMEZONE,
  EXPECTED_CURRENT_LOCATION_TIMEZONE,
} from "@/server/ops/location-timezone-correction";

describe("location timezone correction safety", () => {
  const base = {
    futureConfirmedOrHoldCount: 0,
    activeHoldCount: 0,
    currentLocationTimezone: EXPECTED_CURRENT_LOCATION_TIMEZONE,
    expectedCurrentTimezone: EXPECTED_CURRENT_LOCATION_TIMEZONE,
    expectedCorrectedTimezone: EXPECTED_CORRECTED_LOCATION_TIMEZONE,
  };

  it("allows a UTC → Indianapolis correction when no future occupancy exists", () => {
    const result = evaluateLocationTimezoneCorrectionSafety(base);
    expect(result.ok).toBe(true);
    expect(result.alreadyCorrect).toBe(false);
  });

  it("is idempotent when the location is already corrected", () => {
    const result = evaluateLocationTimezoneCorrectionSafety({
      ...base,
      currentLocationTimezone: EXPECTED_CORRECTED_LOCATION_TIMEZONE,
    });
    expect(result.ok).toBe(true);
    expect(result.alreadyCorrect).toBe(true);
  });

  it("refuses when the current timezone is unexpected", () => {
    const result = evaluateLocationTimezoneCorrectionSafety({
      ...base,
      currentLocationTimezone: "America/Chicago",
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("America/Chicago");
  });

  it("refuses when active HOLDs exist", () => {
    const result = evaluateLocationTimezoneCorrectionSafety({
      ...base,
      activeHoldCount: 2,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("active HOLD");
  });

  it("refuses when future bookings or hold occupancy exist", () => {
    const result = evaluateLocationTimezoneCorrectionSafety({
      ...base,
      futureConfirmedOrHoldCount: 1,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("future booking");
  });

  it("refuses non-DEV hosts and production/test roles", () => {
    expect(() => assertDevDatabaseHost("ep-sparkling-bird.example")).toThrow(/unexpected database host/);
    expect(() => assertDevDatabaseHost("ep-bold-art-avjy5nt4-pooler.example")).not.toThrow();
    expect(() => assertNonProductionRuntime({ MAGICCRM_DATABASE_ROLE: "test" })).toThrow(/test/);
    expect(() => assertNonProductionRuntime({ NODE_ENV: "production" })).toThrow(/production/);
  });

  it("pins the Generations CRM Test identifiers", () => {
    const target = defaultGenerationsLocationTimezoneTarget();
    expect(target.organizationId).toBe("mdutc2nkvpafezukeem8942v");
    expect(target.locationId).toBe("rysftywo62ve9sao10dk71si");
    expect(target.expectedCurrentTimezone).toBe("UTC");
    expect(target.expectedCorrectedTimezone).toBe("America/Indiana/Indianapolis");
  });
});
