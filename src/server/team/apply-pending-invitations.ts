import type { PrismaClient } from "@/generated/prisma/client";
import { SYSTEM_GROUP_KEYS } from "@/server/authorization/default-security-groups";
import { logTenantEvent } from "@/server/logging";
import { recordAuditEvent } from "@/server/services/audit";
import { normalizeInvitationEmail } from "@/server/team/invitation-email";
import { nextOnboardingStatus, parseOnboardingStatus } from "@/server/team/onboarding-status";
import { uniqueGroupIds } from "@/server/team/queued-groups";
import { TEAM_INVITATION_STATUSES } from "@/types/team";

export type ApplyPendingInvitationsInput = {
  organizationId: string;
  userProfileId: string;
  verifiedEmails: readonly string[];
};

export async function applyPendingTeamInvitations(
  database: PrismaClient,
  input: ApplyPendingInvitationsInput,
): Promise<{ appliedInvitationIds: string[] }> {
  const emails = [
    ...new Set(
      input.verifiedEmails
        .map((email) => normalizeInvitationEmail(email))
        .filter((email) => email.length > 0),
    ),
  ];

  if (emails.length === 0) {
    return { appliedInvitationIds: [] };
  }

  const candidates = await database.teamInvitation.findMany({
    where: {
      organizationId: input.organizationId,
      emailNormalized: { in: emails },
      OR: [
        { status: TEAM_INVITATION_STATUSES.PENDING },
        { status: TEAM_INVITATION_STATUSES.ACCEPTED, acceptedAt: null },
      ],
    },
    include: {
      queuedGroups: { select: { securityGroupId: true } },
    },
  });

  const now = Date.now();
  const appliedInvitationIds: string[] = [];

  for (const invitation of candidates) {
    if (invitation.expiresAt && invitation.expiresAt.getTime() < now) {
      await database.teamInvitation.updateMany({
        where: {
          id: invitation.id,
          organizationId: input.organizationId,
          status: TEAM_INVITATION_STATUSES.PENDING,
        },
        data: { status: TEAM_INVITATION_STATUSES.EXPIRED },
      });
      continue;
    }

    const applied = await database.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<
        Array<{ id: string; status: string; firstAdminIntent: boolean; acceptedAt: Date | null }>
      >`
        SELECT id, status, "firstAdminIntent", "acceptedAt"
        FROM team_invitations
        WHERE id = ${invitation.id} AND "organizationId" = ${input.organizationId}
        FOR UPDATE
      `;

      const row = locked[0];
      const awaitingProvision =
        row?.status === TEAM_INVITATION_STATUSES.PENDING ||
        (row?.status === TEAM_INVITATION_STATUSES.ACCEPTED && row.acceptedAt === null);
      if (!row || !awaitingProvision) {
        return false;
      }

      let groupIds = uniqueGroupIds(invitation.queuedGroups.map((item) => item.securityGroupId));

      if (row.firstAdminIntent) {
        const administrators = await tx.securityGroup.findFirst({
          where: {
            organizationId: input.organizationId,
            systemKey: SYSTEM_GROUP_KEYS.ADMINISTRATORS,
          },
          select: { id: true },
        });
        if (administrators) {
          groupIds = uniqueGroupIds([...groupIds, administrators.id]);
        }
      }

      const tenantGroups = groupIds.length
        ? await tx.securityGroup.findMany({
            where: { organizationId: input.organizationId, id: { in: groupIds } },
            select: { id: true },
          })
        : [];

      if (tenantGroups.length > 0) {
        await tx.securityGroupMember.createMany({
          data: tenantGroups.map((group) => ({
            organizationId: input.organizationId,
            securityGroupId: group.id,
            userProfileId: input.userProfileId,
          })),
          skipDuplicates: true,
        });
      }

      await tx.teamInvitation.update({
        where: { id: invitation.id },
        data: {
          status: TEAM_INVITATION_STATUSES.ACCEPTED,
          acceptedAt: new Date(),
        },
      });

      if (row.firstAdminIntent) {
        const organization = await tx.organization.findFirst({
          where: { id: input.organizationId },
          select: { onboardingStatus: true },
        });
        if (organization) {
          await tx.organization.update({
            where: { id: input.organizationId },
            data: {
              onboardingStatus: nextOnboardingStatus(
                parseOnboardingStatus(organization.onboardingStatus),
                "admin_accepted",
              ),
            },
          });
        }
      }

      return true;
    });

    if (!applied) {
      continue;
    }

    appliedInvitationIds.push(invitation.id);

    await recordAuditEvent(database, {
      organizationId: input.organizationId,
      actorUserProfileId: input.userProfileId,
      action: "employee.invitation_accepted",
      resourceType: "team_invitation",
      resourceId: invitation.id,
    });

    const assignedGroupIds = uniqueGroupIds(invitation.queuedGroups.map((item) => item.securityGroupId));
    if (invitation.firstAdminIntent || assignedGroupIds.length > 0) {
      await recordAuditEvent(database, {
        organizationId: input.organizationId,
        actorUserProfileId: input.userProfileId,
        action: "employee.group_assigned",
        resourceType: "user_profile",
        resourceId: input.userProfileId,
        metadata: {
          invitationId: invitation.id,
          groupCount: assignedGroupIds.length,
          firstAdminIntent: invitation.firstAdminIntent,
        },
      });
    }

    logTenantEvent("team_invitation_applied", {
      outcome: invitation.firstAdminIntent ? "first_admin" : "employee",
    });
  }

  return { appliedInvitationIds };
}
