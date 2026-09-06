import {
  CLERK_ORGANIZATION_INVITATION_STATUSES,
  type ClerkOrganizationInvitationStatus,
} from "@/lib/auth/organization-directory";
import { TEAM_INVITATION_STATUSES, type TeamInvitationStatus } from "@/types/team";

export type InvitationReconciliationReason =
  | "clerk_pending"
  | "clerk_accepted"
  | "clerk_revoked"
  | "clerk_expired"
  | "clerk_missing_member"
  | "clerk_missing_inactive"
  | "local_expired";

export type InvitationReconciliationDecision = {
  nextStatus: TeamInvitationStatus;
  reason: InvitationReconciliationReason;
};

/**
 * Maps trusted Clerk invitation/membership facts onto a local TeamInvitation
 * workflow status. Never grants Security Groups.
 */
export function decideReconciledInvitationStatus(input: {
  clerkStatus: ClerkOrganizationInvitationStatus | null;
  clerkInvitationMissing: boolean;
  isCurrentOrgMember: boolean;
  expiresAt: Date | null;
  now?: Date;
}): InvitationReconciliationDecision | null {
  const now = input.now ?? new Date();

  if (!input.clerkInvitationMissing && input.clerkStatus) {
    if (input.clerkStatus === CLERK_ORGANIZATION_INVITATION_STATUSES.ACCEPTED) {
      return { nextStatus: TEAM_INVITATION_STATUSES.ACCEPTED, reason: "clerk_accepted" };
    }
    if (input.clerkStatus === CLERK_ORGANIZATION_INVITATION_STATUSES.REVOKED) {
      return { nextStatus: TEAM_INVITATION_STATUSES.REVOKED, reason: "clerk_revoked" };
    }
    if (input.clerkStatus === CLERK_ORGANIZATION_INVITATION_STATUSES.EXPIRED) {
      return { nextStatus: TEAM_INVITATION_STATUSES.EXPIRED, reason: "clerk_expired" };
    }
    if (input.clerkStatus === CLERK_ORGANIZATION_INVITATION_STATUSES.PENDING) {
      if (input.expiresAt && input.expiresAt.getTime() < now.getTime()) {
        return { nextStatus: TEAM_INVITATION_STATUSES.EXPIRED, reason: "local_expired" };
      }
      return { nextStatus: TEAM_INVITATION_STATUSES.PENDING, reason: "clerk_pending" };
    }
  }

  if (input.clerkInvitationMissing) {
    if (input.isCurrentOrgMember) {
      return { nextStatus: TEAM_INVITATION_STATUSES.ACCEPTED, reason: "clerk_missing_member" };
    }
    return { nextStatus: TEAM_INVITATION_STATUSES.EXPIRED, reason: "clerk_missing_inactive" };
  }

  if (input.expiresAt && input.expiresAt.getTime() < now.getTime()) {
    return { nextStatus: TEAM_INVITATION_STATUSES.EXPIRED, reason: "local_expired" };
  }

  return null;
}
