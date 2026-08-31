import { afterAll, afterEach, describe, expect, it } from "vitest";

import { formatUserDisplayLabel, type UserIdentitySnapshot } from "@/lib/identity/user-display";
import type { UserIdentityDirectory } from "@/lib/identity/user-identity-directory";
import { AuthorizationError } from "@/server/errors";
import { resolveRequestContext } from "@/server/request-context";
import { provisionOrganization } from "@/server/services/provision-organization";
import { refreshTenantEmployeeIdentities } from "@/server/services/refresh-tenant-employee-identities";
import { listOrganizationUserProfiles } from "@/server/services/security-group-service";
import {
  persistUserIdentitySnapshot,
  syncUserProfileIdentityIfMissing,
} from "@/server/services/sync-user-profile-identity";
import { createTestPrismaClient } from "../helpers/test-database";

const db = createTestPrismaClient();
const createdOrganizationIds: string[] = [];

async function cleanup() {
  if (createdOrganizationIds.length === 0) {
    return;
  }
  const ids = [...createdOrganizationIds];
  await db.auditLog.deleteMany({ where: { organizationId: { in: ids } } });
  await db.securityGroup.deleteMany({ where: { organizationId: { in: ids } } });
  await db.userProfile.deleteMany({ where: { organizationId: { in: ids } } });
  await db.location.deleteMany({ where: { organizationId: { in: ids } } });
  await db.auditLog.deleteMany({ where: { organizationId: { in: ids } } });
  await db.organization.deleteMany({ where: { id: { in: ids } } });
  createdOrganizationIds.length = 0;
}

afterEach(cleanup);
afterAll(async () => {
  await db.$disconnect();
});

const jane = {
  firstName: "Jane",
  lastName: "Smith",
  displayName: "Jane Smith",
  email: "jane@example.com",
  avatarUrl: "https://img.example/jane.png",
};

