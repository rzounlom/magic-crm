import { describe, expect, it } from "vitest";

import { CLERK_ORGANIZATION_INVITATION_STATUSES } from "@/lib/auth/organization-directory";
import { decideReconciledInvitationStatus } from "@/server/team/reconcile-invitation-status";
import { TEAM_INVITATION_STATUSES } from "@/types/team";

describe("decideReconciledInvitationStatus", () => {
  it("keeps Clerk pending invitations pending", () => {
    expect(
      decideReconciledInvitationStatus({
        clerkStatus: CLERK_ORGANIZATION_INVITATION_STATUSES.PENDING,
        clerkInvitationMissing: false,
        isCurrentOrgMember: false,
        expiresAt: new Date(Date.now() + 60_000),
      }),
    ).toEqual({ nextStatus: TEAM_INVITATION_STATUSES.PENDING, reason: "clerk_pending" });
  });

  it("maps accepted, revoked, and expired Clerk statuses without granting groups", () => {
    expect(
      decideReconciledInvitationStatus({
        clerkStatus: CLERK_ORGANIZATION_INVITATION_STATUSES.ACCEPTED,
        clerkInvitationMissing: false,
        isCurrentOrgMember: false,
        expiresAt: null,
      }),
    ).toEqual({ nextStatus: TEAM_INVITATION_STATUSES.ACCEPTED, reason: "clerk_accepted" });

    expect(
      decideReconciledInvitationStatus({
        clerkStatus: CLERK_ORGANIZATION_INVITATION_STATUSES.REVOKED,
        clerkInvitationMissing: false,
        isCurrentOrgMember: false,
        expiresAt: null,
      }),
    ).toEqual({ nextStatus: TEAM_INVITATION_STATUSES.REVOKED, reason: "clerk_revoked" });

    expect(
      decideReconciledInvitationStatus({
        clerkStatus: CLERK_ORGANIZATION_INVITATION_STATUSES.EXPIRED,
        clerkInvitationMissing: false,
        isCurrentOrgMember: false,
        expiresAt: null,
      }),
    ).toEqual({ nextStatus: TEAM_INVITATION_STATUSES.EXPIRED, reason: "clerk_expired" });
  });

  it("treats a missing Clerk invitation as accepted only when the email is a current-org member", () => {
    expect(
      decideReconciledInvitationStatus({
        clerkStatus: null,
        clerkInvitationMissing: true,
        isCurrentOrgMember: true,
        expiresAt: null,
      }),
    ).toEqual({ nextStatus: TEAM_INVITATION_STATUSES.ACCEPTED, reason: "clerk_missing_member" });

    expect(
      decideReconciledInvitationStatus({
        clerkStatus: null,
        clerkInvitationMissing: true,
        isCurrentOrgMember: false,
        expiresAt: null,
      }),
    ).toEqual({ nextStatus: TEAM_INVITATION_STATUSES.EXPIRED, reason: "clerk_missing_inactive" });
  });

  it("expires a still-pending Clerk invitation whose timestamp has passed", () => {
    expect(
      decideReconciledInvitationStatus({
        clerkStatus: CLERK_ORGANIZATION_INVITATION_STATUSES.PENDING,
        clerkInvitationMissing: false,
        isCurrentOrgMember: false,
        expiresAt: new Date(Date.now() - 1_000),
      }),
    ).toEqual({ nextStatus: TEAM_INVITATION_STATUSES.EXPIRED, reason: "local_expired" });
  });
});
