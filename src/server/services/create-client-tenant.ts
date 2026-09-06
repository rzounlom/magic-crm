import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import type { OrganizationDirectory } from "@/lib/auth/organization-directory";
import { SYSTEM_GROUP_KEYS } from "@/server/authorization/default-security-groups";
import { TeamManagementError } from "@/server/errors";
import { logTenantEvent } from "@/server/logging";
import { recordAuditEvent } from "@/server/services/audit";
import { ensureDefaultSecurityGroups } from "@/server/services/ensure-default-security-groups";
import {
  DEFAULT_TENANT_CURRENCY,
  DEFAULT_TENANT_TIMEZONE,
  PRIMARY_LOCATION_NAME,
  PRIMARY_LOCATION_SLUG,
  slugifyOrganizationName,
} from "@/server/services/provision-organization";
import { createPlatformTeamInvitation } from "@/server/services/team-invitation-service";
import { validateCreateClientTenantInput, type CreateClientTenantInput } from "@/server/team/create-client-tenant-input";
import { mapClerkInvitationError } from "@/server/team/clerk-invitation-errors";
import { nextOnboardingStatus, parseOnboardingStatus } from "@/server/team/onboarding-status";
import { firstAdminQueuedGroupIds } from "@/server/team/queued-groups";
import { ONBOARDING_STATUSES, TEAM_INVITATION_STATUSES } from "@/types/team";

export type CreateClientTenantResult = {
  organizationId: string;
  clerkOrganizationId: string;
  locationId: string;
  invitationId: string | null;
  onboardingStatus: string;
  reused: boolean;
};

function uniqueSlug(name: string, clerkOrganizationId?: string): string {
  const base = slugifyOrganizationName(name);
  if (!clerkOrganizationId) {
    return base;
  }
  return `${base}-${clerkOrganizationId.slice(-8).toLowerCase()}`;
}

async function setOnboardingStatus(
  database: PrismaClient,
  organizationId: string,
  event: Parameters<typeof nextOnboardingStatus>[1],
) {
  const organization = await database.organization.findFirstOrThrow({
    where: { id: organizationId },
    select: { onboardingStatus: true },
  });
  const next = nextOnboardingStatus(parseOnboardingStatus(organization.onboardingStatus), event);
  if (next !== organization.onboardingStatus) {
    await database.organization.update({
      where: { id: organizationId },
      data: { onboardingStatus: next },
    });
  }
  return next;
}

async function findOrCreateClerkOrganization(
  directory: OrganizationDirectory,
  input: { name: string; slug: string },
) {
  const existing = await directory.getOrganizationBySlug(input.slug);
  if (existing) {
    if (!existing.createdByMagicCrm) {
      throw new TeamManagementError(
        "CLIENT_TENANT_VALIDATION",
        "A Clerk organization with this slug already exists outside MagicCRM onboarding.",
      );
    }
    return existing;
  }

  try {
    return await directory.createOrganization({
      name: input.name,
      slug: input.slug,
    });
  } catch (error) {
    const raced = await directory.getOrganizationBySlug(input.slug);
    if (raced?.createdByMagicCrm) {
      return raced;
    }
    throw mapClerkInvitationError(error);
  }
}

async function createMagicCrmOrganization(
  database: PrismaClient,
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
      data: {
        clerkOrganizationId: input.clerkOrganizationId,
        name: input.name,
        slug: input.slug,
        timezone: input.timezone,
        currency: input.currency,
        onboardingStatus: ONBOARDING_STATUSES.PROVISIONING,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const byClerk = await database.organization.findFirst({
        where: { clerkOrganizationId: input.clerkOrganizationId },
      });
      if (byClerk) {
        return byClerk;
      }
      return database.organization.create({
        data: {
          ...input,
          slug: uniqueSlug(input.name, input.clerkOrganizationId),
          onboardingStatus: ONBOARDING_STATUSES.PROVISIONING,
        },
      });
    }
    throw error;
  }
}

/**
 * Platform-internal client onboarding. Do not expose to tenant employees.
 *
 * Clerk Organization creation cannot roll back with PostgreSQL. Retries reuse
 * the Clerk org (marked with MagicCRM onboarding metadata) and the MagicCRM
 * Organization row, then resume the first-admin invitation if needed.
 */
