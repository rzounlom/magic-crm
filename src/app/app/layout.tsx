import type { ReactNode } from "react";
import { cache } from "react";
import { auth } from "@clerk/nextjs/server";

import { EmployeeShell } from "@/components/layout/employee-shell";
import { markAuthTiming } from "@/lib/auth/auth-timing";
import { readCurrentClerkUserIdentity, readCurrentClerkVerifiedEmails } from "@/lib/auth/clerk-user-identity";
import { readTrustedClerkAuth } from "@/lib/auth/trusted-clerk-auth";
import { db } from "@/lib/db";
import { isTenantContextError } from "@/server/errors";
import { ensureProvisionedTenant } from "@/server/services/provision-organization";
import { syncUserProfileIdentityIfMissing } from "@/server/services/sync-user-profile-identity";
import { applyPendingTeamInvitations } from "@/server/team/apply-pending-invitations";

export const dynamic = "force-dynamic";

/** Deduplicate provision work if layout and a child both trigger it in one request. */
const ensureProvisionedTenantOnce = cache(async () => {
  const clerkAuth = await readTrustedClerkAuth();
  if (!clerkAuth.clerkUserId || !clerkAuth.clerkOrganizationId) {
    return null;
  }
  return ensureProvisionedTenant(clerkAuth, db);
});

export default async function EmployeeAppLayout({ children }: { children: ReactNode }) {
  markAuthTiming("app_shell_start", { route: "/app" });
  await auth.protect();
  await syncCurrentEmployeeIdentity();
  markAuthTiming("chrome_done", { route: "/app" });

  return <EmployeeShell>{children}</EmployeeShell>;
}

async function syncCurrentEmployeeIdentity(): Promise<void> {
  const clerkAuth = await readTrustedClerkAuth();
  if (!clerkAuth.clerkUserId || !clerkAuth.clerkOrganizationId) {
    return;
  }

  try {
    const provisioned = await ensureProvisionedTenantOnce();
    markAuthTiming("provision_done", {
      organizationCreated: provisioned?.organizationCreated ?? false,
      userProfileCreated: provisioned?.userProfileCreated ?? false,
    });
    if (!provisioned) {
      return;
    }
    await applyPendingTeamInvitations(db, {
      organizationId: provisioned.organizationId,
      userProfileId: provisioned.userProfileId,
      verifiedEmails: await readCurrentClerkVerifiedEmails(),
    });
    await syncUserProfileIdentityIfMissing(db, clerkAuth.clerkUserId, readCurrentClerkUserIdentity);
  } catch (error) {
    if (isTenantContextError(error)) {
      return;
    }
    throw error;
  }
}
