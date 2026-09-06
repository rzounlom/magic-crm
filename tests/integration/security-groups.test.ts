import { afterAll, afterEach, describe, expect, it } from "vitest";

import { Prisma } from "@/generated/prisma/client";
import { SYSTEM_GROUP_KEYS } from "@/server/authorization/default-security-groups";
import { AuthorizationError } from "@/server/errors";
import { hasPermission, requirePermission } from "@/server/policies/require-permission";
import { resolveRequestContext } from "@/server/request-context";
import { provisionOrganization } from "@/server/services/provision-organization";
import {
  addSecurityGroupMember,
  createSecurityGroup,
  deleteSecurityGroup,
  getSecurityGroupDetail,
  removeSecurityGroupMember,
  setSecurityGroupPermissions,
} from "@/server/services/security-group-service";
import { DEFAULT_SECURITY_GROUPS } from "@/server/authorization/default-security-groups";
import { PERMISSIONS } from "@/types/permissions";
import { createTestPrismaClient } from "../helpers/test-database";
import { deleteTestOrganizations } from "../helpers/cleanup-test-organizations";

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

async function provisionAdmin(suffix: string, options?: { isClerkOrganizationAdmin?: boolean }) {
  const result = await provisionOrganization(
    {
      clerkUserId: `user_${suffix}_${crypto.randomUUID()}`,
      clerkOrganizationId: `clerk_org_${suffix}_${crypto.randomUUID()}`,
      organizationName: `Authz ${suffix}`,
      organizationSlug: `authz-${suffix}-${crypto.randomUUID()}`,
      isClerkOrganizationAdmin: options?.isClerkOrganizationAdmin ?? true,
    },
    db,
  );
  createdOrganizationIds.push(result.organizationId);
  const ctx = await resolveRequestContext(
    {
      clerkUserId: (
        await db.userProfile.findFirstOrThrow({ where: { id: result.userProfileId } })
      ).clerkUserId,
      clerkOrganizationId: (
        await db.organization.findFirstOrThrow({ where: { id: result.organizationId } })
      ).clerkOrganizationId,
    },
    db,
  );
  return { ...result, ctx };
}

