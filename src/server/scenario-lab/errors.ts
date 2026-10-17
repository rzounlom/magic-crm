export const SCENARIO_LAB_ERROR_CODES = [
  "FEATURE_DISABLED",
  "PRODUCTION_DEPLOYMENT",
  "INVALID_DEPLOYMENT_KIND",
  "INVALID_CLERK_INSTANCE",
  "INVALID_ALLOWLIST",
  "MISSING_ORG_ID",
  "MISSING_DATABASE_TOKEN",
  "DATABASE_IDENTITY_MISSING",
  "DATABASE_IDENTITY_MISMATCH",
  "DATABASE_CONNECTION_MISMATCH",
  "UNAUTHENTICATED",
  "NO_ACTIVE_ORGANIZATION",
  "USER_NOT_ALLOWLISTED",
  "WRONG_ORGANIZATION",
  "MISSING_PERMISSION",
  "TENANT_CONTEXT_FAILED",
  "TEMPLATE_UNAVAILABLE",
  "VENUE_NOT_READY",
  "RUN_NOT_FOUND",
  "INVALID_RUN_STATUS",
  "INVALID_INPUT",
] as const;

export type ScenarioLabErrorCode = (typeof SCENARIO_LAB_ERROR_CODES)[number];

/**
 * Fail-closed Scenario Lab denial. Callers that serve HTTP must map this to a
 * safe 404 / access-denied response without leaking configuration details.
 */
export class ScenarioLabError extends Error {
  readonly code: ScenarioLabErrorCode;

  constructor(code: ScenarioLabErrorCode, message?: string) {
    super(message ?? code);
    this.name = "ScenarioLabError";
    this.code = code;
  }
}

export function isScenarioLabError(error: unknown): error is ScenarioLabError {
  return error instanceof ScenarioLabError;
}
