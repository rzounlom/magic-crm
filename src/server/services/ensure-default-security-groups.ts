import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import {
  DEFAULT_SECURITY_GROUPS,
  SYSTEM_GROUP_KEYS,
} from "@/server/authorization/default-security-groups";
import { logTenantEvent } from "@/server/logging";
import { recordAuditEvent } from "@/server/services/audit";
import { syncPermissionDefinitions } from "@/server/services/sync-permission-definitions";

export function isClerkOrganizationAdminRole(role: string | null | undefined): boolean {
  return role === "org:admin" || role === "admin";
}

export async function ensureDefaultSecurityGroups(
  database: PrismaClient,
  input: {
    organizationId: string;
    userProfileId?: string;
    organizationCreated: boolean;
    isClerkOrganizationAdmin: boolean;
  },
): Promise<void> {
  await syncPermissionDefinitions(database);

  const definitions = await database.permissionDefinition.findMany({
    where: { active: true },
    select: { id: true, key: true },
  });
  const permissionIdByKey = new Map(definitions.map((row) => [row.key, row.id]));

  for (const template of DEFAULT_SECURITY_GROUPS) {
    const group = await findOrCreateSystemGroup(database, {
      organizationId: input.organizationId,
      name: template.name,
      description: template.description,
      systemKey: template.systemKey,
    });

    const permissionIds = template.permissionKeys
      .map((key) => permissionIdByKey.get(key))
      .filter((id): id is string => Boolean(id));

    await ensureGroupPermissions(database, {
      organizationId: input.organizationId,
      securityGroupId: group.id,
      permissionIds,
    });
  }

  const administrators = await database.securityGroup.findFirst({
    where: {
      organizationId: input.organizationId,
      systemKey: SYSTEM_GROUP_KEYS.ADMINISTRATORS,
    },
    select: { id: true },
  });

  if (!administrators) {
    return;
  }

  const adminCount = await database.securityGroupMember.count({
    where: {
      organizationId: input.organizationId,
      securityGroupId: administrators.id,
    },
  });

  const shouldBootstrap =
    Boolean(input.userProfileId) &&
    adminCount === 0 &&
    (input.organizationCreated || input.isClerkOrganizationAdmin);

  if (!shouldBootstrap || !input.userProfileId) {
    return;
  }

  try {
    await database.securityGroupMember.create({
      data: {
        organizationId: input.organizationId,
        securityGroupId: administrators.id,
        userProfileId: input.userProfileId,
      },
    });
    logTenantEvent("administrator_bootstrapped", {
      outcome: "administrator_bootstrapped",
    });
    await recordAuditEvent(database, {
      organizationId: input.organizationId,
      actorUserProfileId: input.userProfileId,
      action: "security_group.administrator_bootstrapped",
      resourceType: "security_group",
      resourceId: administrators.id,
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return;
    }
    throw error;
  }
}

async function findOrCreateSystemGroup(
  database: PrismaClient,
  input: {
    organizationId: string;
    name: string;
    description: string;
    systemKey: string;
  },
) {
  const existing = await database.securityGroup.findFirst({
    where: {
      organizationId: input.organizationId,
      systemKey: input.systemKey,
    },
  });

  if (existing) {
    return existing;
  }

  try {
    return await database.securityGroup.create({
      data: {
        organizationId: input.organizationId,
        name: input.name,
        description: input.description,
        isSystem: true,
        systemKey: input.systemKey,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const raced = await database.securityGroup.findFirst({
        where: {
          organizationId: input.organizationId,
          systemKey: input.systemKey,
        },
      });
      if (raced) {
        return raced;
      }
    }
    throw error;
  }
}

async function ensureGroupPermissions(
  database: PrismaClient,
  input: {
    organizationId: string;
    securityGroupId: string;
    permissionIds: string[];
  },
) {
  if (input.permissionIds.length === 0) {
    return;
  }

  await database.securityGroupPermission.createMany({
    data: input.permissionIds.map((permissionDefinitionId) => ({
      organizationId: input.organizationId,
      securityGroupId: input.securityGroupId,
      permissionDefinitionId,
    })),
    skipDuplicates: true,
  });
}
