import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import type { TrustedClerkAuth } from "@/lib/auth/trusted-clerk-auth";
import type { UserIdentitySnapshot } from "@/lib/identity/user-display";
import { TenantContextError } from "@/server/errors";
import { logTenantEvent } from "@/server/logging";
import {
  ensureDefaultSecurityGroups,
  isClerkOrganizationAdminRole,
} from "@/server/services/ensure-default-security-groups";
import { persistUserIdentitySnapshot } from "@/server/services/sync-user-profile-identity";

export const PRIMARY_LOCATION_SLUG = "main";
export const PRIMARY_LOCATION_NAME = "Main Location";
export const DEFAULT_TENANT_TIMEZONE = "UTC";
export const DEFAULT_TENANT_CURRENCY = "USD";

export type ProvisionOrganizationInput = {
  clerkUserId: string;
  clerkOrganizationId: string;
  organizationName: string;
  organizationSlug?: string;
  timezone?: string;
  currency?: string;
  isClerkOrganizationAdmin?: boolean;
  identity?: UserIdentitySnapshot;
};

export type ProvisionOrganizationResult = {
  organizationId: string;
  locationId: string;
  userProfileId: string;
  organizationCreated: boolean;
  locationCreated: boolean;
  userProfileCreated: boolean;
};

export type ProvisionDb = PrismaClient;

function slugify(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

  return slug || "organization";
}

export function provisionInputFromClerkAuth(auth: TrustedClerkAuth): ProvisionOrganizationInput {
  if (!auth.clerkUserId) {
    throw new TenantContextError("UNAUTHENTICATED");
  }

  if (!auth.clerkOrganizationId) {
    throw new TenantContextError("NO_ACTIVE_ORGANIZATION");
  }

  return {
    clerkUserId: auth.clerkUserId,
    clerkOrganizationId: auth.clerkOrganizationId,
    organizationName: auth.organizationName?.trim() || "Organization",
    organizationSlug: auth.organizationSlug,
    isClerkOrganizationAdmin: isClerkOrganizationAdminRole(auth.clerkOrganizationRole),
  };
}

export async function provisionOrganization(
  input: ProvisionOrganizationInput,
  database: ProvisionDb,
): Promise<ProvisionOrganizationResult> {
  if (!input.clerkUserId || !input.clerkOrganizationId || !input.organizationName.trim()) {
    throw new TenantContextError("INVALID_TENANT_MAPPING");
  }

  logTenantEvent("organization_provisioning_started", {
    clerkOrganizationId: input.clerkOrganizationId,
  });

  const timezone = input.timezone ?? DEFAULT_TENANT_TIMEZONE;
  const currency = input.currency ?? DEFAULT_TENANT_CURRENCY;
  const requestedSlug = slugify(input.organizationSlug ?? input.organizationName);

  const existing = await database.organization.findFirst({
    where: { clerkOrganizationId: input.clerkOrganizationId },
  });

  const organization = existing
    ? existing
    : await createOrganizationSafely(database, {
        clerkOrganizationId: input.clerkOrganizationId,
        name: input.organizationName.trim(),
        slug: requestedSlug,
        timezone,
        currency,
      });

  if (existing) {
    logTenantEvent("organization_reused", {
      clerkOrganizationId: input.clerkOrganizationId,
    });
  } else {
    logTenantEvent("organization_provisioned", {
      clerkOrganizationId: input.clerkOrganizationId,
    });
  }

  const existingLocation = await database.location.findFirst({
    where: {
      organizationId: organization.id,
      slug: PRIMARY_LOCATION_SLUG,
    },
  });

  const location =
    existingLocation ??
    (await createLocationSafely(database, {
      organizationId: organization.id,
      timezone: organization.timezone,
    }));

  const existingProfile = await database.userProfile.findFirst({
    where: {
      organizationId: organization.id,
      clerkUserId: input.clerkUserId,
    },
  });

  const userProfile =
    existingProfile ??
    (await createUserProfileSafely(database, {
      organizationId: organization.id,
      clerkUserId: input.clerkUserId,
      defaultLocationId: location.id,
    }));

  if (existingProfile) {
    logTenantEvent("user_profile_reused", {
      clerkOrganizationId: input.clerkOrganizationId,
    });
  } else {
    logTenantEvent("user_profile_provisioned", {
      clerkOrganizationId: input.clerkOrganizationId,
    });
  }

  await ensureDefaultSecurityGroups(database, {
    organizationId: organization.id,
    userProfileId: userProfile.id,
    organizationCreated: !existing,
    isClerkOrganizationAdmin: input.isClerkOrganizationAdmin ?? false,
  });

  if (input.identity) {
    await persistUserIdentitySnapshot(database, input.clerkUserId, input.identity);
  }

  return {
    organizationId: organization.id,
    locationId: location.id,
    userProfileId: userProfile.id,
    organizationCreated: !existing,
    locationCreated: !existingLocation,
    userProfileCreated: !existingProfile,
  };
}

async function createOrganizationSafely(
  database: ProvisionDb,
  input: {
    clerkOrganizationId: string;
    name: string;
    slug: string;
    timezone: string;
    currency: string;
  },
) {
  try {
    return await database.organization.create({
      data: input,
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const raced = await database.organization.findFirst({
        where: { clerkOrganizationId: input.clerkOrganizationId },
      });

      if (raced) {
        return raced;
      }

      return database.organization.create({
        data: {
          ...input,
          slug: `${input.slug}-${input.clerkOrganizationId.slice(-8).toLowerCase()}`,
        },
      });
    }

    throw error;
  }
}

async function createLocationSafely(
  database: ProvisionDb,
  input: { organizationId: string; timezone: string },
) {
  try {
    return await database.location.create({
      data: {
        organizationId: input.organizationId,
        name: PRIMARY_LOCATION_NAME,
        slug: PRIMARY_LOCATION_SLUG,
        timezone: input.timezone,
        active: true,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const raced = await database.location.findFirst({
        where: {
          organizationId: input.organizationId,
          slug: PRIMARY_LOCATION_SLUG,
        },
      });

      if (raced) {
        return raced;
      }

      throw new TenantContextError("INVALID_TENANT_MAPPING");
    }

    throw error;
  }
}

async function createUserProfileSafely(
  database: ProvisionDb,
  input: { organizationId: string; clerkUserId: string; defaultLocationId: string },
) {
  try {
    return await database.userProfile.create({
      data: input,
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const raced = await database.userProfile.findFirst({
        where: {
          organizationId: input.organizationId,
          clerkUserId: input.clerkUserId,
        },
      });

      if (raced) {
        return raced;
      }

      throw new TenantContextError("INVALID_TENANT_MAPPING");
    }

    throw error;
  }
}

export async function ensureProvisionedTenant(
  auth: TrustedClerkAuth,
  database: ProvisionDb,
): Promise<ProvisionOrganizationResult> {
  return provisionOrganization(provisionInputFromClerkAuth(auth), database);
}
