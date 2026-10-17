/**
 * Pure Scenario Lab configuration parsing (no I/O, no server-only).
 * Request headers, cookies, and query parameters must never influence these values.
 */

export const MAGICCRM_DEPLOYMENT_KINDS = {
  LOCAL_DEVELOPMENT: "local_development",
  SCENARIO_LAB_TEST: "scenario_lab_test",
  CUSTOMER_PRODUCTION: "customer_production",
} as const;

export type MagiccrmDeploymentKind =
  (typeof MAGICCRM_DEPLOYMENT_KINDS)[keyof typeof MAGICCRM_DEPLOYMENT_KINDS];

export const SCENARIO_LAB_DATABASE_KINDS = {
  SCENARIO_LAB_TEST: "scenario_lab_test",
} as const;

/** Fixed primary key for the database_environment_identity singleton row. */
export const SCENARIO_LAB_DATABASE_IDENTITY_ROW_ID = "singleton";

export type ScenarioLabDatabaseKind =
  (typeof SCENARIO_LAB_DATABASE_KINDS)[keyof typeof SCENARIO_LAB_DATABASE_KINDS];

export type ScenarioLabConfigIssueCode =
  | "FEATURE_DISABLED"
  | "PRODUCTION_DEPLOYMENT"
  | "INVALID_DEPLOYMENT_KIND"
  | "INVALID_CLERK_INSTANCE"
  | "INVALID_ALLOWLIST"
  | "MISSING_ORG_ID"
  | "MISSING_DATABASE_TOKEN";

export type ScenarioLabConfig =
  | { ok: true; enabled: true; value: ScenarioLabEnabledConfig }
  | { ok: false; enabled: false; code: ScenarioLabConfigIssueCode; message: string };

export type ScenarioLabEnabledConfig = {
  deploymentKind: typeof MAGICCRM_DEPLOYMENT_KINDS.SCENARIO_LAB_TEST;
  allowedClerkUserIds: readonly [string, string];
  trustedClerkOrganizationId: string;
  databaseEnvironmentToken: string;
  clerkSecretKey: string;
  clerkPublishableKey: string;
};

function trim(value: string | undefined | null): string | undefined {
  const next = value?.trim();
  return next ? next : undefined;
}

function parseTruthyFlag(value: string | undefined | null): boolean {
  return trim(value) === "true";
}

export function parseMagiccrmDeploymentKind(
  value: string | undefined | null,
): MagiccrmDeploymentKind | null {
  const kind = trim(value);
  if (
    kind === MAGICCRM_DEPLOYMENT_KINDS.LOCAL_DEVELOPMENT ||
    kind === MAGICCRM_DEPLOYMENT_KINDS.SCENARIO_LAB_TEST ||
    kind === MAGICCRM_DEPLOYMENT_KINDS.CUSTOMER_PRODUCTION
  ) {
    return kind;
  }
  return null;
}

export function isClerkTestInstance(keys: {
  secretKey: string | undefined | null;
  publishableKey: string | undefined | null;
}): boolean {
  const secret = trim(keys.secretKey);
  const publishable = trim(keys.publishableKey);
  return Boolean(secret?.startsWith("sk_test_") && publishable?.startsWith("pk_test_"));
}

export function isClerkLiveInstance(keys: {
  secretKey: string | undefined | null;
  publishableKey: string | undefined | null;
}): boolean {
  const secret = trim(keys.secretKey);
  const publishable = trim(keys.publishableKey);
  return Boolean(secret?.startsWith("sk_live_") || publishable?.startsWith("pk_live_"));
}

/**
 * Exactly two distinct Clerk user IDs. Email addresses are never accepted as identity.
 */
export function parseScenarioLabAllowlist(
  raw: string | undefined | null,
): { ok: true; userIds: readonly [string, string] } | { ok: false; message: string } {
  const value = trim(raw);
  if (!value) {
    return { ok: false, message: "SCENARIO_LAB_ALLOWED_CLERK_USER_IDS must list exactly two Clerk user IDs" };
  }

  const parts = value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length !== 2) {
    return {
      ok: false,
      message: `SCENARIO_LAB_ALLOWED_CLERK_USER_IDS must list exactly two Clerk user IDs (received ${parts.length})`,
    };
  }

  const [first, second] = parts;
  if (!first.startsWith("user_") || !second.startsWith("user_")) {
    return {
      ok: false,
      message: "SCENARIO_LAB_ALLOWED_CLERK_USER_IDS entries must be Clerk user IDs (user_…)",
    };
  }

  if (first === second) {
    return {
      ok: false,
      message: "SCENARIO_LAB_ALLOWED_CLERK_USER_IDS must be two distinct Clerk user IDs",
    };
  }

  return { ok: true, userIds: [first, second] };
}