export async function createClientTenant(
  database: PrismaClient,
  directory: OrganizationDirectory,
  rawInput: CreateClientTenantInput,
): Promise<CreateClientTenantResult> {
  const input = validateCreateClientTenantInput({
    ...rawInput,
    timezone: rawInput.timezone ?? DEFAULT_TENANT_TIMEZONE,
    currency: rawInput.currency ?? DEFAULT_TENANT_CURRENCY,
  });

  logTenantEvent("client_tenant_provisioning_started", {
    outcome: "started",
  });

  const requestedSlug = slugifyOrganizationName(input.organizationName);

  const existingBySlug = await database.organization.findFirst({
    where: { slug: requestedSlug },
  });

  if (existingBySlug && parseOnboardingStatus(existingBySlug.onboardingStatus) === ONBOARDING_STATUSES.ACTIVE) {
    const pending = await database.teamInvitation.findFirst({
      where: {
        organizationId: existingBySlug.id,
        emailNormalized: input.emailNormalized,
        status: TEAM_INVITATION_STATUSES.PENDING,
        firstAdminIntent: true,
      },
      select: { id: true },
    });
    const location = await database.location.findFirstOrThrow({
      where: { organizationId: existingBySlug.id, slug: PRIMARY_LOCATION_SLUG },
      select: { id: true },
    });
    logTenantEvent("client_tenant_reused", { outcome: "already_active" });
    return {
      organizationId: existingBySlug.id,
      clerkOrganizationId: existingBySlug.clerkOrganizationId ?? "",
      locationId: location.id,
      invitationId: pending?.id ?? null,
      onboardingStatus: existingBySlug.onboardingStatus,
      reused: true,
    };
  }

  const clerkOrganization = existingBySlug?.clerkOrganizationId
    ? {
        id: existingBySlug.clerkOrganizationId,
        name: input.organizationName,
        slug: requestedSlug,
        createdByMagicCrm: true,
      }
    : await findOrCreateClerkOrganization(directory, {
        name: input.organizationName,
        slug: requestedSlug,
      });

  const organization =
    existingBySlug ??
    (await createMagicCrmOrganization(database, {
      clerkOrganizationId: clerkOrganization.id,
      name: input.organizationName,
      slug: requestedSlug,
      timezone: input.timezone,
      currency: input.currency,
    }));

  if (!organization.clerkOrganizationId) {
    await database.organization.update({
      where: { id: organization.id },
      data: { clerkOrganizationId: clerkOrganization.id },
    });
  }

  await setOnboardingStatus(database, organization.id, existingBySlug ? "retry" : "provisioning_started");

  const existingLocation = await database.location.findFirst({
    where: { organizationId: organization.id, slug: PRIMARY_LOCATION_SLUG },
  });
  const location =
    existingLocation ??
    (await database.location.create({
      data: {
        organizationId: organization.id,
        name: PRIMARY_LOCATION_NAME,
        slug: PRIMARY_LOCATION_SLUG,
        timezone: organization.timezone,
        active: true,
      },
    }));

  await ensureDefaultSecurityGroups(database, {
    organizationId: organization.id,
    organizationCreated: !existingBySlug,
    isClerkOrganizationAdmin: false,
  });

  const administrators = await database.securityGroup.findFirstOrThrow({
    where: {
      organizationId: organization.id,
      systemKey: SYSTEM_GROUP_KEYS.ADMINISTRATORS,
    },
    select: { id: true },
  });

  const existingPending = await database.teamInvitation.findFirst({
    where: {
      organizationId: organization.id,
      emailNormalized: input.emailNormalized,
      status: TEAM_INVITATION_STATUSES.PENDING,
    },
    select: { id: true },
  });

  if (!existingBySlug) {
    await recordAuditEvent(database, {
      organizationId: organization.id,
      action: "tenant.client_created",
      resourceType: "organization",
      resourceId: organization.id,
      metadata: { slug: organization.slug },
    });
  }

  if (existingPending) {
    const status = await setOnboardingStatus(database, organization.id, "admin_invited");
    logTenantEvent("client_tenant_reused", { outcome: "invitation_pending" });
    return {
      organizationId: organization.id,
      clerkOrganizationId: clerkOrganization.id,
      locationId: location.id,
      invitationId: existingPending.id,
      onboardingStatus: status,
      reused: true,
    };
  }

  const invitation = await createPlatformTeamInvitation({
    database,
    directory,
    organizationId: organization.id,
    clerkOrganizationId: clerkOrganization.id,
    email: input.adminEmail,
    securityGroupIds: firstAdminQueuedGroupIds({ administratorsGroupId: administrators.id }),
    firstAdminIntent: true,
  });

  await recordAuditEvent(database, {
    organizationId: organization.id,
    action: "tenant.admin_invited",
    resourceType: "team_invitation",
    resourceId: invitation.id,
    metadata: { emailNormalized: input.emailNormalized },
  });

  const status = await setOnboardingStatus(database, organization.id, "admin_invited");
  logTenantEvent("client_tenant_provisioned", { outcome: "awaiting_admin" });

  return {
    organizationId: organization.id,
    clerkOrganizationId: clerkOrganization.id,
    locationId: location.id,
    invitationId: invitation.id,
    onboardingStatus: status,
    reused: Boolean(existingBySlug),
  };
}
