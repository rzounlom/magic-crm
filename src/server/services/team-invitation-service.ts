import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { employeeInvitationRedirectUrl, readApplicationOrigin } from "@/lib/auth/application-url";
import type { OrganizationDirectory } from "@/lib/auth/organization-directory";
import { SYSTEM_GROUP_KEYS } from "@/server/authorization/default-security-groups";
import { AuthorizationError, TeamManagementError } from "@/server/errors";
import { logTenantEvent } from "@/server/logging";
import { requirePermission } from "@/server/policies/require-permission";
import type { RequestContext } from "@/server/request-context";
import { recordAuditEvent, recordSecurityAudit } from "@/server/services/audit";
import { emailsMatchNormalized, isValidInvitationEmail, normalizeInvitationEmail } from "@/server/team/invitation-email";
import {
  classifyClerkInvitationError,
  isInactiveClerkInvitationClassification,
  mapClerkInvitationError,
} from "@/server/team/clerk-invitation-errors";
import {
  persistReconciledStatus,
  reconcilePendingTeamInvitations,
} from "@/server/services/team-invitation-reconciliation";
import { decideReconciledInvitationStatus } from "@/server/team/reconcile-invitation-status";
import {
  assertQueuedGroupsInTenant,
  canSelectAdministratorsGroup,
  queuedGroupsIncludeAdministrators,
  uniqueGroupIds,
  type AssignableSecurityGroup,
} from "@/server/team/queued-groups";
import { PERMISSIONS } from "@/types/permissions";
import { TEAM_INVITATION_EXPIRES_IN_DAYS, TEAM_INVITATION_STATUSES } from "@/types/team";

export type TeamEmployee = {
  id: string;
  displayName: string | null;
  email: string | null;
  avatarUrl: string | null;
  groups: Array<{ id: string; name: string; systemKey: string | null }>;
};

export type TeamInvitationListItem = {
  id: string;
  email: string;
  status: string;
  firstAdminIntent: boolean;
  createdAt: Date;
  expiresAt: Date | null;
  invitedByDisplayName: string | null;
  invitedByEmail: string | null;
  groups: Array<{ id: string; name: string }>;
};

type TeamDb = PrismaClient;

function trustedInvitationRedirectUrl(): string {
  try {
    return employeeInvitationRedirectUrl(readApplicationOrigin());
  } catch {
    throw new TeamManagementError(
      "CLERK_INVITATION_FAILED",
      "This application is missing a valid APP_URL, so invitations cannot be sent.",
    );
  }
}

function expireIfNeeded<T extends { status: string; expiresAt: Date | null }>(invitation: T): T {
  if (
    invitation.status === TEAM_INVITATION_STATUSES.PENDING &&
    invitation.expiresAt &&
    invitation.expiresAt.getTime() < Date.now()
  ) {
    return { ...invitation, status: TEAM_INVITATION_STATUSES.EXPIRED };
  }
  return invitation;
}

async function requireInviterIsAdministrator(
  ctx: RequestContext,
  database: TeamDb,
): Promise<boolean> {
  const membership = await database.securityGroupMember.findFirst({
    where: {
      organizationId: ctx.organizationId,
      userProfileId: ctx.userId,
      securityGroup: {
        organizationId: ctx.organizationId,
        systemKey: SYSTEM_GROUP_KEYS.ADMINISTRATORS,
      },
    },
    select: { id: true },
  });
  return Boolean(membership);
}

async function loadAssignableGroups(
  database: TeamDb,
  organizationId: string,
  groupIds: readonly string[],
): Promise<AssignableSecurityGroup[]> {
  const ids = uniqueGroupIds(groupIds);
  if (ids.length === 0) {
    return [];
  }

  return database.securityGroup.findMany({
    where: { organizationId, id: { in: ids } },
    select: { id: true, organizationId: true, systemKey: true },
  });
}

async function assertNotExistingMember(
  ctx: RequestContext,
  directory: OrganizationDirectory,
  emailNormalized: string,
): Promise<void> {
  if (await isCurrentOrganizationMember(ctx, directory, emailNormalized)) {
    throw new TeamManagementError("ALREADY_ORGANIZATION_MEMBER");
  }
}

