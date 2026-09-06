import type { PrismaClient } from "@/generated/prisma/client";
import type {
  OrganizationDirectory,
  OrganizationInvitationRecord,
} from "@/lib/auth/organization-directory";
import { logTenantEvent } from "@/server/logging";
import { requirePermission } from "@/server/policies/require-permission";
import type { RequestContext } from "@/server/request-context";
import { recordSecurityAudit } from "@/server/services/audit";
import { classifyClerkInvitationError } from "@/server/team/clerk-invitation-errors";
import {
  decideReconciledInvitationStatus,
  type InvitationReconciliationReason,
} from "@/server/team/reconcile-invitation-status";
import { PERMISSIONS } from "@/types/permissions";
import { TEAM_INVITATION_STATUSES, type TeamInvitationStatus } from "@/types/team";

type TeamDb = PrismaClient;

export type ReconciledInvitationChange = {
  invitationId: string;
  previousStatus: string;
  nextStatus: TeamInvitationStatus;
  reason: InvitationReconciliationReason;
};

export async function reconcilePendingTeamInvitations(
  ctx: RequestContext,
  database: TeamDb,
  directory: OrganizationDirectory,
  permission: typeof PERMISSIONS.USERS_VIEW | typeof PERMISSIONS.USERS_MANAGE = PERMISSIONS.USERS_VIEW,
): Promise<ReconciledInvitationChange[]> {
  await requirePermission(ctx, permission, database);

  const pending = await database.teamInvitation.findMany({
    where: {
      organizationId: ctx.organizationId,
      status: TEAM_INVITATION_STATUSES.PENDING,
    },
    select: {
      id: true,
      clerkOrganizationInvitationId: true,
      emailNormalized: true,
      status: true,
      expiresAt: true,
    },
  });

  if (pending.length === 0) {
    return [];
  }

  let clerkById = new Map<string, OrganizationInvitationRecord>();
  try {
    const listed = await directory.listInvitations({
      clerkOrganizationId: ctx.clerkOrganizationId,
    });
    clerkById = new Map(listed.map((invitation) => [invitation.id, invitation]));
  } catch (error) {
    const classified = classifyClerkInvitationError(error);
    logTenantEvent("team_invitation_clerk_failure", {
      clerkOrganizationId: ctx.clerkOrganizationId,
      operation: "reconcile_list",
      outcome: classified.classification,
      clerkErrorCode: classified.clerkCodes[0],
      httpStatus: classified.httpStatus ?? undefined,
    });
    return [];
  }

  const changes: ReconciledInvitationChange[] = [];

  for (const invitation of pending) {
    let clerkInvitation = clerkById.get(invitation.clerkOrganizationInvitationId) ?? null;
    if (!clerkInvitation) {
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
        continue;
      }
    }

    let isCurrentOrgMember = false;
    if (!clerkInvitation) {
      const memberships = await directory.findMembershipsByEmail({
        clerkOrganizationId: ctx.clerkOrganizationId,
        emailAddress: invitation.emailNormalized,
      });
      isCurrentOrgMember = memberships.length > 0;
    }

    const decision = decideReconciledInvitationStatus({
      clerkStatus: clerkInvitation?.status ?? null,
      clerkInvitationMissing: clerkInvitation === null,
      isCurrentOrgMember,
      expiresAt: clerkInvitation?.expiresAt ?? invitation.expiresAt,
    });

    if (!decision || decision.nextStatus === TEAM_INVITATION_STATUSES.PENDING) {
      continue;
    }

    const updated = await persistReconciledStatus(database, {
      organizationId: ctx.organizationId,
      invitationId: invitation.id,
      nextStatus: decision.nextStatus,
    });

    if (!updated) {
      continue;
    }

    changes.push({
      invitationId: invitation.id,
      previousStatus: TEAM_INVITATION_STATUSES.PENDING,
      nextStatus: decision.nextStatus,
      reason: decision.reason,
    });

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

  return changes;
}

export async function persistReconciledStatus(
  database: TeamDb,
  input: {
    organizationId: string;
    invitationId: string;
    nextStatus: TeamInvitationStatus;
  },
): Promise<boolean> {
  return database.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<Array<{ id: string; status: string }>>`
      SELECT id, status
      FROM team_invitations
      WHERE id = ${input.invitationId} AND "organizationId" = ${input.organizationId}
      FOR UPDATE
    `;

    const row = locked[0];
    if (!row || row.status !== TEAM_INVITATION_STATUSES.PENDING) {
      return false;
    }

    await tx.teamInvitation.update({
      where: { id: input.invitationId },
      data: {
        status: input.nextStatus,
        revokedAt: input.nextStatus === TEAM_INVITATION_STATUSES.REVOKED ? new Date() : undefined,
      },
    });

    return true;
  });
}