describe("user profile identity (postgres)", () => {
  it("persists identity fields from a trusted snapshot", async () => {
    const result = await provisionOrganization(
      {
        clerkUserId: `user_id_${crypto.randomUUID()}`,
        clerkOrganizationId: `clerk_org_id_${crypto.randomUUID()}`,
        organizationName: "Identity Org",
        organizationSlug: `identity-${crypto.randomUUID()}`,
        isClerkOrganizationAdmin: true,
        identity: jane,
      },
      db,
    );
    createdOrganizationIds.push(result.organizationId);

    const profile = await db.userProfile.findFirstOrThrow({
      where: { id: result.userProfileId },
    });
    expect(profile.displayName).toBe("Jane Smith");
    expect(profile.email).toBe("jane@example.com");
    expect(profile.firstName).toBe("Jane");
    expect(profile.lastName).toBe("Smith");
  });

  it("does not list another organization's employees", async () => {
    const a = await provisionOrganization(
      {
        clerkUserId: `user_a_${crypto.randomUUID()}`,
        clerkOrganizationId: `clerk_org_a_${crypto.randomUUID()}`,
        organizationName: "Org A",
        organizationSlug: `id-a-${crypto.randomUUID()}`,
        isClerkOrganizationAdmin: true,
        identity: jane,
      },
      db,
    );
    const b = await provisionOrganization(
      {
        clerkUserId: `user_b_${crypto.randomUUID()}`,
        clerkOrganizationId: `clerk_org_b_${crypto.randomUUID()}`,
        organizationName: "Org B",
        organizationSlug: `id-b-${crypto.randomUUID()}`,
        isClerkOrganizationAdmin: true,
        identity: {
          firstName: "Pat",
          lastName: "Lee",
          displayName: "Pat Lee",
          email: "pat@example.com",
          avatarUrl: null,
        },
      },
      db,
    );
    createdOrganizationIds.push(a.organizationId, b.organizationId);

    const ctxA = await resolveRequestContext(
      {
        clerkUserId: (await db.userProfile.findFirstOrThrow({ where: { id: a.userProfileId } }))
          .clerkUserId,
        clerkOrganizationId: (
          await db.organization.findFirstOrThrow({ where: { id: a.organizationId } })
        ).clerkOrganizationId,
      },
      db,
    );

    const listed = await listOrganizationUserProfiles(ctxA, db);
    expect(listed.map((row) => row.id)).toEqual([a.userProfileId]);
    expect(listed.some((row) => row.id === b.userProfileId)).toBe(false);
    expect(listed[0]?.email).toBe("jane@example.com");
  });

  it("allows the same Clerk email on UserProfiles in two organizations", async () => {
    const clerkUserId = `user_multi_${crypto.randomUUID()}`;
    const a = await provisionOrganization(
      {
        clerkUserId,
        clerkOrganizationId: `clerk_org_a_${crypto.randomUUID()}`,
        organizationName: "Org A",
        organizationSlug: `id-a-${crypto.randomUUID()}`,
        isClerkOrganizationAdmin: true,
        identity: jane,
      },
      db,
    );
    const b = await provisionOrganization(
      {
        clerkUserId,
        clerkOrganizationId: `clerk_org_b_${crypto.randomUUID()}`,
        organizationName: "Org B",
        organizationSlug: `id-b-${crypto.randomUUID()}`,
        isClerkOrganizationAdmin: true,
        identity: jane,
      },
      db,
    );
    createdOrganizationIds.push(a.organizationId, b.organizationId);

    const profiles = await db.userProfile.findMany({
      where: { clerkUserId },
    });
    expect(profiles).toHaveLength(2);
    expect(new Set(profiles.map((row) => row.organizationId)).size).toBe(2);
    expect(profiles.every((row) => row.email === "jane@example.com")).toBe(true);
  });

  it("updates all memberships for a Clerk user without changing group membership", async () => {
    const clerkUserId = `user_sync_${crypto.randomUUID()}`;
    const a = await provisionOrganization(
      {
        clerkUserId,
        clerkOrganizationId: `clerk_org_a_${crypto.randomUUID()}`,
        organizationName: "Org A",
        organizationSlug: `id-a-${crypto.randomUUID()}`,
        isClerkOrganizationAdmin: true,
      },
      db,
    );
    const b = await provisionOrganization(
      {
        clerkUserId,
        clerkOrganizationId: `clerk_org_b_${crypto.randomUUID()}`,
        organizationName: "Org B",
        organizationSlug: `id-b-${crypto.randomUUID()}`,
        isClerkOrganizationAdmin: true,
      },
      db,
    );
    createdOrganizationIds.push(a.organizationId, b.organizationId);

    const membersBefore = await db.securityGroupMember.count({
      where: { userProfileId: { in: [a.userProfileId, b.userProfileId] } },
    });

    await persistUserIdentitySnapshot(db, clerkUserId, jane);

    const membersAfter = await db.securityGroupMember.count({
      where: { userProfileId: { in: [a.userProfileId, b.userProfileId] } },
    });
    expect(membersAfter).toBe(membersBefore);

    const profiles = await db.userProfile.findMany({ where: { clerkUserId } });
    expect(profiles.every((row) => row.displayName === "Jane Smith")).toBe(true);
  });

  it("does not reload identity when display fields already exist", async () => {
    const clerkUserId = `user_skip_${crypto.randomUUID()}`;
    const result = await provisionOrganization(
      {
        clerkUserId,
        clerkOrganizationId: `clerk_org_skip_${crypto.randomUUID()}`,
        organizationName: "Identity Org",
        organizationSlug: `identity-skip-${crypto.randomUUID()}`,
        isClerkOrganizationAdmin: true,
        identity: jane,
      },
      db,
    );
    createdOrganizationIds.push(result.organizationId);

    let loaded = 0;
    const updated = await syncUserProfileIdentityIfMissing(db, clerkUserId, async () => {
      loaded += 1;
      return {
        firstName: "Other",
        lastName: "Name",
        displayName: "Other Name",
        email: "other@example.com",
        avatarUrl: null,
      };
    });

    expect(updated).toBe(0);
    expect(loaded).toBe(0);
    const profile = await db.userProfile.findFirstOrThrow({ where: { id: result.userProfileId } });
    expect(profile.email).toBe("jane@example.com");
  });
});

