import type { PrismaClient } from "@/generated/prisma/client";
import {
  hasIdentitySnapshot,
  needsIdentitySync,
  type UserIdentitySnapshot,
} from "@/lib/identity/user-display";

export type IdentityDatabase = Pick<PrismaClient, "userProfile">;

export async function persistUserIdentitySnapshot(
  database: IdentityDatabase,
  clerkUserId: string,
  snapshot: UserIdentitySnapshot,
  options?: { organizationId?: string },
): Promise<number> {
  if (!hasIdentitySnapshot(snapshot)) {
    return 0;
  }

  const result = await database.userProfile.updateMany({
    where: options?.organizationId
      ? { clerkUserId, organizationId: options.organizationId }
      : { clerkUserId },
    data: {
      firstName: snapshot.firstName,
      lastName: snapshot.lastName,
      displayName: snapshot.displayName,
      email: snapshot.email,
      avatarUrl: snapshot.avatarUrl,
    },
  });

  return result.count;
}

export async function syncUserProfileIdentityIfMissing(
  database: IdentityDatabase,
  clerkUserId: string,
  loadSnapshot: () => Promise<UserIdentitySnapshot | null>,
): Promise<number> {
  const profiles = await database.userProfile.findMany({
    where: { clerkUserId },
    select: { displayName: true, email: true },
  });

  if (profiles.length === 0 || profiles.every((profile) => !needsIdentitySync(profile))) {
    return 0;
  }

  const snapshot = await loadSnapshot();
  if (!snapshot) {
    return 0;
  }

  return persistUserIdentitySnapshot(database, clerkUserId, snapshot);
}
