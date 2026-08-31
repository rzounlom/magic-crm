import type { UserIdentitySnapshot } from "@/lib/identity/user-display";

/**
 * Narrow identity-provider lookup used to fill UserProfile display snapshots.
 * Production uses Clerk's batched backend API. Tests inject a fake.
 *
 * Callers must only pass clerkUserIds that already belong to the current
 * tenant's UserProfiles. The directory must not be used as tenant authority.
 */
export type UserIdentityDirectory = {
  getIdentitiesByClerkUserIds(
    clerkUserIds: readonly string[],
  ): Promise<ReadonlyMap<string, UserIdentitySnapshot>>;
};
