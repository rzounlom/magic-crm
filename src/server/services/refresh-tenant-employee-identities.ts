import type { PrismaClient } from "@/generated/prisma/client";
import {
  needsIdentitySync,
  type UserIdentitySnapshot,
} from "@/lib/identity/user-display";
import type { UserIdentityDirectory } from "@/lib/identity/user-identity-directory";
import { AuthorizationError, isAuthorizationError, isTenantContextError } from "@/server/errors";
import { logTenantEvent } from "@/server/logging";
import { hasPermission } from "@/server/policies/require-permission";
import type { RequestContext } from "@/server/request-context";
import { persistUserIdentitySnapshot } from "@/server/services/sync-user-profile-identity";
import { PERMISSIONS } from "@/types/permissions";

export type RefreshTenantEmployeeIdentitiesResult = {
  missingCount: number;
  refreshedCount: number;
  unresolvedCount: number;
};

export async function canRefreshTenantEmployeeIdentities(
  ctx: Pick<RequestContext, "organizationId" | "userId">,
  database: PrismaClient,
): Promise<boolean> {
  return (
    (await hasPermission(ctx, PERMISSIONS.SECURITY_GROUPS_MANAGE, database)) ||
    (await hasPermission(ctx, PERMISSIONS.USERS_MANAGE, database))
  );
}

export async function requireIdentityRefreshPermission(
  ctx: Pick<RequestContext, "organizationId" | "userId">,
  database: PrismaClient,
): Promise<void> {
  if (!(await canRefreshTenantEmployeeIdentities(ctx, database))) {
    throw new AuthorizationError("FORBIDDEN");
  }
}

export async function refreshTenantEmployeeIdentities(
  ctx: RequestContext,
  database: PrismaClient,
  directory: UserIdentityDirectory,
): Promise<RefreshTenantEmployeeIdentitiesResult> {
  await requireIdentityRefreshPermission(ctx, database);

  const profiles = await database.userProfile.findMany({
    where: {
      organizationId: ctx.organizationId,
      AND: [
        { OR: [{ displayName: null }, { displayName: "" }] },
        { OR: [{ email: null }, { email: "" }] },
      ],
    },
    select: {
      clerkUserId: true,
      displayName: true,
      email: true,
    },
  });

  const missing = profiles.filter((profile) => needsIdentitySync(profile));
  if (missing.length === 0) {
    return { missingCount: 0, refreshedCount: 0, unresolvedCount: 0 };
  }

  const clerkUserIds = [...new Set(missing.map((profile) => profile.clerkUserId))];
  const identities = await directory.getIdentitiesByClerkUserIds(clerkUserIds);

  let refreshedCount = 0;
  for (const clerkUserId of clerkUserIds) {
    const snapshot = identities.get(clerkUserId);
    if (!snapshot || !hasUsableEmployeeLabel(snapshot)) {
      continue;
    }

    refreshedCount += await persistUserIdentitySnapshot(database, clerkUserId, snapshot, {
      organizationId: ctx.organizationId,
    });
  }

  return {
    missingCount: missing.length,
    refreshedCount,
    unresolvedCount: Math.max(missing.length - refreshedCount, 0),
  };
}

export async function tryRefreshTenantEmployeeIdentities(
  ctx: RequestContext,
  database: PrismaClient,
  directory: UserIdentityDirectory,
): Promise<void> {
  try {
    if (!(await canRefreshTenantEmployeeIdentities(ctx, database))) {
      return;
    }
    await refreshTenantEmployeeIdentities(ctx, database, directory);
  } catch (error) {
    if (isAuthorizationError(error) || isTenantContextError(error)) {
      return;
    }
    logTenantEvent("employee_identity_refresh_failed", { outcome: "failed" });
  }
}

function hasUsableEmployeeLabel(snapshot: UserIdentitySnapshot): boolean {
  return Boolean(snapshot.displayName || snapshot.email || snapshot.firstName || snapshot.lastName);
}
