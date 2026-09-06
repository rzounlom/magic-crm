import "server-only";

import { clerkClient, currentUser } from "@clerk/nextjs/server";

import {
  snapshotFromBackendClerkUser,
  snapshotFromClerkUser,
  type UserIdentitySnapshot,
} from "@/lib/identity/user-display";
import type { UserIdentityDirectory } from "@/lib/identity/user-identity-directory";
import { verifiedEmailsFromClerkUser } from "@/server/team/trusted-invitation-emails";

/** Clerk getUserList accepts at most 100 user IDs per request. */
const CLERK_USER_ID_BATCH_SIZE = 100;

/**
 * Trusted identity snapshot for the signed-in Clerk user.
 * Call only when UserProfile display fields are missing — not on every request.
 */
export async function readCurrentClerkUserIdentity(): Promise<UserIdentitySnapshot | null> {
  const user = await currentUser();
  if (!user) {
    return null;
  }

  return snapshotFromClerkUser({
    firstName: user.firstName,
    lastName: user.lastName,
    fullName: user.fullName,
    imageUrl: user.imageUrl,
    primaryEmailAddress: user.primaryEmailAddress,
  });
}

/**
 * Trusted emails for invitation matching. Never use a browser-submitted email.
 * Primary plus verified addresses only.
 */
export async function readCurrentClerkVerifiedEmails(): Promise<string[]> {
  const user = await currentUser();
  if (!user) {
    return [];
  }

  return verifiedEmailsFromClerkUser({
    primaryEmailAddress: user.primaryEmailAddress,
    emailAddresses: user.emailAddresses,
  });
}

export function createClerkUserIdentityDirectory(): UserIdentityDirectory {
  return {
    async getIdentitiesByClerkUserIds(clerkUserIds) {
      const uniqueIds = [...new Set(clerkUserIds.filter((id) => id.trim().length > 0))];
      const identities = new Map<string, UserIdentitySnapshot>();
      if (uniqueIds.length === 0) {
        return identities;
      }

      const client = await clerkClient();

      for (let index = 0; index < uniqueIds.length; index += CLERK_USER_ID_BATCH_SIZE) {
        const batch = uniqueIds.slice(index, index + CLERK_USER_ID_BATCH_SIZE);
        const page = await client.users.getUserList({
          userId: batch,
          limit: batch.length,
        });

        for (const user of page.data) {
          identities.set(user.id, snapshotFromBackendClerkUser(user));
        }
      }

      return identities;
    },
  };
}
