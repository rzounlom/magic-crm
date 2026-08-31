import type { ReactNode } from "react";
import { auth } from "@clerk/nextjs/server";

import { EmployeeShell } from "@/components/layout/employee-shell";
import { readCurrentClerkUserIdentity } from "@/lib/auth/clerk-user-identity";
import { readTrustedClerkAuth } from "@/lib/auth/trusted-clerk-auth";
import { db } from "@/lib/db";
import { isTenantContextError } from "@/server/errors";
import { ensureProvisionedTenant } from "@/server/services/provision-organization";
import { syncUserProfileIdentityIfMissing } from "@/server/services/sync-user-profile-identity";

export default async function EmployeeAppLayout({ children }: { children: ReactNode }) {
  await auth.protect();
  await syncCurrentEmployeeIdentity();

  return <EmployeeShell>{children}</EmployeeShell>;
}

async function syncCurrentEmployeeIdentity(): Promise<void> {
  const clerkAuth = await readTrustedClerkAuth();
  if (!clerkAuth.clerkUserId || !clerkAuth.clerkOrganizationId) {
    return;
  }

  try {
    await ensureProvisionedTenant(clerkAuth, db);
    await syncUserProfileIdentityIfMissing(db, clerkAuth.clerkUserId, readCurrentClerkUserIdentity);
  } catch (error) {
    if (isTenantContextError(error)) {
      return;
    }
    throw error;
  }
}
