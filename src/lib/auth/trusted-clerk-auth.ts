import "server-only";

import { auth } from "@clerk/nextjs/server";

export type TrustedClerkAuth = {
  clerkUserId: string | null;
  clerkOrganizationId: string | null;
  organizationName?: string;
  organizationSlug?: string;
  clerkOrganizationRole?: string | null;
};

/**
 * Narrow trusted input from the Clerk session.
 *
 * Session fields used here: userId, orgId, orgSlug. The session JWT does not
 * include an organization display name (claims are org id, slug, and role).
 * Do not call Clerk's HTTP API on every request to fetch the pretty name.
 *
 * Tests inject TrustedClerkAuth directly and never call Clerk.
 */
export async function readTrustedClerkAuth(): Promise<TrustedClerkAuth> {
  const { userId, orgId, orgSlug, orgRole } = await auth();

  if (!userId) {
    return {
      clerkUserId: null,
      clerkOrganizationId: null,
    };
  }

  if (!orgId) {
    return {
      clerkUserId: userId,
      clerkOrganizationId: null,
    };
  }

  return {
    clerkUserId: userId,
    clerkOrganizationId: orgId,
    organizationSlug: orgSlug ?? undefined,
    organizationName: orgSlug ?? undefined,
    clerkOrganizationRole: orgRole ?? null,
  };
}