function createFakeIdentityDirectory(
  records: Record<string, UserIdentitySnapshot>,
): { directory: UserIdentityDirectory; requestedIds: string[] } {
  const requestedIds: string[] = [];
  return {
    requestedIds,
    directory: {
      async getIdentitiesByClerkUserIds(clerkUserIds) {
        requestedIds.push(...clerkUserIds);
        const identities = new Map<string, UserIdentitySnapshot>();
        for (const clerkUserId of clerkUserIds) {
          const snapshot = records[clerkUserId];
          if (snapshot) {
            identities.set(clerkUserId, snapshot);
          }
        }
        return identities;
      },
    },
  };
}

describe("tenant employee identity refresh (postgres)", () => {
  it("refreshes a tenant employee missing a display snapshot and shows email", async () => {
    const admin = await provisionOrganization(
      {
        clerkUserId: `user_admin_${crypto.randomUUID()}`,
        clerkOrganizationId: `clerk_org_${crypto.randomUUID()}`,
        organizationName: "Identity Refresh Org",
        organizationSlug: `id-refresh-${crypto.randomUUID()}`,
        isClerkOrganizationAdmin: true,
        identity: jane,
      },
      db,
    );
    createdOrganizationIds.push(admin.organizationId);

    const missingClerkUserId = `user_missing_${crypto.randomUUID()}`;
    const employee = await db.userProfile.create({
      data: {
        organizationId: admin.organizationId,
        clerkUserId: missingClerkUserId,
      },
    });

    const ctx = await resolveRequestContext(
      {
        clerkUserId: (await db.userProfile.findFirstOrThrow({ where: { id: admin.userProfileId } }))
          .clerkUserId,
        clerkOrganizationId: (
          await db.organization.findFirstOrThrow({ where: { id: admin.organizationId } })
        ).clerkOrganizationId,
      },
      db,
    );

    const membersBefore = await db.securityGroupMember.count({
      where: { organizationId: admin.organizationId },
    });
    const { directory, requestedIds } = createFakeIdentityDirectory({
      [missingClerkUserId]: {
        firstName: null,
        lastName: null,
        displayName: null,
        email: "alex@example.com",
        avatarUrl: null,
      },
    });

    const result = await refreshTenantEmployeeIdentities(ctx, db, directory);

    expect(requestedIds).toEqual([missingClerkUserId]);
    expect(result.refreshedCount).toBe(1);
    const refreshed = await db.userProfile.findFirstOrThrow({ where: { id: employee.id } });
    expect(refreshed.email).toBe("alex@example.com");
    expect(formatUserDisplayLabel(refreshed)).toBe("alex@example.com");
    const listed = await listOrganizationUserProfiles(ctx, db);
    expect(listed.find((row) => row.id === employee.id)?.email).toBe("alex@example.com");
    await expect(
      db.securityGroupMember.count({ where: { organizationId: admin.organizationId } }),
    ).resolves.toBe(membersBefore);
  });

  it("does not fetch or update a UserProfile from another organization", async () => {
    const a = await provisionOrganization(
      {
        clerkUserId: `user_a_${crypto.randomUUID()}`,
        clerkOrganizationId: `clerk_org_a_${crypto.randomUUID()}`,
        organizationName: "Org A",
        organizationSlug: `id-a-${crypto.randomUUID()}`,
        isClerkOrganizationAdmin: true,
        identity: jane,
      },
      db,
    );
    const b = await provisionOrganization(
      {
        clerkUserId: `user_b_${crypto.randomUUID()}`,
        clerkOrganizationId: `clerk_org_b_${crypto.randomUUID()}`,
        organizationName: "Org B",
        organizationSlug: `id-b-${crypto.randomUUID()}`,
        isClerkOrganizationAdmin: true,
        identity: jane,
      },
      db,
    );
    createdOrganizationIds.push(a.organizationId, b.organizationId);

    const otherClerkUserId = `user_other_${crypto.randomUUID()}`;
    const otherProfile = await db.userProfile.create({
      data: {
        organizationId: b.organizationId,
        clerkUserId: otherClerkUserId,
      },
    });

    const ctxA = await resolveRequestContext(
      {
        clerkUserId: (await db.userProfile.findFirstOrThrow({ where: { id: a.userProfileId } }))
          .clerkUserId,
        clerkOrganizationId: (
          await db.organization.findFirstOrThrow({ where: { id: a.organizationId } })
        ).clerkOrganizationId,
      },
      db,
    );

    const { directory, requestedIds } = createFakeIdentityDirectory({
      [otherClerkUserId]: {
        firstName: "Other",
        lastName: "Org",
        displayName: "Other Org",
        email: "other-org@example.com",
        avatarUrl: null,
      },
    });

    await refreshTenantEmployeeIdentities(ctxA, db, directory);

    expect(requestedIds).not.toContain(otherClerkUserId);
    const otherAfter = await db.userProfile.findFirstOrThrow({ where: { id: otherProfile.id } });
    expect(otherAfter.email).toBeNull();
    expect(otherAfter.displayName).toBeNull();
  });

  it("scopes snapshot writes to the current organization for a shared Clerk user", async () => {
    const clerkUserId = `user_shared_${crypto.randomUUID()}`;
    const a = await provisionOrganization(
      {
        clerkUserId,
        clerkOrganizationId: `clerk_org_a_${crypto.randomUUID()}`,
        organizationName: "Org A",
        organizationSlug: `id-a-${crypto.randomUUID()}`,
        isClerkOrganizationAdmin: true,
      },
      db,
    );
    const b = await provisionOrganization(
      {
        clerkUserId,
        clerkOrganizationId: `clerk_org_b_${crypto.randomUUID()}`,
        organizationName: "Org B",
        organizationSlug: `id-b-${crypto.randomUUID()}`,
        isClerkOrganizationAdmin: true,
      },
      db,
    );
    createdOrganizationIds.push(a.organizationId, b.organizationId);

    const ctxA = await resolveRequestContext(
      {
        clerkUserId,
        clerkOrganizationId: (
          await db.organization.findFirstOrThrow({ where: { id: a.organizationId } })
        ).clerkOrganizationId,
      },
      db,
    );

    const { directory } = createFakeIdentityDirectory({
      [clerkUserId]: jane,
    });
    await refreshTenantEmployeeIdentities(ctxA, db, directory);

    const profileA = await db.userProfile.findFirstOrThrow({
      where: { id: a.userProfileId },
    });
    const profileB = await db.userProfile.findFirstOrThrow({
      where: { id: b.userProfileId },
    });
    expect(profileA.email).toBe("jane@example.com");
    expect(profileB.email).toBeNull();
  });

  it("forbids identity refresh without users.manage or security_groups.manage", async () => {
    const admin = await provisionOrganization(
      {
        clerkUserId: `user_admin_${crypto.randomUUID()}`,
        clerkOrganizationId: `clerk_org_${crypto.randomUUID()}`,
        organizationName: "Identity Refresh Org",
        organizationSlug: `id-refresh-${crypto.randomUUID()}`,
        isClerkOrganizationAdmin: true,
        identity: jane,
      },
      db,
    );
    createdOrganizationIds.push(admin.organizationId);
    const employee = await db.userProfile.create({
      data: {
        organizationId: admin.organizationId,
        clerkUserId: `user_fd_${crypto.randomUUID()}`,
      },
    });
    const adminCtx = await resolveRequestContext(
      {
        clerkUserId: (await db.userProfile.findFirstOrThrow({ where: { id: admin.userProfileId } }))
          .clerkUserId,
        clerkOrganizationId: (
          await db.organization.findFirstOrThrow({ where: { id: admin.organizationId } })
        ).clerkOrganizationId,
      },
      db,
    );
    const employeeCtx = {
      ...adminCtx,
      userId: employee.id,
      clerkUserId: employee.clerkUserId,
    };

    await expect(
      refreshTenantEmployeeIdentities(employeeCtx, db, createFakeIdentityDirectory({}).directory),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });
});