/**
 * Fail-closed Scenario Lab environment configuration.
 * Does not consult request headers, cookies, query parameters, or NODE_ENV alone.
 */
export function parseScenarioLabConfig(source: NodeJS.Dict<string>): ScenarioLabConfig {
  const enabled = parseTruthyFlag(source.SCENARIO_LAB_ENABLED);
  const deploymentKind = parseMagiccrmDeploymentKind(source.MAGICCRM_DEPLOYMENT_KIND);

  if (deploymentKind === MAGICCRM_DEPLOYMENT_KINDS.CUSTOMER_PRODUCTION) {
    return {
      ok: false,
      enabled: false,
      code: "PRODUCTION_DEPLOYMENT",
      message: "Scenario Lab cannot run when MAGICCRM_DEPLOYMENT_KIND=customer_production",
    };
  }

  if (!enabled) {
    return {
      ok: false,
      enabled: false,
      code: "FEATURE_DISABLED",
      message: "Scenario Lab is disabled (SCENARIO_LAB_ENABLED must be exactly true)",
    };
  }

  if (deploymentKind !== MAGICCRM_DEPLOYMENT_KINDS.SCENARIO_LAB_TEST) {
    return {
      ok: false,
      enabled: false,
      code: "INVALID_DEPLOYMENT_KIND",
      message:
        'Scenario Lab requires MAGICCRM_DEPLOYMENT_KIND=scenario_lab_test (NODE_ENV is never used as deployment identity)',
    };
  }

  const secretKey = trim(source.CLERK_SECRET_KEY);
  const publishableKey = trim(source.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
  if (isClerkLiveInstance({ secretKey, publishableKey })) {
    return {
      ok: false,
      enabled: false,
      code: "INVALID_CLERK_INSTANCE",
      message: "Scenario Lab rejects Clerk LIVE keys",
    };
  }
  if (!isClerkTestInstance({ secretKey, publishableKey })) {
    return {
      ok: false,
      enabled: false,
      code: "INVALID_CLERK_INSTANCE",
      message: "Scenario Lab requires Clerk TEST keys (sk_test_ / pk_test_)",
    };
  }

  const allowlist = parseScenarioLabAllowlist(source.SCENARIO_LAB_ALLOWED_CLERK_USER_IDS);
  if (!allowlist.ok) {
    return {
      ok: false,
      enabled: false,
      code: "INVALID_ALLOWLIST",
      message: allowlist.message,
    };
  }

  const trustedClerkOrganizationId = trim(source.SCENARIO_LAB_ORG_ID);
  if (!trustedClerkOrganizationId?.startsWith("org_")) {
    return {
      ok: false,
      enabled: false,
      code: "MISSING_ORG_ID",
      message: "SCENARIO_LAB_ORG_ID must be the trusted Clerk organization id (org_…)",
    };
  }

  const databaseEnvironmentToken = trim(source.MAGICCRM_DATABASE_ENVIRONMENT_TOKEN);
  if (!databaseEnvironmentToken || databaseEnvironmentToken.length < 16) {
    return {
      ok: false,
      enabled: false,
      code: "MISSING_DATABASE_TOKEN",
      message: "MAGICCRM_DATABASE_ENVIRONMENT_TOKEN must be set (min 16 characters)",
    };
  }

  return {
    ok: true,
    enabled: true,
    value: {
      deploymentKind: MAGICCRM_DEPLOYMENT_KINDS.SCENARIO_LAB_TEST,
      allowedClerkUserIds: allowlist.userIds,
      trustedClerkOrganizationId,
      databaseEnvironmentToken,
      clerkSecretKey: secretKey!,
      clerkPublishableKey: publishableKey!,
    },
  };
}

export function scenarioLabAllowlistContains(
  config: ScenarioLabEnabledConfig,
  clerkUserId: string | null | undefined,
): boolean {
  if (!clerkUserId) {
    return false;
  }
  return config.allowedClerkUserIds.includes(clerkUserId);
}
