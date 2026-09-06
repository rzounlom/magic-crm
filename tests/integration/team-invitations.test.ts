import { afterAll, afterEach, describe, expect, it } from "vitest";

import { Prisma } from "@/generated/prisma/client";
import { SYSTEM_GROUP_KEYS } from "@/server/authorization/default-security-groups";
import { AuthorizationError, TeamManagementError } from "@/server/errors";
import { resolveRequestContext } from "@/server/request-context";
import { createClientTenant } from "@/server/services/create-client-tenant";
import {
  provisionOrganization,
  slugifyOrganizationName,
} from "@/server/services/provision-organization";
import { CLERK_ORGANIZATION_INVITATION_STATUSES } from "@/lib/auth/organization-directory";
import {
  inviteEmployee,
  listTeamInvitations,
  revokeTeamInvitation,
  sendNewTeamInvitation,
} from "@/server/services/team-invitation-service";
import { reconcilePendingTeamInvitations } from "@/server/services/team-invitation-reconciliation";
import { applyPendingTeamInvitations } from "@/server/team/apply-pending-invitations";
import { ONBOARDING_STATUSES, TEAM_INVITATION_STATUSES } from "@/types/team";
import { deleteTestOrganizations } from "../helpers/cleanup-test-organizations";
import {
  addFakeMembership,
  createFakeOrganizationDirectory,
} from "../helpers/fake-organization-directory";
import { createTestPrismaClient } from "../helpers/test-database";

const db = createTestPrismaClient();
const createdOrganizationIds: string[] = [];

async function cleanup() {
  await deleteTestOrganizations(db, createdOrganizationIds);
  createdOrganizationIds.length = 0;
}

afterEach(cleanup);
afterAll(async () => {
  await db.$disconnect();
});

async function provisionAdmin(suffix: string) {
  const result = await provisionOrganization(
    {
      clerkUserId: `user_${suffix}_${crypto.randomUUID()}`,
      clerkOrganizationId: `clerk_org_${suffix}_${crypto.randomUUID()}`,
      organizationName: `Team ${suffix}`,
      organizationSlug: `team-${suffix}-${crypto.randomUUID()}`,
      isClerkOrganizationAdmin: true,
    },
    db,
  );
  createdOrganizationIds.push(result.organizationId);
  const organization = await db.organization.findFirstOrThrow({
    where: { id: result.organizationId },
  });
  const profile = await db.userProfile.findFirstOrThrow({ where: { id: result.userProfileId } });
  const ctx = await resolveRequestContext(
    {
      clerkUserId: profile.clerkUserId,
      clerkOrganizationId: organization.clerkOrganizationId,
    },
    db,
  );
  return { ...result, ctx, clerkOrganizationId: organization.clerkOrganizationId! };
}

async function groupId(organizationId: string, systemKey: string) {
  const group = await db.securityGroup.findFirstOrThrow({
    where: { organizationId, systemKey },
    select: { id: true },
  });
  return group.id;
}

