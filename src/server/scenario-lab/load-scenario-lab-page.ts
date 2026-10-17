import "server-only";

import { notFound } from "next/navigation";

import { readTrustedClerkAuth } from "@/lib/auth/trusted-clerk-auth";
import { db } from "@/lib/db";
import {
  requireScenarioLabAccess,
  type ScenarioLabAccessContext,
} from "@/server/scenario-lab/authorize-scenario-lab";
import { isScenarioLabError } from "@/server/scenario-lab/errors";

export type ScenarioLabFoundationView = {
  heading: string;
  environmentBadge: string;
  authorizedUser: string;
  trustedOrganization: string;
  databaseIdentityLabel: string;
  environmentVerificationStatus: "verified";
  stagingMessage: string;
};

/**
 * Server-only page loader. Unauthorized callers receive a safe 404.
 * Never returns secrets, URLs, tokens, or other tenants' data.
 */
export async function loadScenarioLabFoundationPage(): Promise<ScenarioLabFoundationView> {
  let access: ScenarioLabAccessContext;
  try {
    const auth = await readTrustedClerkAuth();
    access = await requireScenarioLabAccess({
      auth,
      database: db,
      resolveOrganizationName: async (organizationId) => {
        const org = await db.organization.findFirst({
          where: { id: organizationId },
          select: { name: true },
        });
        return org?.name ?? null;
      },
      resolveUserDisplayName: async (userProfileId) => {
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
      },
    });
  } catch (error) {
    if (isScenarioLabError(error)) {
      notFound();
    }
    throw error;
  }

  return {
    heading: "MagicCRM Scenario Lab",
    environmentBadge: "TEST",
    authorizedUser: access.userDisplayName,
    trustedOrganization: access.organizationName,
    databaseIdentityLabel: access.environment.databaseLabel,
    environmentVerificationStatus: "verified",
    stagingMessage: "Scenario staging is not enabled yet.",
  };
}