describe("security groups (postgres)", () => {
  it("isolates groups across organizations", async () => {
    const a = await provisionAdmin("a");
    const b = await provisionAdmin("b");
    const groupB = await db.securityGroup.findFirstOrThrow({
      where: { organizationId: b.organizationId, systemKey: SYSTEM_GROUP_KEYS.FRONT_DESK },
    });

    await expect(db.securityGroup.findFirst({
      where: { id: groupB.id, organizationId: a.organizationId },
    })).resolves.toBeNull();
  });

  it("rejects cross-tenant group membership at the database", async () => {
    const a = await provisionAdmin("a");
    const b = await provisionAdmin("b");
    const groupA = await db.securityGroup.findFirstOrThrow({
      where: { organizationId: a.organizationId, systemKey: SYSTEM_GROUP_KEYS.FRONT_DESK },
    });

    await expect(
      db.securityGroupMember.create({
        data: {
          organizationId: a.organizationId,
          securityGroupId: groupA.id,
          userProfileId: b.userProfileId,
        },
      }),
    ).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
  });

  it("allows the same group name in two organizations and rejects duplicates inside one", async () => {
    const a = await provisionAdmin("a");
    const b = await provisionAdmin("b");

    await createSecurityGroup(a.ctx, db, { name: "Seasonal Staff" });
    await createSecurityGroup(b.ctx, db, { name: "Seasonal Staff" });
    await expect(createSecurityGroup(a.ctx, db, { name: "Seasonal Staff" })).rejects.toMatchObject({
      code: "DUPLICATE_GROUP_NAME",
    });
  });

  it("rejects duplicate permission assignment on one group", async () => {
    const a = await provisionAdmin("a");
    const group = await db.securityGroup.findFirstOrThrow({
      where: { organizationId: a.organizationId, systemKey: SYSTEM_GROUP_KEYS.FRONT_DESK },
    });
    const permission = await db.securityGroupPermission.findFirstOrThrow({
      where: { securityGroupId: group.id },
    });

    await expect(
      db.securityGroupPermission.create({
        data: {
          organizationId: a.organizationId,
          securityGroupId: group.id,
          permissionDefinitionId: permission.permissionDefinitionId,
        },
      }),
    ).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
  });

  it("creates each default group once and stays idempotent under concurrency", async () => {
    const input = {
      clerkUserId: `user_conc_${crypto.randomUUID()}`,
      clerkOrganizationId: `clerk_org_conc_${crypto.randomUUID()}`,
      organizationName: "Concurrent Authz",
      organizationSlug: `authz-conc-${crypto.randomUUID()}`,
      isClerkOrganizationAdmin: true,
    };

    const [first, second] = await Promise.all([
      provisionOrganization(input, db),
      provisionOrganization(input, db),
    ]);
    createdOrganizationIds.push(first.organizationId, second.organizationId);

    expect(first.organizationId).toBe(second.organizationId);
    const groups = await db.securityGroup.findMany({
      where: { organizationId: first.organizationId },
    });
    expect(groups).toHaveLength(DEFAULT_SECURITY_GROUPS.length);
    expect(new Set(groups.map((group) => group.systemKey)).size).toBe(DEFAULT_SECURITY_GROUPS.length);

    const adminGroup = groups.find((group) => group.systemKey === SYSTEM_GROUP_KEYS.ADMINISTRATORS);
    await expect(
      db.securityGroupMember.count({
        where: { organizationId: first.organizationId, securityGroupId: adminGroup?.id },
      }),
    ).resolves.toBe(1);
  });

  it("lets an administrator manage groups and forbids a Front Desk employee", async () => {
    const admin = await provisionAdmin("admin");
    const employee = await db.userProfile.create({
      data: {
        organizationId: admin.organizationId,
        clerkUserId: `user_fd_${crypto.randomUUID()}`,
      },
    });
    const frontDesk = await db.securityGroup.findFirstOrThrow({
      where: { organizationId: admin.organizationId, systemKey: SYSTEM_GROUP_KEYS.FRONT_DESK },
    });
    await addSecurityGroupMember(admin.ctx, db, {
      securityGroupId: frontDesk.id,
      userProfileId: employee.id,
    });

    const employeeCtx = {
      ...admin.ctx,
      userId: employee.id,
      clerkUserId: employee.clerkUserId,
    };

    await expect(requirePermission(admin.ctx, PERMISSIONS.SECURITY_GROUPS_VIEW, db)).resolves.toBeUndefined();
    await expect(requirePermission(employeeCtx, PERMISSIONS.SECURITY_GROUPS_VIEW, db)).rejects.toBeInstanceOf(
      AuthorizationError,
    );
    await expect(createSecurityGroup(employeeCtx, db, { name: "Should Fail" })).rejects.toBeInstanceOf(
      AuthorizationError,
    );
    await expect(hasPermission(employeeCtx, PERMISSIONS.POS_ACCESS, db)).resolves.toBe(true);
  });

  it("does not let tenant A mutate tenant B even with a known group id", async () => {
    const a = await provisionAdmin("a");
    const b = await provisionAdmin("b");
    const groupB = await db.securityGroup.findFirstOrThrow({
      where: { organizationId: b.organizationId, systemKey: SYSTEM_GROUP_KEYS.FRONT_DESK },
    });

    await expect(deleteSecurityGroup(a.ctx, db, groupB.id)).rejects.toBeInstanceOf(AuthorizationError);
    await expect(
      addSecurityGroupMember(a.ctx, db, {
        securityGroupId: groupB.id,
        userProfileId: a.userProfileId,
      }),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("keeps remaining group permissions when a user leaves one group", async () => {
    const admin = await provisionAdmin("admin");
    const employee = await db.userProfile.create({
      data: {
        organizationId: admin.organizationId,
        clerkUserId: `user_multi_${crypto.randomUUID()}`,
      },
    });
    const frontDesk = await db.securityGroup.findFirstOrThrow({
      where: { organizationId: admin.organizationId, systemKey: SYSTEM_GROUP_KEYS.FRONT_DESK },
    });
    const operations = await db.securityGroup.findFirstOrThrow({
      where: { organizationId: admin.organizationId, systemKey: SYSTEM_GROUP_KEYS.OPERATIONS },
    });
    await addSecurityGroupMember(admin.ctx, db, { securityGroupId: frontDesk.id, userProfileId: employee.id });
    await addSecurityGroupMember(admin.ctx, db, { securityGroupId: operations.id, userProfileId: employee.id });

    const employeeCtx = { ...admin.ctx, userId: employee.id, clerkUserId: employee.clerkUserId };
    await removeSecurityGroupMember(admin.ctx, db, {
      securityGroupId: frontDesk.id,
      userProfileId: employee.id,
    });

    await expect(hasPermission(employeeCtx, PERMISSIONS.POS_ACCESS, db)).resolves.toBe(false);
    await expect(hasPermission(employeeCtx, PERMISSIONS.INVENTORY_VIEW, db)).resolves.toBe(true);
  });

  it("blocks deleting Administrators and removing the last administrator", async () => {
    const admin = await provisionAdmin("admin");
    const administrators = await db.securityGroup.findFirstOrThrow({
      where: { organizationId: admin.organizationId, systemKey: SYSTEM_GROUP_KEYS.ADMINISTRATORS },
    });

    await expect(deleteSecurityGroup(admin.ctx, db, administrators.id)).rejects.toMatchObject({
      code: "SYSTEM_GROUP_PROTECTED",
    });
    await expect(
      removeSecurityGroupMember(admin.ctx, db, {
        securityGroupId: administrators.id,
        userProfileId: admin.userProfileId,
      }),
    ).rejects.toMatchObject({ code: "LAST_ADMIN_REQUIRED" });
  });

  it("does not auto-admin an invited employee on an existing tenant", async () => {
    const admin = await provisionAdmin("admin");
    const organization = await db.organization.findFirstOrThrow({
      where: { id: admin.organizationId },
    });
    const invited = await provisionOrganization(
      {
        clerkUserId: `user_invited_${crypto.randomUUID()}`,
        clerkOrganizationId: organization.clerkOrganizationId ?? "",
        organizationName: organization.name,
        organizationSlug: organization.slug,
        isClerkOrganizationAdmin: false,
      },
      db,
    );

    const administrators = await db.securityGroup.findFirstOrThrow({
      where: { organizationId: admin.organizationId, systemKey: SYSTEM_GROUP_KEYS.ADMINISTRATORS },
    });
    await expect(
      db.securityGroupMember.findFirst({
        where: {
          organizationId: admin.organizationId,
          securityGroupId: administrators.id,
          userProfileId: invited.userProfileId,
        },
      }),
    ).resolves.toBeNull();
  });

  it("rejects assigning another organization's user at the service layer", async () => {
    const a = await provisionAdmin("a");
    const b = await provisionAdmin("b");
    const groupA = await db.securityGroup.findFirstOrThrow({
      where: { organizationId: a.organizationId, systemKey: SYSTEM_GROUP_KEYS.FRONT_DESK },
    });

    await expect(
      addSecurityGroupMember(a.ctx, db, {
        securityGroupId: groupA.id,
        userProfileId: b.userProfileId,
      }),
    ).rejects.toMatchObject({ code: "CROSS_TENANT_ASSIGNMENT" });
  });

  it("keeps required administrator permissions when the catalog is edited", async () => {
    const admin = await provisionAdmin("admin");
    const administrators = await db.securityGroup.findFirstOrThrow({
      where: { organizationId: admin.organizationId, systemKey: SYSTEM_GROUP_KEYS.ADMINISTRATORS },
    });

    await setSecurityGroupPermissions(admin.ctx, db, {
      securityGroupId: administrators.id,
      permissionKeys: [PERMISSIONS.EVENTS_VIEW],
    });

    await expect(hasPermission(admin.ctx, PERMISSIONS.SECURITY_GROUPS_MANAGE, db)).resolves.toBe(true);
    await expect(hasPermission(admin.ctx, PERMISSIONS.EVENTS_VIEW, db)).resolves.toBe(true);
    await expect(hasPermission(admin.ctx, PERMISSIONS.POS_ACCESS, db)).resolves.toBe(false);
  });

  it("bootstraps a Clerk org admin when Administrators is empty on an existing tenant", async () => {
    const original = await provisionAdmin("admin");
    const administrators = await db.securityGroup.findFirstOrThrow({
      where: { organizationId: original.organizationId, systemKey: SYSTEM_GROUP_KEYS.ADMINISTRATORS },
    });
    await db.securityGroupMember.deleteMany({
      where: { organizationId: original.organizationId, securityGroupId: administrators.id },
    });
    const organization = await db.organization.findFirstOrThrow({
      where: { id: original.organizationId },
    });

    const recovered = await provisionOrganization(
      {
        clerkUserId: `user_recover_${crypto.randomUUID()}`,
        clerkOrganizationId: organization.clerkOrganizationId ?? "",
        organizationName: organization.name,
        organizationSlug: organization.slug,
        isClerkOrganizationAdmin: true,
      },
      db,
    );

    await expect(
      db.securityGroupMember.findFirst({
        where: {
          organizationId: original.organizationId,
          securityGroupId: administrators.id,
          userProfileId: recovered.userProfileId,
        },
      }),
    ).resolves.not.toBeNull();
  });

  it("lets an existing MagicCRM Administrator add another employee to Administrators", async () => {
    const admin = await provisionAdmin("admin");
    const employee = await db.userProfile.create({
      data: {
        organizationId: admin.organizationId,
        clerkUserId: `user_second_${crypto.randomUUID()}`,
      },
    });
    const administrators = await db.securityGroup.findFirstOrThrow({
      where: { organizationId: admin.organizationId, systemKey: SYSTEM_GROUP_KEYS.ADMINISTRATORS },
    });

    await addSecurityGroupMember(admin.ctx, db, {
      securityGroupId: administrators.id,
      userProfileId: employee.id,
    });

    const detail = await getSecurityGroupDetail(admin.ctx, db, administrators.id);
    expect(detail?.members.some((member) => member.userProfileId === employee.id)).toBe(true);

    const secondAdminCtx = {
      ...admin.ctx,
      userId: employee.id,
      clerkUserId: employee.clerkUserId,
    };
    await expect(hasPermission(secondAdminCtx, PERMISSIONS.SECURITY_GROUPS_VIEW, db)).resolves.toBe(true);
    await expect(hasPermission(secondAdminCtx, PERMISSIONS.SECURITY_GROUPS_MANAGE, db)).resolves.toBe(true);
  });

  it("does not grant MagicCRM permissions to a later Clerk admin after bootstrap", async () => {
    const first = await provisionAdmin("first");
    const organization = await db.organization.findFirstOrThrow({
      where: { id: first.organizationId },
    });
    const laterClerkAdmin = await provisionOrganization(
      {
        clerkUserId: `user_later_admin_${crypto.randomUUID()}`,
        clerkOrganizationId: organization.clerkOrganizationId ?? "",
        organizationName: organization.name,
        organizationSlug: organization.slug,
        isClerkOrganizationAdmin: true,
      },
      db,
    );

    const administrators = await db.securityGroup.findFirstOrThrow({
      where: { organizationId: first.organizationId, systemKey: SYSTEM_GROUP_KEYS.ADMINISTRATORS },
    });
    await expect(
      db.securityGroupMember.findFirst({
        where: {
          organizationId: first.organizationId,
          securityGroupId: administrators.id,
          userProfileId: laterClerkAdmin.userProfileId,
        },
      }),
    ).resolves.toBeNull();

    const laterProfile = await db.userProfile.findFirstOrThrow({
      where: { id: laterClerkAdmin.userProfileId },
    });
    const laterCtx = {
      ...first.ctx,
      userId: laterProfile.id,
      clerkUserId: laterProfile.clerkUserId,
    };

    await expect(hasPermission(laterCtx, PERMISSIONS.SECURITY_GROUPS_VIEW, db)).resolves.toBe(false);
    await expect(hasPermission(laterCtx, PERMISSIONS.SECURITY_GROUPS_MANAGE, db)).resolves.toBe(false);
  });

  it("allows a Clerk member to be made a MagicCRM Administrator deliberately", async () => {
    const admin = await provisionAdmin("admin");
    const organization = await db.organization.findFirstOrThrow({
      where: { id: admin.organizationId },
    });
    const clerkMember = await provisionOrganization(
      {
        clerkUserId: `user_clerk_member_${crypto.randomUUID()}`,
        clerkOrganizationId: organization.clerkOrganizationId ?? "",
        organizationName: organization.name,
        organizationSlug: organization.slug,
        isClerkOrganizationAdmin: false,
      },
      db,
    );
    const administrators = await db.securityGroup.findFirstOrThrow({
      where: { organizationId: admin.organizationId, systemKey: SYSTEM_GROUP_KEYS.ADMINISTRATORS },
    });

    await addSecurityGroupMember(admin.ctx, db, {
      securityGroupId: administrators.id,
      userProfileId: clerkMember.userProfileId,
    });

    const memberCtx = {
      ...admin.ctx,
      userId: clerkMember.userProfileId,
      clerkUserId: (
        await db.userProfile.findFirstOrThrow({ where: { id: clerkMember.userProfileId } })
      ).clerkUserId,
    };
    await expect(hasPermission(memberCtx, PERMISSIONS.SECURITY_GROUPS_MANAGE, db)).resolves.toBe(true);
  });

  it("returns updated group members after a successful add-member mutation", async () => {
    const admin = await provisionAdmin("admin");
    const employee = await db.userProfile.create({
      data: {
        organizationId: admin.organizationId,
        clerkUserId: `user_member_${crypto.randomUUID()}`,
      },
    });
    const frontDesk = await db.securityGroup.findFirstOrThrow({
      where: { organizationId: admin.organizationId, systemKey: SYSTEM_GROUP_KEYS.FRONT_DESK },
    });

    const before = await getSecurityGroupDetail(admin.ctx, db, frontDesk.id);
    expect(before?.members.map((member) => member.userProfileId)).not.toContain(employee.id);

    await addSecurityGroupMember(admin.ctx, db, {
      securityGroupId: frontDesk.id,
      userProfileId: employee.id,
    });

    const after = await getSecurityGroupDetail(admin.ctx, db, frontDesk.id);
    expect(after?.members.some((member) => member.userProfileId === employee.id)).toBe(true);
  });

  it("returns updated permissions after a successful permission save", async () => {
    const admin = await provisionAdmin("admin");
    const frontDesk = await db.securityGroup.findFirstOrThrow({
      where: { organizationId: admin.organizationId, systemKey: SYSTEM_GROUP_KEYS.FRONT_DESK },
    });
    const before = await getSecurityGroupDetail(admin.ctx, db, frontDesk.id);
    const beforeKeys = new Set(
      before?.permissions.map((row) => row.permissionDefinition.key) ?? [],
    );
    expect(beforeKeys.has(PERMISSIONS.REPORTS_VIEW)).toBe(false);

    await setSecurityGroupPermissions(admin.ctx, db, {
      securityGroupId: frontDesk.id,
      permissionKeys: [...beforeKeys, PERMISSIONS.REPORTS_VIEW],
    });

    const after = await getSecurityGroupDetail(admin.ctx, db, frontDesk.id);
    expect(after?.permissions.some((row) => row.permissionDefinition.key === PERMISSIONS.REPORTS_VIEW)).toBe(
      true,
    );
  });
});
