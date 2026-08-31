import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { SYSTEM_GROUP_KEYS } from "@/server/authorization/default-security-groups";
import { AuthorizationError } from "@/server/errors";
import { invalidatePermissionCache, requirePermission } from "@/server/policies/require-permission";
import type { RequestContext } from "@/server/request-context";
import { recordSecurityAudit } from "@/server/services/audit";
import { PERMISSIONS, REQUIRED_ADMIN_PERMISSIONS, isPermissionKey, type PermissionKey } from "@/types/permissions";

const GROUP_NAME_MAX = 80;
const GROUP_DESCRIPTION_MAX = 280;

export type SecurityGroupListItem = {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  systemKey: string | null;
  memberCount: number;
  permissionCount: number;
};

function trimName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new AuthorizationError("FORBIDDEN");
  }
  if (trimmed.length > GROUP_NAME_MAX) {
    throw new AuthorizationError("FORBIDDEN");
  }
  return trimmed;
}

function trimDescription(description: string | null | undefined): string | null {
  if (description == null) {
    return null;
  }
  const trimmed = description.trim();
  if (trimmed.length > GROUP_DESCRIPTION_MAX) {
    throw new AuthorizationError("FORBIDDEN");
  }
  return trimmed.length > 0 ? trimmed : null;
}

export async function listSecurityGroups(
  ctx: RequestContext,
  database: PrismaClient,
): Promise<SecurityGroupListItem[]> {
  await requirePermission(ctx, PERMISSIONS.SECURITY_GROUPS_VIEW, database);

  const groups = await database.securityGroup.findMany({
    where: { organizationId: ctx.organizationId },
    orderBy: [{ isSystem: "desc" }, { name: "asc" }],
    include: {
      _count: { select: { members: true, permissions: true } },
    },
  });

  return groups.map((group) => ({
    id: group.id,
    name: group.name,
    description: group.description,
    isSystem: group.isSystem,
    systemKey: group.systemKey,
    memberCount: group._count.members,
    permissionCount: group._count.permissions,
  }));
}

export async function getSecurityGroupDetail(
  ctx: RequestContext,
  database: PrismaClient,
  securityGroupId: string,
) {
  await requirePermission(ctx, PERMISSIONS.SECURITY_GROUPS_VIEW, database);

  const group = await database.securityGroup.findFirst({
    where: { id: securityGroupId, organizationId: ctx.organizationId },
    include: {
      permissions: {
        include: { permissionDefinition: true },
      },
      members: true,
    },
  });

  return group;
}

export async function createSecurityGroup(
  ctx: RequestContext,
  database: PrismaClient,
  input: { name: string; description?: string | null },
) {
  await requirePermission(ctx, PERMISSIONS.SECURITY_GROUPS_MANAGE, database);

  const name = trimName(input.name);
  const description = trimDescription(input.description);

  try {
    const group = await database.securityGroup.create({
      data: {
        organizationId: ctx.organizationId,
        name,
        description,
        isSystem: false,
      },
    });
    await recordSecurityAudit(database, ctx, {
      action: "security_group.created",
      resourceType: "security_group",
      resourceId: group.id,
      metadata: { name },
    });
    return group;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new AuthorizationError("DUPLICATE_GROUP_NAME");
    }
    throw error;
  }
}

export async function updateSecurityGroup(
  ctx: RequestContext,
  database: PrismaClient,
  input: { securityGroupId: string; name: string; description?: string | null },
) {
  await requirePermission(ctx, PERMISSIONS.SECURITY_GROUPS_MANAGE, database);

  const group = await requireGroupInTenant(database, ctx.organizationId, input.securityGroupId);
  if (group.systemKey === SYSTEM_GROUP_KEYS.ADMINISTRATORS && trimName(input.name) !== group.name) {
    throw new AuthorizationError("SYSTEM_GROUP_PROTECTED");
  }

  try {
    const updated = await database.securityGroup.update({
      where: { id: group.id },
      data: {
        name: trimName(input.name),
        description: trimDescription(input.description),
      },
    });
    await recordSecurityAudit(database, ctx, {
      action: "security_group.updated",
      resourceType: "security_group",
      resourceId: group.id,
    });
    return updated;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new AuthorizationError("DUPLICATE_GROUP_NAME");
    }
    throw error;
  }
}

export async function deleteSecurityGroup(
  ctx: RequestContext,
  database: PrismaClient,
  securityGroupId: string,
) {
  await requirePermission(ctx, PERMISSIONS.SECURITY_GROUPS_MANAGE, database);

  const group = await requireGroupInTenant(database, ctx.organizationId, securityGroupId);
  if (group.isSystem) {
    throw new AuthorizationError("SYSTEM_GROUP_PROTECTED");
  }

  await database.securityGroup.delete({
    where: { id: group.id },
  });
  invalidatePermissionCache(ctx);
  await recordSecurityAudit(database, ctx, {
    action: "security_group.deleted",
    resourceType: "security_group",
    resourceId: group.id,
    metadata: { name: group.name },
  });
}

