/**
 * Pure helpers for narrowly scoped location timezone configuration correction.
 * Does not rewrite reservation or booking timestamps.
 */

export const GENERATIONS_CRM_TEST_ORG_ID = "mdutc2nkvpafezukeem8942v";
export const GENERATIONS_CRM_TEST_LOCATION_ID = "rysftywo62ve9sao10dk71si";
export const GENERATIONS_CRM_TEST_SLUG = "generations-crm-test-1788129640704833684";
export const EXPECTED_CURRENT_LOCATION_TIMEZONE = "UTC";
export const EXPECTED_CORRECTED_LOCATION_TIMEZONE = "America/Indiana/Indianapolis";
export const DEV_HOST_FRAGMENT = "ep-bold-art-avjy5nt4";

export type LocationTimezoneCorrectionTarget = {
  organizationId: string;
  locationId: string;
  organizationSlug: string;
  expectedCurrentTimezone: string;
  expectedCorrectedTimezone: string;
};

export type LocationTimezoneSafetyInput = {
  futureConfirmedOrHoldCount: number;
  activeHoldCount: number;
  currentLocationTimezone: string;
  expectedCurrentTimezone: string;
  expectedCorrectedTimezone: string;
};

export type LocationTimezoneSafetyResult =
  | { ok: true; alreadyCorrect: boolean; reason: string }
  | { ok: false; alreadyCorrect: boolean; reason: string };

export function defaultGenerationsLocationTimezoneTarget(): LocationTimezoneCorrectionTarget {
  return {
    organizationId: GENERATIONS_CRM_TEST_ORG_ID,
    locationId: GENERATIONS_CRM_TEST_LOCATION_ID,
    organizationSlug: GENERATIONS_CRM_TEST_SLUG,
    expectedCurrentTimezone: EXPECTED_CURRENT_LOCATION_TIMEZONE,
    expectedCorrectedTimezone: EXPECTED_CORRECTED_LOCATION_TIMEZONE,
  };
}

export function assertDevDatabaseHost(hostname: string, fragment = DEV_HOST_FRAGMENT): void {
  if (!hostname.includes(fragment)) {
    throw new Error(`Refused: unexpected database host "${hostname}".`);
  }
}

export function assertNonProductionRuntime(env: {
  MAGICCRM_DATABASE_ROLE?: string | null;
  NODE_ENV?: string | null;
}): void {
  if (env.MAGICCRM_DATABASE_ROLE === "test") {
    throw new Error("Refused: MAGICCRM_DATABASE_ROLE=test.");
  }
  if (env.NODE_ENV === "production") {
    throw new Error("Refused: NODE_ENV=production.");
  }
}

/**
 * Configuration-only correction is safe when there are no future confirmed bookings
 * and no active HOLDs that still occupy inventory under the old instant conversion.
 * Historical rows may remain UTC-interpreted; they are never rewritten here.
 */
export function evaluateLocationTimezoneCorrectionSafety(
  input: LocationTimezoneSafetyInput,
): LocationTimezoneSafetyResult {
  if (input.currentLocationTimezone === input.expectedCorrectedTimezone) {
    return {
      ok: true,
      alreadyCorrect: true,
      reason: "Location timezone already matches the corrected value; update is a no-op.",
    };
  }
  if (input.currentLocationTimezone !== input.expectedCurrentTimezone) {
    return {
      ok: false,
      alreadyCorrect: false,
      reason: `Expected current timezone "${input.expectedCurrentTimezone}" but found "${input.currentLocationTimezone}".`,
    };
  }
  if (input.activeHoldCount > 0) {
    return {
      ok: false,
      alreadyCorrect: false,
      reason: `Refused: ${input.activeHoldCount} active HOLD(s) require manual reconciliation before timezone correction.`,
    };
  }
  if (input.futureConfirmedOrHoldCount > 0) {
    return {
      ok: false,
      alreadyCorrect: false,
      reason: `Refused: ${input.futureConfirmedOrHoldCount} future booking/hold occupancy row(s) require manual reconciliation before timezone correction.`,
    };
  }
  return {
    ok: true,
    alreadyCorrect: false,
    reason: "Safe to update location timezone configuration; reservation timestamps will be preserved.",
  };
}
