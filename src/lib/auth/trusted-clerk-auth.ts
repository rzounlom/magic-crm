import "server-only";

import { auth } from "@clerk/nextjs/server";

export type TrustedClerkAuth = {
  clerkUserId: string | null;
  clerkOrganizationId: string | null;
  organizationName?: string;
  organizationSlug?: string;
};

/**
 * Narrow trusted input from the Clerk session.
 *
 * This is the only place MagicCRM reads Clerk identity. Tests inject
 * TrustedClerkAuth directly and never call Clerk.
 */
export async function readTrustedClerkAuth(): Promise<TrustedClerkAuth> {
  const { userId, orgId, orgSlug } = await auth();

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
  };
}