export async function setSecurityGroupPermissions(
  ctx: RequestContext,
  database: PrismaClient,
  input: { securityGroupId: string; permissionKeys: string[] },
) {
  await requirePermission(ctx, PERMISSIONS.SECURITY_GROUPS_MANAGE, database);

  const group = await requireGroupInTenant(database, ctx.organizationId, input.securityGroupId);
  const requested = uniquePermissionKeys(input.permissionKeys);

  const keys =
    group.systemKey === SYSTEM_GROUP_KEYS.ADMINISTRATORS
      ? uniquePermissionKeys([...requested, ...REQUIRED_ADMIN_PERMISSIONS])
      : requested;

  const definitions = await database.permissionDefinition.findMany({
    where: { key: { in: keys }, active: true },
    select: { id: true, key: true },
  });

  if (definitions.length !== keys.length) {
    throw new AuthorizationError("FORBIDDEN");
  }

  await database.$transaction(async (tx) => {
    await tx.securityGroupPermission.deleteMany({
      where: { organizationId: ctx.organizationId, securityGroupId: group.id },
    });
    if (definitions.length > 0) {
      await tx.securityGroupPermission.createMany({
        data: definitions.map((definition) => ({
          organizationId: ctx.organizationId,
          securityGroupId: group.id,
          permissionDefinitionId: definition.id,
        })),
      });
    }
  });

  invalidatePermissionCache(ctx);
  await recordSecurityAudit(database, ctx, {
    action: "security_group.permissions_changed",
    resourceType: "security_group",
    resourceId: group.id,
    metadata: { permissionCount: definitions.length },
  });
}

export async function addSecurityGroupMember(
  ctx: RequestContext,
  database: PrismaClient,
  input: { securityGroupId: string; userProfileId: string },
) {
  await requirePermission(ctx, PERMISSIONS.SECURITY_GROUPS_MANAGE, database);

  const group = await requireGroupInTenant(database, ctx.organizationId, input.securityGroupId);
  const profile = await database.userProfile.findFirst({
    where: { id: input.userProfileId, organizationId: ctx.organizationId },
    select: { id: true, organizationId: true },
  });

  if (!profile) {
    throw new AuthorizationError("CROSS_TENANT_ASSIGNMENT");
  }

  try {
    await database.securityGroupMember.create({
      data: {
        organizationId: ctx.organizationId,
        securityGroupId: group.id,
        userProfileId: profile.id,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return;
    }
    throw error;
  }

  invalidatePermissionCache(ctx);
  await recordSecurityAudit(database, ctx, {
    action: "security_group.member_added",
    resourceType: "security_group",
    resourceId: group.id,
    metadata: { userProfileId: profile.id },
  });
}

export async function removeSecurityGroupMember(
  ctx: RequestContext,
  database: PrismaClient,
  input: { securityGroupId: string; userProfileId: string },
) {
  await requirePermission(ctx, PERMISSIONS.SECURITY_GROUPS_MANAGE, database);

  const group = await requireGroupInTenant(database, ctx.organizationId, input.securityGroupId);

  const deleted = await database.$transaction(async (tx) => {
    await tx.$queryRaw`
      SELECT id FROM security_groups
      WHERE id = ${group.id} AND "organizationId" = ${ctx.organizationId}
      FOR UPDATE
    `;

    const membership = await tx.securityGroupMember.findFirst({
      where: {
        organizationId: ctx.organizationId,
        securityGroupId: group.id,
        userProfileId: input.userProfileId,
      },
      select: { id: true },
    });

    if (!membership) {
      return 0;
    }

    if (group.systemKey === SYSTEM_GROUP_KEYS.ADMINISTRATORS) {
      const adminCount = await tx.securityGroupMember.count({
        where: {
          organizationId: ctx.organizationId,
          securityGroupId: group.id,
        },
      });
      if (adminCount <= 1) {
        throw new AuthorizationError("LAST_ADMIN_REQUIRED");
      }
    }

    await tx.securityGroupMember.delete({
      where: { id: membership.id },
    });
    return 1;
  });

  if (deleted > 0) {
    invalidatePermissionCache(ctx);
    await recordSecurityAudit(database, ctx, {
      action: "security_group.member_removed",
      resourceType: "security_group",
      resourceId: group.id,
      metadata: { userProfileId: input.userProfileId },
    });
  }
}

export async function listOrganizationUserProfiles(ctx: RequestContext, database: PrismaClient) {
  await requirePermission(ctx, PERMISSIONS.SECURITY_GROUPS_VIEW, database);

  return database.userProfile.findMany({
    where: { organizationId: ctx.organizationId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      clerkUserId: true,
      firstName: true,
      lastName: true,
      displayName: true,
      email: true,
      createdAt: true,
    },
  });
}

async function requireGroupInTenant(database: PrismaClient, organizationId: string, securityGroupId: string) {
  const group = await database.securityGroup.findFirst({
    where: { id: securityGroupId, organizationId },
  });

  if (!group) {
    throw new AuthorizationError("FORBIDDEN");
  }

  return group;
}

function uniquePermissionKeys(keys: readonly string[]): PermissionKey[] {
  const unique = new Set<PermissionKey>();
  for (const key of keys) {
    if (!isPermissionKey(key)) {
      throw new AuthorizationError("FORBIDDEN");
    }
    unique.add(key);
  }
  return [...unique];
}
