import "server-only";

import { notFound } from "next/navigation";

import { readTrustedClerkAuth } from "@/lib/auth/trusted-clerk-auth";
import { db } from "@/lib/db";
import {
  requireScenarioLabAccess,
  type ScenarioLabAccessContext,
  type ScenarioLabAccessOptions,
} from "@/server/scenario-lab/authorize-scenario-lab";
import { isScenarioLabError } from "@/server/scenario-lab/errors";

async function resolveOrganizationName(organizationId: string): Promise<string | null> {
  const org = await db.organization.findFirst({
    where: { id: organizationId },
    select: { name: true },
  });
  return org?.name ?? null;
}

async function resolveUserDisplayName(userProfileId: string): Promise<string | null> {
  const profile = await db.userProfile.findFirst({
    where: { id: userProfileId },
    select: { displayName: true, firstName: true, lastName: true, clerkUserId: true },
  });
  if (!profile) {
    return null;
  }
  if (profile.displayName?.trim()) {
    return profile.displayName.trim();
  }
  const name = [profile.firstName, profile.lastName].filter(Boolean).join(" ").trim();
  if (name) {
    return name;
  }
  return profile.clerkUserId;
}

function scenarioLabAccessOptions(
  auth: Awaited<ReturnType<typeof readTrustedClerkAuth>>,
  overrides?: Partial<ScenarioLabAccessOptions>,
): ScenarioLabAccessOptions {
  return {
    auth,
    database: db,
    resolveOrganizationName,
    resolveUserDisplayName,
    ...overrides,
  };
}

export async function loadScenarioLabAccessOrNotFound(): Promise<ScenarioLabAccessContext> {
  try {
    const auth = await readTrustedClerkAuth();
    return await requireScenarioLabAccess(scenarioLabAccessOptions(auth));
  } catch (error) {
    if (isScenarioLabError(error)) {
      notFound();
    }
    throw error;
  }
}

/**
 * Soft probe for shell chrome. Reuses the full LAB1-A gate; never throws ScenarioLabError.
 * Fail closed → false. Unexpected errors still propagate.
 */
export async function hasScenarioLabAccess(
  overrides?: Partial<ScenarioLabAccessOptions>,
): Promise<boolean> {
  try {
    const auth = overrides?.auth ?? (await readTrustedClerkAuth());
    await requireScenarioLabAccess(scenarioLabAccessOptions(auth, overrides));
    return true;
  } catch (error) {
    if (isScenarioLabError(error)) {
      return false;
    }
    throw error;
  }
}
