import { AuthorizationError } from "@/server/errors";
import type { RequestContext } from "@/server/request-context";
import { isPermissionKey, type PermissionKey } from "@/types/permissions";

type EffectivePermissionRow = {
  securityGroup: {
    organizationId: string;
    permissions: Array<{
      permissionDefinition: {
        key: string;
        active: boolean;
      };
    }>;
  };
};

export type AuthorizationDatabase = {
  securityGroupMember: {
    findMany: (args: {
      where: { organizationId: string; userProfileId: string };
      select: {
        securityGroup: {
          select: {
            organizationId: true;
            permissions: {
              select: {
                permissionDefinition: {
                  select: { key: true; active: true };
                };
              };
            };
          };
        };
      };
    }) => Promise<EffectivePermissionRow[]>;
  };
};

const requestPermissionCache = new WeakMap<object, Promise<ReadonlySet<PermissionKey>>>();

export async function getEffectivePermissions(
  ctx: Pick<RequestContext, "organizationId" | "userId">,
  database: AuthorizationDatabase,
): Promise<ReadonlySet<PermissionKey>> {
  const cached = requestPermissionCache.get(ctx);
  if (cached) {
    return cached;
  }

  const pending = loadEffectivePermissions(ctx, database);
  requestPermissionCache.set(ctx, pending);
  return pending;
}

async function loadEffectivePermissions(
  ctx: Pick<RequestContext, "organizationId" | "userId">,
  database: AuthorizationDatabase,
): Promise<ReadonlySet<PermissionKey>> {
  const memberships = await database.securityGroupMember.findMany({
    where: {
      organizationId: ctx.organizationId,
      userProfileId: ctx.userId,
    },
    select: {
      securityGroup: {
        select: {
          organizationId: true,
          permissions: {
            select: {
              permissionDefinition: {
                select: { key: true, active: true },
              },
            },
          },
        },
      },
    },
  });

  const keys = new Set<PermissionKey>();

  for (const membership of memberships) {
    if (membership.securityGroup.organizationId !== ctx.organizationId) {
      continue;
    }

    for (const assignment of membership.securityGroup.permissions) {
      if (!assignment.permissionDefinition.active) {
        continue;
      }
      if (isPermissionKey(assignment.permissionDefinition.key)) {
        keys.add(assignment.permissionDefinition.key);
      }
    }
  }

  return keys;
}

export async function hasPermission(
  ctx: Pick<RequestContext, "organizationId" | "userId">,
  permission: PermissionKey,
  database: AuthorizationDatabase,
): Promise<boolean> {
  const permissions = await getEffectivePermissions(ctx, database);
  return permissions.has(permission);
}

export async function requirePermission(
  ctx: Pick<RequestContext, "organizationId" | "userId">,
  permission: PermissionKey,
  database: AuthorizationDatabase,
): Promise<void> {
  if (!(await hasPermission(ctx, permission, database))) {
    throw new AuthorizationError("FORBIDDEN");
  }
}

export function invalidatePermissionCache(
  ctx: Pick<RequestContext, "organizationId" | "userId">,
): void {
  requestPermissionCache.delete(ctx);
}