describe("team invitations (postgres)", () => {
  it("passes a trusted APP_URL redirect to Clerk and keeps org:member invitations", async () => {
    const previous = process.env.APP_URL;
    process.env.APP_URL = "https://crm.example.com";
    try {
      const a = await provisionAdmin("redirect");
      const directory = createFakeOrganizationDirectory();
      const frontDesk = await groupId(a.organizationId, SYSTEM_GROUP_KEYS.FRONT_DESK);
      await inviteEmployee(a.ctx, db, directory, {
        email: "redirect@example.com",
        securityGroupIds: [frontDesk],
      });
      expect(directory.createdInvitations[0]?.redirectUrl).toBe(
        "https://crm.example.com/accept-invitation",
      );
      expect(directory.createdInvitations[0]?.clerkOrganizationId).toBe(a.clerkOrganizationId);
    } finally {
      if (previous === undefined) {
        delete process.env.APP_URL;
      } else {
        process.env.APP_URL = previous;
      }
    }
  });
  it("does not let org A invite using org B security groups or org B clerk id", async () => {
    const a = await provisionAdmin("a");
    const b = await provisionAdmin("b");
    const directory = createFakeOrganizationDirectory();
    const frontDeskB = await groupId(b.organizationId, SYSTEM_GROUP_KEYS.FRONT_DESK);

    await expect(
      inviteEmployee(a.ctx, db, directory, {
        email: "desk@example.com",
        securityGroupIds: [frontDeskB],
      }),
    ).rejects.toMatchObject({ code: "QUEUED_GROUP_NOT_IN_TENANT" });

    expect(directory.createdInvitations).toHaveLength(0);

    const frontDeskA = await groupId(a.organizationId, SYSTEM_GROUP_KEYS.FRONT_DESK);
    await inviteEmployee(a.ctx, db, directory, {
      email: "desk@example.com",
      securityGroupIds: [frontDeskA],
    });
    expect(directory.createdInvitations[0]?.clerkOrganizationId).toBe(a.clerkOrganizationId);
    expect(directory.createdInvitations[0]?.clerkOrganizationId).not.toBe(b.clerkOrganizationId);
  });

  it("blocks a known invitation id from another tenant", async () => {
    const a = await provisionAdmin("a");
    const b = await provisionAdmin("b");
    const directory = createFakeOrganizationDirectory();
    const invitation = await inviteEmployee(a.ctx, db, directory, {
      email: "cross@example.com",
    });

    await expect(revokeTeamInvitation(b.ctx, db, directory, invitation.id)).rejects.toBeInstanceOf(
      AuthorizationError,
    );
    const stillPending = await db.teamInvitation.findFirstOrThrow({ where: { id: invitation.id } });
    expect(stillPending.status).toBe(TEAM_INVITATION_STATUSES.PENDING);
  });

  it("rejects a second pending invitation for the same email in one organization", async () => {
    const a = await provisionAdmin("a");
    const directory = createFakeOrganizationDirectory();
    await inviteEmployee(a.ctx, db, directory, { email: "Alex@Example.com" });
    await expect(
      inviteEmployee(a.ctx, db, directory, { email: "alex@example.com" }),
    ).rejects.toMatchObject({ code: "INVITATION_ALREADY_PENDING" });
    expect(directory.createdInvitations).toHaveLength(1);
  });

  it("does not invite an existing member of this organization, without leaking other tenants", async () => {
    const a = await provisionAdmin("a");
    const b = await provisionAdmin("b");
    const directory = createFakeOrganizationDirectory();
    addFakeMembership(directory, a.clerkOrganizationId, "member@example.com");

    await expect(
      inviteEmployee(a.ctx, db, directory, { email: "member@example.com" }),
    ).rejects.toMatchObject({ code: "ALREADY_ORGANIZATION_MEMBER" });

    await inviteEmployee(b.ctx, db, directory, { email: "member@example.com" });
    expect(directory.createdInvitations).toHaveLength(1);
    expect(directory.createdInvitations[0]?.clerkOrganizationId).toBe(b.clerkOrganizationId);
  });

  it("keeps queued groups until first provisioning and applies them exactly once", async () => {
    const a = await provisionAdmin("a");
    const directory = createFakeOrganizationDirectory();
    const frontDesk = await groupId(a.organizationId, SYSTEM_GROUP_KEYS.FRONT_DESK);
    const invitation = await inviteEmployee(a.ctx, db, directory, {
      email: "frontdesk@example.com",
      securityGroupIds: [frontDesk],
    });

    const queued = await db.teamInvitationSecurityGroup.findMany({
      where: { teamInvitationId: invitation.id, organizationId: a.organizationId },
    });
    expect(queued).toHaveLength(1);
    expect(queued[0]?.securityGroupId).toBe(frontDesk);

    const invitee = await provisionOrganization(
      {
        clerkUserId: `invitee_${crypto.randomUUID()}`,
        clerkOrganizationId: a.clerkOrganizationId,
        organizationName: "Team reuse",
        isClerkOrganizationAdmin: false,
      },
      db,
    );

    const [first, second] = await Promise.all([
      applyPendingTeamInvitations(db, {
        organizationId: a.organizationId,
        userProfileId: invitee.userProfileId,
        verifiedEmails: ["frontdesk@example.com"],
      }),
      applyPendingTeamInvitations(db, {
        organizationId: a.organizationId,
        userProfileId: invitee.userProfileId,
        verifiedEmails: ["frontdesk@example.com"],
      }),
    ]);

    expect([...first.appliedInvitationIds, ...second.appliedInvitationIds]).toEqual([invitation.id]);

    const memberships = await db.securityGroupMember.findMany({
      where: {
        organizationId: a.organizationId,
        userProfileId: invitee.userProfileId,
        securityGroupId: frontDesk,
      },
    });
    expect(memberships).toHaveLength(1);

    const accepted = await db.teamInvitation.findFirstOrThrow({ where: { id: invitation.id } });
    expect(accepted.status).toBe(TEAM_INVITATION_STATUSES.ACCEPTED);

    const audits = await db.auditLog.findMany({
      where: { organizationId: a.organizationId, action: "employee.invitation_accepted" },
    });
    expect(audits.length).toBeGreaterThanOrEqual(1);
  });

  it("does not grant Administrators on a normal employee invite", async () => {
    const a = await provisionAdmin("a");
    const directory = createFakeOrganizationDirectory();
    const frontDesk = await groupId(a.organizationId, SYSTEM_GROUP_KEYS.FRONT_DESK);
    await inviteEmployee(a.ctx, db, directory, {
      email: "staff@example.com",
      securityGroupIds: [frontDesk],
    });

    const invitee = await provisionOrganization(
      {
        clerkUserId: `staff_${crypto.randomUUID()}`,
        clerkOrganizationId: a.clerkOrganizationId,
        organizationName: "Team reuse",
        isClerkOrganizationAdmin: false,
      },
      db,
    );
    await applyPendingTeamInvitations(db, {
      organizationId: a.organizationId,
      userProfileId: invitee.userProfileId,
      verifiedEmails: ["staff@example.com"],
    });

    const administrators = await groupId(a.organizationId, SYSTEM_GROUP_KEYS.ADMINISTRATORS);
    const adminMembership = await db.securityGroupMember.findFirst({
      where: {
        organizationId: a.organizationId,
        userProfileId: invitee.userProfileId,
        securityGroupId: administrators,
      },
    });
    expect(adminMembership).toBeNull();
  });

  it("rejects Administrators queueing by a non-administrator", async () => {
    const a = await provisionAdmin("a");
    const directory = createFakeOrganizationDirectory();
    const frontDesk = await groupId(a.organizationId, SYSTEM_GROUP_KEYS.FRONT_DESK);
    const administrators = await groupId(a.organizationId, SYSTEM_GROUP_KEYS.ADMINISTRATORS);

    const deskProfile = await db.userProfile.create({
      data: {
        organizationId: a.organizationId,
        clerkUserId: `desk_${crypto.randomUUID()}`,
        defaultLocationId: a.locationId,
        email: "desk-admin-attempt@example.com",
      },
    });
    await db.securityGroupMember.create({
      data: {
        organizationId: a.organizationId,
        securityGroupId: frontDesk,
        userProfileId: deskProfile.id,
      },
    });
    const deskCtx = await resolveRequestContext(
      {
        clerkUserId: deskProfile.clerkUserId,
        clerkOrganizationId: a.clerkOrganizationId,
      },
      db,
    );

    await expect(
      inviteEmployee(deskCtx, db, directory, {
        email: "new-admin@example.com",
        securityGroupIds: [administrators],
      }),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("writes invitation and revoke audit rows", async () => {
    const a = await provisionAdmin("a");
    const directory = createFakeOrganizationDirectory();
    const invitation = await inviteEmployee(a.ctx, db, directory, { email: "audit@example.com" });
    await revokeTeamInvitation(a.ctx, db, directory, invitation.id);

    const actions = await db.auditLog.findMany({
      where: { organizationId: a.organizationId, resourceId: invitation.id },
      select: { action: true },
    });
    expect(actions.map((row) => row.action)).toEqual(
      expect.arrayContaining(["employee.invited", "employee.invitation_revoked"]),
    );
    expect(directory.revokedInvitationIds).toContain(directory.createdInvitations[0]?.id);
  });

  it("rejects cross-tenant queued group rows at the database", async () => {
    const a = await provisionAdmin("a");
    const b = await provisionAdmin("b");
    const directory = createFakeOrganizationDirectory();
    const invitation = await inviteEmployee(a.ctx, db, directory, { email: "fk@example.com" });
    const frontDeskB = await groupId(b.organizationId, SYSTEM_GROUP_KEYS.FRONT_DESK);

    await expect(
      db.teamInvitationSecurityGroup.create({
        data: {
          organizationId: a.organizationId,
          teamInvitationId: invitation.id,
          securityGroupId: frontDeskB,
        },
      }),
    ).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
  });

  it("reconciles Clerk-accepted pending rows without applying queued groups", async () => {
    const a = await provisionAdmin("recon-accepted");
    const directory = createFakeOrganizationDirectory();
    const frontDesk = await groupId(a.organizationId, SYSTEM_GROUP_KEYS.FRONT_DESK);
    const invitation = await inviteEmployee(a.ctx, db, directory, {
      email: "stale-accepted@example.com",
      securityGroupIds: [frontDesk],
    });
    directory.setInvitationStatus(
      directory.createdInvitations[0]!.id,
      CLERK_ORGANIZATION_INVITATION_STATUSES.ACCEPTED,
    );

    const first = await reconcilePendingTeamInvitations(a.ctx, db, directory);
    const second = await reconcilePendingTeamInvitations(a.ctx, db, directory);
    expect(first).toEqual([
      expect.objectContaining({
        invitationId: invitation.id,
        previousStatus: TEAM_INVITATION_STATUSES.PENDING,
        nextStatus: TEAM_INVITATION_STATUSES.ACCEPTED,
      }),
    ]);
    expect(second).toEqual([]);

    const row = await db.teamInvitation.findFirstOrThrow({ where: { id: invitation.id } });
    expect(row.status).toBe(TEAM_INVITATION_STATUSES.ACCEPTED);
    expect(row.acceptedAt).toBeNull();

    const memberships = await db.securityGroupMember.findMany({
      where: { organizationId: a.organizationId, securityGroupId: frontDesk },
    });
    expect(memberships.filter((item) => item.userProfileId !== a.userProfileId)).toHaveLength(0);

    const listed = await listTeamInvitations(a.ctx, db, directory);
    expect(listed.map((item) => item.id)).not.toContain(invitation.id);

    const audits = await db.auditLog.findMany({
      where: { organizationId: a.organizationId, action: "employee.invitation_reconciled" },
    });
    expect(audits).toHaveLength(1);
  });

  it("reconciles revoked, expired, and missing Clerk invitations", async () => {
    const a = await provisionAdmin("recon-states");
    const directory = createFakeOrganizationDirectory();
    const revoked = await inviteEmployee(a.ctx, db, directory, { email: "revoked@example.com" });
    const expired = await inviteEmployee(a.ctx, db, directory, { email: "expired@example.com" });
    const missing = await inviteEmployee(a.ctx, db, directory, { email: "missing@example.com" });
    directory.setInvitationStatus(
      directory.createdInvitations[0]!.id,
      CLERK_ORGANIZATION_INVITATION_STATUSES.REVOKED,
    );
    directory.setInvitationStatus(
      directory.createdInvitations[1]!.id,
      CLERK_ORGANIZATION_INVITATION_STATUSES.EXPIRED,
    );
    directory.removeInvitation(directory.createdInvitations[2]!.id);

    await reconcilePendingTeamInvitations(a.ctx, db, directory);

    expect((await db.teamInvitation.findFirstOrThrow({ where: { id: revoked.id } })).status).toBe(
      TEAM_INVITATION_STATUSES.REVOKED,
    );
    expect((await db.teamInvitation.findFirstOrThrow({ where: { id: expired.id } })).status).toBe(
      TEAM_INVITATION_STATUSES.EXPIRED,
    );
    expect((await db.teamInvitation.findFirstOrThrow({ where: { id: missing.id } })).status).toBe(
      TEAM_INVITATION_STATUSES.EXPIRED,
    );
  });

  it("does not let tenant A reconcile tenant B invitations", async () => {
    const a = await provisionAdmin("recon-a");
    const b = await provisionAdmin("recon-b");
    const directory = createFakeOrganizationDirectory();
    const invitation = await inviteEmployee(b.ctx, db, directory, { email: "keep@example.com" });
    directory.setInvitationStatus(
      directory.createdInvitations[0]!.id,
      CLERK_ORGANIZATION_INVITATION_STATUSES.ACCEPTED,
    );

    await reconcilePendingTeamInvitations(a.ctx, db, directory);
    const row = await db.teamInvitation.findFirstOrThrow({ where: { id: invitation.id } });
    expect(row.status).toBe(TEAM_INVITATION_STATUSES.PENDING);
    expect(row.organizationId).toBe(b.organizationId);
  });

  it("revokes a genuine pending invitation and heals a stale accepted one", async () => {
    const a = await provisionAdmin("revoke");
    const directory = createFakeOrganizationDirectory();
    const pending = await inviteEmployee(a.ctx, db, directory, { email: "live-revoke@example.com" });
    const stale = await inviteEmployee(a.ctx, db, directory, { email: "stale-revoke@example.com" });
    directory.setInvitationStatus(
      directory.createdInvitations[1]!.id,
      CLERK_ORGANIZATION_INVITATION_STATUSES.ACCEPTED,
    );

    expect(await revokeTeamInvitation(a.ctx, db, directory, pending.id)).toEqual({ outcome: "revoked" });
    expect(await revokeTeamInvitation(a.ctx, db, directory, stale.id)).toEqual({
      outcome: "reconciled",
      status: TEAM_INVITATION_STATUSES.ACCEPTED,
    });

    expect((await db.teamInvitation.findFirstOrThrow({ where: { id: pending.id } })).status).toBe(
      TEAM_INVITATION_STATUSES.REVOKED,
    );
    expect((await db.teamInvitation.findFirstOrThrow({ where: { id: stale.id } })).status).toBe(
      TEAM_INVITATION_STATUSES.ACCEPTED,
    );
    expect(
      await db.securityGroupMember.count({
        where: { organizationId: a.organizationId, userProfileId: { not: a.userProfileId } },
      }),
    ).toBe(0);
  });

  it("reconciles already-revoked and missing Clerk invitations during revoke", async () => {
    const a = await provisionAdmin("revoke-inactive");
    const directory = createFakeOrganizationDirectory();
    const revoked = await inviteEmployee(a.ctx, db, directory, { email: "already-revoked@example.com" });
    const missing = await inviteEmployee(a.ctx, db, directory, { email: "already-missing@example.com" });
    directory.setInvitationStatus(
      directory.createdInvitations[0]!.id,
      CLERK_ORGANIZATION_INVITATION_STATUSES.REVOKED,
    );
    directory.removeInvitation(directory.createdInvitations[1]!.id);

    expect(await revokeTeamInvitation(a.ctx, db, directory, revoked.id)).toMatchObject({
      outcome: "reconciled",
      status: TEAM_INVITATION_STATUSES.REVOKED,
    });
    expect(await revokeTeamInvitation(a.ctx, db, directory, missing.id)).toMatchObject({
      outcome: "reconciled",
      status: TEAM_INVITATION_STATUSES.EXPIRED,
    });
  });

  it("returns an operation-specific error for a true Clerk revoke failure", async () => {
    const a = await provisionAdmin("revoke-fail");
    const directory = createFakeOrganizationDirectory();
    const invitation = await inviteEmployee(a.ctx, db, directory, { email: "fail-revoke@example.com" });
    directory.failNextRevokeInvitation = {
      status: 418,
      errors: [{ code: "weird_clerk", message: "boom" }],
    };

    await expect(revokeTeamInvitation(a.ctx, db, directory, invitation.id)).rejects.toMatchObject({
      code: "CLERK_REVOKE_FAILED",
    });
    expect((await db.teamInvitation.findFirstOrThrow({ where: { id: invitation.id } })).status).toBe(
      TEAM_INVITATION_STATUSES.PENDING,
    );
  });

  it("requires users.manage to revoke and blocks cross-tenant send-new", async () => {
    const a = await provisionAdmin("perm-a");
    const b = await provisionAdmin("perm-b");
    const directory = createFakeOrganizationDirectory();
    const invitation = await inviteEmployee(a.ctx, db, directory, { email: "perm@example.com" });
    const frontDesk = await groupId(a.organizationId, SYSTEM_GROUP_KEYS.FRONT_DESK);

    const deskProfile = await db.userProfile.create({
      data: {
        organizationId: a.organizationId,
        clerkUserId: `desk_${crypto.randomUUID()}`,
        defaultLocationId: a.locationId,
        email: "desk-revoke@example.com",
      },
    });
    await db.securityGroupMember.create({
      data: {
        organizationId: a.organizationId,
        securityGroupId: frontDesk,
        userProfileId: deskProfile.id,
      },
    });
    const deskCtx = await resolveRequestContext(
      {
        clerkUserId: deskProfile.clerkUserId,
        clerkOrganizationId: a.clerkOrganizationId,
      },
      db,
    );

    await expect(revokeTeamInvitation(deskCtx, db, directory, invitation.id)).rejects.toBeInstanceOf(
      AuthorizationError,
    );
    await expect(sendNewTeamInvitation(b.ctx, db, directory, invitation.id)).rejects.toBeInstanceOf(
      AuthorizationError,
    );
  });

  it("replaces a pending invitation and preserves queued groups plus APP_URL redirect", async () => {
    const previous = process.env.APP_URL;
    process.env.APP_URL = "https://crm.example.com";
    try {
      const a = await provisionAdmin("replace");
      const directory = createFakeOrganizationDirectory();
      const frontDesk = await groupId(a.organizationId, SYSTEM_GROUP_KEYS.FRONT_DESK);
      const invitation = await inviteEmployee(a.ctx, db, directory, {
        email: "replace@example.com",
        securityGroupIds: [frontDesk],
      });

      const result = await sendNewTeamInvitation(a.ctx, db, directory, invitation.id);
      const old = await db.teamInvitation.findFirstOrThrow({ where: { id: invitation.id } });
      const created = await db.teamInvitation.findFirstOrThrow({ where: { id: result.invitationId } });
      expect(old.status).toBe(TEAM_INVITATION_STATUSES.REVOKED);
      expect(created.status).toBe(TEAM_INVITATION_STATUSES.PENDING);
      expect(created.emailNormalized).toBe("replace@example.com");
      expect(directory.createdInvitations).toHaveLength(2);
      expect(directory.createdInvitations[1]?.redirectUrl).toBe(
        "https://crm.example.com/accept-invitation",
      );

      const queued = await db.teamInvitationSecurityGroup.findMany({
        where: { teamInvitationId: created.id, organizationId: a.organizationId },
      });
      expect(queued.map((row) => row.securityGroupId)).toEqual([frontDesk]);

      const pending = await db.teamInvitation.count({
        where: {
          organizationId: a.organizationId,
          emailNormalized: "replace@example.com",
          status: TEAM_INVITATION_STATUSES.PENDING,
        },
      });
      expect(pending).toBe(1);
    } finally {
      if (previous === undefined) {
        delete process.env.APP_URL;
      } else {
        process.env.APP_URL = previous;
      }
    }
  });

  it("allows send-new after Clerk already revoked or deleted the old invitation", async () => {
    const a = await provisionAdmin("replace-stale");
    const directory = createFakeOrganizationDirectory();
    const revoked = await inviteEmployee(a.ctx, db, directory, { email: "old-revoked@example.com" });
    const missing = await inviteEmployee(a.ctx, db, directory, { email: "old-missing@example.com" });
    directory.setInvitationStatus(
      directory.createdInvitations[0]!.id,
      CLERK_ORGANIZATION_INVITATION_STATUSES.REVOKED,
    );
    directory.removeInvitation(directory.createdInvitations[1]!.id);

    const replacedRevoked = await sendNewTeamInvitation(a.ctx, db, directory, revoked.id);
    const replacedMissing = await sendNewTeamInvitation(a.ctx, db, directory, missing.id);
    expect(replacedRevoked.invitationId).not.toBe(revoked.id);
    expect(replacedMissing.invitationId).not.toBe(missing.id);
    expect(
      await db.teamInvitation.count({
        where: { organizationId: a.organizationId, status: TEAM_INVITATION_STATUSES.PENDING },
      }),
    ).toBe(2);
  });

  it("does not send a replacement when the email is still a current-org member", async () => {
    const a = await provisionAdmin("replace-member");
    const directory = createFakeOrganizationDirectory();
    const invitation = await inviteEmployee(a.ctx, db, directory, { email: "member-now@example.com" });
    directory.setInvitationStatus(
      directory.createdInvitations[0]!.id,
      CLERK_ORGANIZATION_INVITATION_STATUSES.ACCEPTED,
    );
    addFakeMembership(directory, a.clerkOrganizationId, "member-now@example.com");

    await expect(sendNewTeamInvitation(a.ctx, db, directory, invitation.id)).rejects.toMatchObject({
      code: "ALREADY_ORGANIZATION_MEMBER",
    });
    expect(directory.createdInvitations).toHaveLength(1);
  });

  it("cannot create two active local pending invitations via concurrent send-new", async () => {
    const a = await provisionAdmin("replace-race");
    const directory = createFakeOrganizationDirectory();
    const invitation = await inviteEmployee(a.ctx, db, directory, { email: "race@example.com" });

    const results = await Promise.allSettled([
      sendNewTeamInvitation(a.ctx, db, directory, invitation.id),
      sendNewTeamInvitation(a.ctx, db, directory, invitation.id),
    ]);

    expect(results.filter((row) => row.status === "fulfilled")).toHaveLength(1);
    expect(
      await db.teamInvitation.count({
        where: {
          organizationId: a.organizationId,
          emailNormalized: "race@example.com",
          status: TEAM_INVITATION_STATUSES.PENDING,
        },
      }),
    ).toBe(1);
  });

  it("still applies queued groups once after reconciliation marked Clerk-accepted", async () => {
    const a = await provisionAdmin("accept-after-recon");
    const directory = createFakeOrganizationDirectory();
    const frontDesk = await groupId(a.organizationId, SYSTEM_GROUP_KEYS.FRONT_DESK);
    const invitation = await inviteEmployee(a.ctx, db, directory, {
      email: "later-app@example.com",
      securityGroupIds: [frontDesk],
    });
    directory.setInvitationStatus(
      directory.createdInvitations[0]!.id,
      CLERK_ORGANIZATION_INVITATION_STATUSES.ACCEPTED,
    );
    await reconcilePendingTeamInvitations(a.ctx, db, directory);

    const invitee = await provisionOrganization(
      {
        clerkUserId: `later_${crypto.randomUUID()}`,
        clerkOrganizationId: a.clerkOrganizationId,
        organizationName: "Team reuse",
        isClerkOrganizationAdmin: false,
      },
      db,
    );
    const applied = await applyPendingTeamInvitations(db, {
      organizationId: a.organizationId,
      userProfileId: invitee.userProfileId,
      verifiedEmails: ["later-app@example.com"],
    });
    expect(applied.appliedInvitationIds).toEqual([invitation.id]);
    expect(
      await db.securityGroupMember.count({
        where: {
          organizationId: a.organizationId,
          userProfileId: invitee.userProfileId,
          securityGroupId: frontDesk,
        },
      }),
    ).toBe(1);
    expect((await db.teamInvitation.findFirstOrThrow({ where: { id: invitation.id } })).acceptedAt).not.toBeNull();
  });
});

describe("createClientTenant (postgres)", () => {
  it("queues Administrators for the first client admin and is retry-safe", async () => {
    const directory = createFakeOrganizationDirectory();
    const name = `Client ${crypto.randomUUID()}`;
    const first = await createClientTenant(db, directory, {
      organizationName: name,
      adminEmail: "owner@example.com",
      timezone: "UTC",
      currency: "USD",
    });
    createdOrganizationIds.push(first.organizationId);

    expect(first.onboardingStatus).toBe(ONBOARDING_STATUSES.AWAITING_ADMIN);
    expect(first.reused).toBe(false);
    expect(directory.createdInvitations).toHaveLength(1);

    const second = await createClientTenant(db, directory, {
      organizationName: name,
      adminEmail: "owner@example.com",
    });
    expect(second.organizationId).toBe(first.organizationId);
    expect(second.reused).toBe(true);
    expect(directory.createdInvitations).toHaveLength(1);

    const invitation = await db.teamInvitation.findFirstOrThrow({
      where: { id: first.invitationId! },
    });
    expect(invitation.firstAdminIntent).toBe(true);

    const invitee = await provisionOrganization(
      {
        clerkUserId: `owner_${crypto.randomUUID()}`,
        clerkOrganizationId: first.clerkOrganizationId,
        organizationName: name,
        isClerkOrganizationAdmin: false,
      },
      db,
    );
    await applyPendingTeamInvitations(db, {
      organizationId: first.organizationId,
      userProfileId: invitee.userProfileId,
      verifiedEmails: ["owner@example.com"],
    });

    const administrators = await groupId(first.organizationId, SYSTEM_GROUP_KEYS.ADMINISTRATORS);
    const membership = await db.securityGroupMember.findFirst({
      where: {
        organizationId: first.organizationId,
        userProfileId: invitee.userProfileId,
        securityGroupId: administrators,
      },
    });
    expect(membership).not.toBeNull();

    const organization = await db.organization.findFirstOrThrow({
      where: { id: first.organizationId },
    });
    expect(organization.onboardingStatus).toBe(ONBOARDING_STATUSES.ACTIVE);

    const audits = await db.auditLog.findMany({
      where: { organizationId: first.organizationId },
      select: { action: true },
    });
    expect(audits.map((row) => row.action)).toEqual(
      expect.arrayContaining([
        "tenant.client_created",
        "tenant.admin_invited",
        "employee.invited",
        "employee.invitation_accepted",
        "employee.group_assigned",
      ]),
    );
  });

  it("resumes after a failed invitation once Clerk org and DB tenant exist", async () => {
    const directory = createFakeOrganizationDirectory();
    const name = `Retry ${crypto.randomUUID()}`;
    directory.failNextCreateInvitation = {
      clerkError: true,
      status: 500,
      errors: [{ code: "internal_error", message: "boom" }],
    };

    await expect(
      createClientTenant(db, directory, {
        organizationName: name,
        adminEmail: "retry@example.com",
      }),
    ).rejects.toBeInstanceOf(TeamManagementError);

    const organization = await db.organization.findFirstOrThrow({
      where: { slug: slugifyOrganizationName(name) },
    });
    createdOrganizationIds.push(organization.id);
    expect(directory.organizations.size).toBe(1);

    const resumed = await createClientTenant(db, directory, {
      organizationName: name,
      adminEmail: "retry@example.com",
    });
    expect(resumed.organizationId).toBe(organization.id);
    expect(resumed.invitationId).toBeTruthy();
    expect(directory.createdInvitations).toHaveLength(1);
  });
});
