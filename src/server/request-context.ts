import type { TrustedClerkAuth } from "@/lib/auth/trusted-clerk-auth";
import { TenantContextError } from "@/server/errors";
import { logTenantEvent } from "@/server/logging";
import { createOrganizationRepository } from "@/server/repositories/organization-repository";
import { createUserProfileRepository } from "@/server/repositories/user-profile-repository";

/**
 * Trusted server-side request context.
 *
 * Values are derived from authenticated Clerk state plus MagicCRM mappings.
 * Never construct this from cookies, query parameters, headers, form fields,
 * or other browser-provided input. Browser-supplied organizationId is never
 * authorization.
 */
export type RequestContext = {
  userId: string;
  clerkUserId: string;
  organizationId: string;
  clerkOrganizationId: string;
  locationId?: string;
};

export type RequestContextDatabase = Parameters<typeof createOrganizationRepository>[0] &
  Parameters<typeof createUserProfileRepository>[0];

export async function resolveRequestContext(
  trusted: TrustedClerkAuth,
  database: RequestContextDatabase,
): Promise<RequestContext> {
  if (!trusted.clerkUserId) {
    throw new TenantContextError("UNAUTHENTICATED");
  }

  if (!trusted.clerkOrganizationId) {
    throw new TenantContextError("NO_ACTIVE_ORGANIZATION");
  }

  const organizationRepository = createOrganizationRepository(database);
  const userProfileRepository = createUserProfileRepository(database);

  const organization = await organizationRepository.findByClerkOrganizationId(
    trusted.clerkOrganizationId,
  );

  if (!organization) {
    logTenantEvent("tenant_mapping_failure", {
      clerkOrganizationId: trusted.clerkOrganizationId,
      outcome: "organization_not_provisioned",
    });
    throw new TenantContextError("ORGANIZATION_NOT_PROVISIONED");
  }

  if (
    organization.clerkOrganizationId &&
    organization.clerkOrganizationId !== trusted.clerkOrganizationId
  ) {
    logTenantEvent("tenant_mapping_failure", {
      clerkOrganizationId: trusted.clerkOrganizationId,
      outcome: "invalid_tenant_mapping",
    });
    throw new TenantContextError("INVALID_TENANT_MAPPING");
  }

  const userProfile = await userProfileRepository.findByClerkUser(
    { organizationId: organization.id },
    trusted.clerkUserId,
  );

  if (!userProfile) {
    logTenantEvent("tenant_mapping_failure", {
      clerkOrganizationId: trusted.clerkOrganizationId,
      outcome: "user_profile_not_provisioned",
    });
    throw new TenantContextError("USER_PROFILE_NOT_PROVISIONED");
  }

  if (userProfile.organizationId !== organization.id) {
    logTenantEvent("tenant_mapping_failure", {
      clerkOrganizationId: trusted.clerkOrganizationId,
      outcome: "invalid_tenant_mapping",
    });
    throw new TenantContextError("INVALID_TENANT_MAPPING");
  }

  return {
    userId: userProfile.id,
    clerkUserId: trusted.clerkUserId,
    organizationId: organization.id,
    clerkOrganizationId: trusted.clerkOrganizationId,
    locationId: userProfile.defaultLocationId ?? undefined,
  };
}
