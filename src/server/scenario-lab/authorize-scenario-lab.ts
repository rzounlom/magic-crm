import "server-only";

import type { TrustedClerkAuth } from "@/lib/auth/trusted-clerk-auth";
import { scenarioLabAllowlistContains } from "@/lib/env/scenario-lab-config";
import { isTenantContextError } from "@/server/errors";
import { requirePermission, type AuthorizationDatabase } from "@/server/policies/require-permission";
import {
  resolveRequestContext,
  type RequestContext,
  type RequestContextDatabase,
} from "@/server/request-context";
import {
  assertScenarioLabEnvironment,
  type ScenarioLabEnvironmentDatabase,
  type VerifiedScenarioLabEnvironment,
} from "@/server/scenario-lab/environment-guard";
import { ScenarioLabError } from "@/server/scenario-lab/errors";
import { PERMISSIONS } from "@/types/permissions";

/** Administrative permission required for Scenario Lab access. */
export const SCENARIO_LAB_REQUIRED_PERMISSION = PERMISSIONS.ORGANIZATION_SETTINGS_MANAGE;

export type ScenarioLabAccessDatabase = RequestContextDatabase &
  AuthorizationDatabase &
  ScenarioLabEnvironmentDatabase;

export type ScenarioLabAccessContext = {
  request: RequestContext;
  environment: VerifiedScenarioLabEnvironment;
  organizationName: string;
  userDisplayName: string;
};

export type ScenarioLabAccessOptions = {
  auth: TrustedClerkAuth;
  database: ScenarioLabAccessDatabase;
  env?: NodeJS.Dict<string>;
  /** Optional org display name lookup. Defaults to slug/id-safe fallback. */
  resolveOrganizationName?: (organizationId: string) => Promise<string | null>;
  resolveUserDisplayName?: (userProfileId: string) => Promise<string | null>;
};

/**
 * Shared Scenario Lab gate for pages and future mutation entry points.
 * Fail closed. Does not authorize by email. Does not bypass tenant authorization.
 */
export async function requireScenarioLabAccess(
  options: ScenarioLabAccessOptions,
): Promise<ScenarioLabAccessContext> {
  const envSource = options.env ?? process.env;
  const environment = await assertScenarioLabEnvironment(envSource, options.database);

  if (!options.auth.clerkUserId) {
    throw new ScenarioLabError("UNAUTHENTICATED");
  }

  if (!options.auth.clerkOrganizationId) {
    throw new ScenarioLabError("NO_ACTIVE_ORGANIZATION");
  }

  if (!scenarioLabAllowlistContains(environment.config, options.auth.clerkUserId)) {
    throw new ScenarioLabError("USER_NOT_ALLOWLISTED");
  }

  if (options.auth.clerkOrganizationId !== environment.config.trustedClerkOrganizationId) {
    throw new ScenarioLabError("WRONG_ORGANIZATION");
  }

  let request: RequestContext;
  try {
    request = await resolveRequestContext(options.auth, options.database);
  } catch (error) {
    if (isTenantContextError(error)) {
      if (error.code === "UNAUTHENTICATED") {
        throw new ScenarioLabError("UNAUTHENTICATED");
      }
      if (error.code === "NO_ACTIVE_ORGANIZATION") {
        throw new ScenarioLabError("NO_ACTIVE_ORGANIZATION");
      }
      throw new ScenarioLabError("TENANT_CONTEXT_FAILED", error.code);
    }
    throw error;
  }

  if (request.clerkOrganizationId !== environment.config.trustedClerkOrganizationId) {
    throw new ScenarioLabError("WRONG_ORGANIZATION");
  }

  if (request.clerkUserId !== options.auth.clerkUserId) {
    throw new ScenarioLabError("TENANT_CONTEXT_FAILED");
  }

  try {
    await requirePermission(request, SCENARIO_LAB_REQUIRED_PERMISSION, options.database);
  } catch {
    throw new ScenarioLabError("MISSING_PERMISSION");
  }

  const organizationName =
    (await options.resolveOrganizationName?.(request.organizationId)) ??
    options.auth.organizationSlug ??
    request.organizationId;
  const userDisplayName =
    (await options.resolveUserDisplayName?.(request.userId)) ?? request.clerkUserId;

  return {
    request,
    environment,
    organizationName,
    userDisplayName,
  };
}