async function assertNoPendingInvitation(
  database: TeamDb,
  organizationId: string,
  emailNormalized: string,
): Promise<void> {
  const existing = await database.teamInvitation.findFirst({
    where: {
      organizationId,
      emailNormalized,
      status: TEAM_INVITATION_STATUSES.PENDING,
    },
    select: { id: true, expiresAt: true, status: true },
  });

  if (!existing) {
    return;
  }

  const current = expireIfNeeded(existing);
  if (current.status === TEAM_INVITATION_STATUSES.PENDING) {
    throw new TeamManagementError("INVITATION_ALREADY_PENDING");
  }

  if (current.status === TEAM_INVITATION_STATUSES.EXPIRED) {
    await database.teamInvitation.update({
      where: { id: existing.id },
      data: { status: TEAM_INVITATION_STATUSES.EXPIRED },
    });
  }
}

async function persistInvitation(
  database: TeamDb,
  input: {
    organizationId: string;
    clerkOrganizationInvitationId: string;
    email: string;
    emailNormalized: string;
    invitedByUserProfileId: string | null;
    firstAdminIntent: boolean;
    expiresAt: Date | null;
    securityGroupIds: readonly string[];
  },
) {
  try {
    return await database.$transaction(async (tx) => {
      const invitation = await tx.teamInvitation.create({
        data: {
          organizationId: input.organizationId,
          clerkOrganizationInvitationId: input.clerkOrganizationInvitationId,
          email: input.email,
          emailNormalized: input.emailNormalized,
          invitedByUserProfileId: input.invitedByUserProfileId,
          status: TEAM_INVITATION_STATUSES.PENDING,
          firstAdminIntent: input.firstAdminIntent,
          expiresAt: input.expiresAt,
        },
      });

      if (input.securityGroupIds.length > 0) {
        await tx.teamInvitationSecurityGroup.createMany({
          data: uniqueGroupIds(input.securityGroupIds).map((securityGroupId) => ({
            organizationId: input.organizationId,
            teamInvitationId: invitation.id,
            securityGroupId,
          })),
        });
      }

      return invitation;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new TeamManagementError("INVITATION_ALREADY_PENDING");
    }
    throw error;
  }
}

export async function listTeamEmployees(
  ctx: RequestContext,
  database: TeamDb,
): Promise<TeamEmployee[]> {
  await requirePermission(ctx, PERMISSIONS.USERS_VIEW, database);

  const profiles = await database.userProfile.findMany({
    where: { organizationId: ctx.organizationId },
    orderBy: [{ displayName: "asc" }, { email: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      displayName: true,
      firstName: true,
      lastName: true,
      email: true,
      avatarUrl: true,
      securityGroupMembers: {
        where: { organizationId: ctx.organizationId },
        select: {
          securityGroup: {
            select: { id: true, name: true, systemKey: true, organizationId: true },
          },
        },
      },
    },
  });

  return profiles.map((profile) => {
    const displayName =
      profile.displayName?.trim() ||
      [profile.firstName, profile.lastName].filter(Boolean).join(" ").trim() ||
      null;

    return {
      id: profile.id,
      displayName,
      email: profile.email,
      avatarUrl: profile.avatarUrl,
      groups: profile.securityGroupMembers
        .filter((row) => row.securityGroup.organizationId === ctx.organizationId)
        .map((row) => ({
          id: row.securityGroup.id,
          name: row.securityGroup.name,
          systemKey: row.securityGroup.systemKey,
        })),
    };
  });
}

export type RevokeTeamInvitationResult =
  | { outcome: "revoked" }
  | { outcome: "reconciled"; status: string };

export type SendNewTeamInvitationResult = {
  outcome: "replaced";
  invitationId: string;
};

export async function listTeamInvitations(
  ctx: RequestContext,
  database: TeamDb,
  directory: OrganizationDirectory,
): Promise<TeamInvitationListItem[]> {
  await requirePermission(ctx, PERMISSIONS.USERS_VIEW, database);
  await reconcilePendingTeamInvitations(ctx, database, directory, PERMISSIONS.USERS_VIEW);

  const invitations = await database.teamInvitation.findMany({
    where: { organizationId: ctx.organizationId, status: TEAM_INVITATION_STATUSES.PENDING },
    orderBy: { createdAt: "desc" },
    include: {
      invitedBy: {
        select: { displayName: true, firstName: true, lastName: true, email: true },
      },
      queuedGroups: {
        include: {
          securityGroup: { select: { id: true, name: true, organizationId: true } },
        },
      },
    },
  });

  const expiredIds: string[] = [];
  const items = invitations.map((invitation) => {
    const current = expireIfNeeded(invitation);
    if (current.status === TEAM_INVITATION_STATUSES.EXPIRED && invitation.status === TEAM_INVITATION_STATUSES.PENDING) {
      expiredIds.push(invitation.id);
    }

    const invitedByDisplayName =
      invitation.invitedBy?.displayName?.trim() ||
      [invitation.invitedBy?.firstName, invitation.invitedBy?.lastName].filter(Boolean).join(" ").trim() ||
      null;

    return {
      id: invitation.id,
      email: invitation.email,
      status: current.status,
      firstAdminIntent: invitation.firstAdminIntent,
      createdAt: invitation.createdAt,
      expiresAt: invitation.expiresAt,
      invitedByDisplayName,
      invitedByEmail: invitation.invitedBy?.email ?? null,
      groups: invitation.queuedGroups
        .filter((row) => row.securityGroup.organizationId === ctx.organizationId)
        .map((row) => ({ id: row.securityGroup.id, name: row.securityGroup.name })),
    };
  });

  if (expiredIds.length > 0) {
    await database.teamInvitation.updateMany({
      where: {
        organizationId: ctx.organizationId,
        id: { in: expiredIds },
        status: TEAM_INVITATION_STATUSES.PENDING,
      },
      data: { status: TEAM_INVITATION_STATUSES.EXPIRED },
    });
  }

  return items.filter((item) => item.status === TEAM_INVITATION_STATUSES.PENDING);
}

export async function listAssignableInviteGroups(
  ctx: RequestContext,
  database: TeamDb,
): Promise<Array<{ id: string; name: string; systemKey: string | null; description: string | null }>> {
  await requirePermission(ctx, PERMISSIONS.USERS_MANAGE, database);
  const inviterIsAdmin = await requireInviterIsAdministrator(ctx, database);

  const groups = await database.securityGroup.findMany({
    where: { organizationId: ctx.organizationId },
    orderBy: { name: "asc" },
    select: { id: true, name: true, systemKey: true, description: true },
  });

  if (inviterIsAdmin) {
    return groups;
  }

  return groups.filter((group) => group.systemKey !== SYSTEM_GROUP_KEYS.ADMINISTRATORS);
}

export async function inviteEmployee(
  ctx: RequestContext,
  database: TeamDb,
  directory: OrganizationDirectory,
  input: {
    email: string;
    securityGroupIds?: readonly string[];
    firstAdminIntent?: boolean;
  },
) {
  await requirePermission(ctx, PERMISSIONS.USERS_MANAGE, database);

  if (!isValidInvitationEmail(input.email)) {
    throw new TeamManagementError("INVALID_INVITATION_EMAIL");
  }

  const email = input.email.trim();
  const emailNormalized = normalizeInvitationEmail(input.email);
  const requestedIds = uniqueGroupIds(input.securityGroupIds ?? []);
  const groups = await loadAssignableGroups(database, ctx.organizationId, requestedIds);

  try {
    assertQueuedGroupsInTenant(groups, ctx.organizationId, requestedIds);
  } catch {
    throw new TeamManagementError("QUEUED_GROUP_NOT_IN_TENANT");
  }

  const inviterIsAdmin = await requireInviterIsAdministrator(ctx, database);
  if (
    queuedGroupsIncludeAdministrators(groups) &&
    !canSelectAdministratorsGroup({ inviterIsMagicCrmAdministrator: inviterIsAdmin })
  ) {
    throw new TeamManagementError("ADMINISTRATORS_ASSIGNMENT_FORBIDDEN");
  }

  await assertNoPendingInvitation(database, ctx.organizationId, emailNormalized);
  await assertNotExistingMember(ctx, directory, emailNormalized);

  let clerkInvitation;
  try {
    clerkInvitation = await directory.createInvitation({
      clerkOrganizationId: ctx.clerkOrganizationId,
      emailAddress: emailNormalized,
      expiresInDays: TEAM_INVITATION_EXPIRES_IN_DAYS,
      inviterClerkUserId: ctx.clerkUserId,
      redirectUrl: trustedInvitationRedirectUrl(),
    });
  } catch (error) {
    throw mapClerkInvitationError(error);
  }

  try {
    const invitation = await persistInvitation(database, {
      organizationId: ctx.organizationId,
      clerkOrganizationInvitationId: clerkInvitation.id,
      email,
      emailNormalized,
      invitedByUserProfileId: ctx.userId,
      firstAdminIntent: input.firstAdminIntent === true,
      expiresAt: clerkInvitation.expiresAt,
      securityGroupIds: requestedIds,
    });

    await recordSecurityAudit(database, ctx, {
      action: "employee.invited",
      resourceType: "team_invitation",
      resourceId: invitation.id,
      metadata: {
        emailNormalized,
        groupCount: requestedIds.length,
        firstAdminIntent: input.firstAdminIntent === true,
      },
    });

    return invitation;
  } catch (error) {
    try {
      await directory.revokeInvitation({
        clerkOrganizationId: ctx.clerkOrganizationId,
        invitationId: clerkInvitation.id,
        requestingClerkUserId: ctx.clerkUserId,
      });
    } catch {
      logTenantEvent("tenant_mapping_failure", {
        clerkOrganizationId: ctx.clerkOrganizationId,
        outcome: "invitation_compensate_revoke_failed",
      });
    }
    throw error;
  }
}

export async function getTeamInvitationInTenant(
  ctx: RequestContext,
  database: TeamDb,
  invitationId: string,
) {
  return database.teamInvitation.findFirst({
    where: { id: invitationId, organizationId: ctx.organizationId },
    include: {
      queuedGroups: { select: { securityGroupId: true } },
    },
  });
}

async function isCurrentOrganizationMember(
  ctx: RequestContext,
  directory: OrganizationDirectory,
  emailNormalized: string,
): Promise<boolean> {
  const memberships = await directory.findMembershipsByEmail({
    clerkOrganizationId: ctx.clerkOrganizationId,
    emailAddress: emailNormalized,
  });
  return memberships.length > 0;
}

async function reconcileInvitationAgainstClerk(
  ctx: RequestContext,
  database: TeamDb,
  directory: OrganizationDirectory,
  invitation: {
    id: string;
    clerkOrganizationInvitationId: string;
    emailNormalized: string;
    expiresAt: Date | null;
    status: string;
  },
): Promise<string> {
  if (invitation.status !== TEAM_INVITATION_STATUSES.PENDING) {
    return invitation.status;
  }

  let clerkInvitation = null;
  try {
    clerkInvitation = await directory.getInvitation({
      clerkOrganizationId: ctx.clerkOrganizationId,
      invitationId: invitation.clerkOrganizationInvitationId,
    });
  } catch (error) {
    const classified = classifyClerkInvitationError(error);
    logTenantEvent("team_invitation_clerk_failure", {
      clerkOrganizationId: ctx.clerkOrganizationId,
      operation: "reconcile_get",
      teamInvitationId: invitation.id,
      clerkInvitationId: invitation.clerkOrganizationInvitationId,
      outcome: classified.classification,
      clerkErrorCode: classified.clerkCodes[0],
      httpStatus: classified.httpStatus ?? undefined,
    });
    throw mapClerkInvitationError(error, "revoke");
  }

  const isMember =
    !clerkInvitation &&
    (await isCurrentOrganizationMember(ctx, directory, invitation.emailNormalized));

  const decision = decideReconciledInvitationStatus({
    clerkStatus: clerkInvitation?.status ?? null,
    clerkInvitationMissing: clerkInvitation === null,
    isCurrentOrgMember: isMember,
    expiresAt: clerkInvitation?.expiresAt ?? invitation.expiresAt,
  });

  if (!decision || decision.nextStatus === TEAM_INVITATION_STATUSES.PENDING) {
    return TEAM_INVITATION_STATUSES.PENDING;
  }

  const updated = await persistReconciledStatus(database, {
    organizationId: ctx.organizationId,
    invitationId: invitation.id,
    nextStatus: decision.nextStatus,
  });

  if (updated) {
    await recordSecurityAudit(database, ctx, {
      action: "employee.invitation_reconciled",
      resourceType: "team_invitation",
      resourceId: invitation.id,
      metadata: {
        previousStatus: TEAM_INVITATION_STATUSES.PENDING,
        nextStatus: decision.nextStatus,
        reason: decision.reason,
      },
    });
    logTenantEvent("team_invitation_reconciled", {
      clerkOrganizationId: ctx.clerkOrganizationId,
      operation: "reconcile",
      teamInvitationId: invitation.id,
      clerkInvitationId: invitation.clerkOrganizationInvitationId,
      outcome: decision.reason,
    });
  }

  return decision.nextStatus;
}

export async function revokeTeamInvitation(
  ctx: RequestContext,
  database: TeamDb,
  directory: OrganizationDirectory,
  invitationId: string,
): Promise<RevokeTeamInvitationResult> {
  await requirePermission(ctx, PERMISSIONS.USERS_MANAGE, database);
  await reconcilePendingTeamInvitations(ctx, database, directory, PERMISSIONS.USERS_MANAGE);

  const invitation = await getTeamInvitationInTenant(ctx, database, invitationId);
  if (!invitation) {
    throw new AuthorizationError("FORBIDDEN");
  }

  const current = expireIfNeeded(invitation);
  if (current.status !== TEAM_INVITATION_STATUSES.PENDING) {
    return { outcome: "reconciled", status: current.status };
  }

  try {
    await directory.revokeInvitation({
      clerkOrganizationId: ctx.clerkOrganizationId,
      invitationId: invitation.clerkOrganizationInvitationId,
      requestingClerkUserId: ctx.clerkUserId,
    });
  } catch (error) {
    const classified = classifyClerkInvitationError(error);
    logTenantEvent("team_invitation_clerk_failure", {
      clerkOrganizationId: ctx.clerkOrganizationId,
      operation: "revoke",
      teamInvitationId: invitation.id,
      clerkInvitationId: invitation.clerkOrganizationInvitationId,
      outcome: classified.classification,
      clerkErrorCode: classified.clerkCodes[0],
      httpStatus: classified.httpStatus ?? undefined,
    });

    if (isInactiveClerkInvitationClassification(classified.classification)) {
      const nextStatus = await reconcileInvitationAgainstClerk(ctx, database, directory, invitation);
      if (nextStatus !== TEAM_INVITATION_STATUSES.PENDING) {
        return { outcome: "reconciled", status: nextStatus };
      }
    }

    throw mapClerkInvitationError(error, "revoke");
  }

  await database.teamInvitation.update({
    where: { id: invitation.id },
    data: {
      status: TEAM_INVITATION_STATUSES.REVOKED,
      revokedAt: new Date(),
    },
  });

  await recordSecurityAudit(database, ctx, {
    action: "employee.invitation_revoked",
    resourceType: "team_invitation",
    resourceId: invitation.id,
    metadata: { emailNormalized: invitation.emailNormalized },
  });

  return { outcome: "revoked" };
}

export async function sendNewTeamInvitation(
  ctx: RequestContext,
  database: TeamDb,
  directory: OrganizationDirectory,
  invitationId: string,
): Promise<SendNewTeamInvitationResult> {
  await requirePermission(ctx, PERMISSIONS.USERS_MANAGE, database);
  await reconcilePendingTeamInvitations(ctx, database, directory, PERMISSIONS.USERS_MANAGE);

  const invitation = await getTeamInvitationInTenant(ctx, database, invitationId);
  if (!invitation) {
    throw new AuthorizationError("FORBIDDEN");
  }

  if (await isCurrentOrganizationMember(ctx, directory, invitation.emailNormalized)) {
    throw new TeamManagementError("ALREADY_ORGANIZATION_MEMBER");
  }

  const current = expireIfNeeded(invitation);
  if (current.status === TEAM_INVITATION_STATUSES.PENDING) {
    const revoked = await revokeTeamInvitation(ctx, database, directory, invitation.id);
    if (revoked.outcome === "reconciled" && revoked.status === TEAM_INVITATION_STATUSES.ACCEPTED) {
      if (await isCurrentOrganizationMember(ctx, directory, invitation.emailNormalized)) {
        throw new TeamManagementError("ALREADY_ORGANIZATION_MEMBER");
      }
    }
  }

  const replacement = await inviteEmployee(ctx, database, directory, {
    email: invitation.email,
    securityGroupIds: invitation.queuedGroups.map((row) => row.securityGroupId),
    firstAdminIntent: invitation.firstAdminIntent,
  });

  await recordSecurityAudit(database, ctx, {
    action: "employee.invitation_replaced",
    resourceType: "team_invitation",
    resourceId: replacement.id,
    metadata: {
      previousInvitationId: invitation.id,
      emailNormalized: invitation.emailNormalized,
    },
  });

  return { outcome: "replaced", invitationId: replacement.id };
}

export async function getTeamEmployeeDetail(
  ctx: RequestContext,
  database: TeamDb,
  userProfileId: string,
) {
  await requirePermission(ctx, PERMISSIONS.USERS_VIEW, database);

  const profile = await database.userProfile.findFirst({
    where: { id: userProfileId, organizationId: ctx.organizationId },
    select: {
      id: true,
      displayName: true,
      firstName: true,
      lastName: true,
      email: true,
      avatarUrl: true,
      securityGroupMembers: {
        where: { organizationId: ctx.organizationId },
        select: {
          securityGroup: {
            select: { id: true, name: true, systemKey: true, description: true, organizationId: true },
          },
        },
      },
    },
  });

  if (!profile) {
    return null;
  }

  const allGroups = await database.securityGroup.findMany({
    where: { organizationId: ctx.organizationId },
    orderBy: { name: "asc" },
    select: { id: true, name: true, systemKey: true, description: true },
  });

  const assigned = profile.securityGroupMembers
    .filter((row) => row.securityGroup.organizationId === ctx.organizationId)
    .map((row) => row.securityGroup);

  return {
    id: profile.id,
    displayName:
      profile.displayName?.trim() ||
      [profile.firstName, profile.lastName].filter(Boolean).join(" ").trim() ||
      null,
    email: profile.email,
    avatarUrl: profile.avatarUrl,
    assignedGroups: assigned,
    availableGroups: allGroups.filter((group) => !assigned.some((row) => row.id === group.id)),
  };
}

export async function createPlatformTeamInvitation(input: {
  database: TeamDb;
  directory: OrganizationDirectory;
  organizationId: string;
  clerkOrganizationId: string;
  email: string;
  securityGroupIds: readonly string[];
  firstAdminIntent: boolean;
}) {
  if (!isValidInvitationEmail(input.email)) {
    throw new TeamManagementError("INVALID_INVITATION_EMAIL");
  }

  const email = input.email.trim();
  const emailNormalized = normalizeInvitationEmail(input.email);

  await assertNoPendingInvitation(input.database, input.organizationId, emailNormalized);

  const localMember = await input.database.userProfile.findFirst({
    where: {
      organizationId: input.organizationId,
      email: { equals: emailNormalized, mode: "insensitive" },
    },
    select: { email: true },
  });
  if (localMember && emailsMatchNormalized(localMember.email, emailNormalized)) {
    throw new TeamManagementError("ALREADY_ORGANIZATION_MEMBER");
  }

  let clerkInvitation;
  try {
    clerkInvitation = await input.directory.createInvitation({
      clerkOrganizationId: input.clerkOrganizationId,
      emailAddress: emailNormalized,
      expiresInDays: TEAM_INVITATION_EXPIRES_IN_DAYS,
      redirectUrl: trustedInvitationRedirectUrl(),
    });
  } catch (error) {
    throw mapClerkInvitationError(error);
  }

  try {
    const invitation = await persistInvitation(input.database, {
      organizationId: input.organizationId,
      clerkOrganizationInvitationId: clerkInvitation.id,
      email,
      emailNormalized,
      invitedByUserProfileId: null,
      firstAdminIntent: input.firstAdminIntent,
      expiresAt: clerkInvitation.expiresAt,
      securityGroupIds: input.securityGroupIds,
    });

    await recordAuditEvent(input.database, {
      organizationId: input.organizationId,
      action: "employee.invited",
      resourceType: "team_invitation",
      resourceId: invitation.id,
      metadata: {
        emailNormalized,
        groupCount: input.securityGroupIds.length,
        firstAdminIntent: input.firstAdminIntent,
        source: "platform",
      },
    });

    return invitation;
  } catch (error) {
    try {
      await input.directory.revokeInvitation({
        clerkOrganizationId: input.clerkOrganizationId,
        invitationId: clerkInvitation.id,
      });
    } catch {
      logTenantEvent("tenant_mapping_failure", {
        clerkOrganizationId: input.clerkOrganizationId,
        outcome: "invitation_compensate_revoke_failed",
      });
    }
    throw error;
  }
}
