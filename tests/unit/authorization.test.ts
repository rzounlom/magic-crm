import { describe, expect, it } from "vitest";

import { AuthorizationError } from "@/server/errors";
import { hasPermission, requirePermission } from "@/server/policies/require-permission";
import { DEFAULT_SECURITY_GROUPS, SYSTEM_GROUP_KEYS } from "@/server/authorization/default-security-groups";
import { ALL_PERMISSION_KEYS, isPermissionKey, PERMISSIONS } from "@/types/permissions";

describe("permission catalog", () => {
  it("has unique keys", () => {
    expect(new Set(ALL_PERMISSION_KEYS).size).toBe(ALL_PERMISSION_KEYS.length);
  });

  it("rejects unknown permission keys", () => {
    expect(isPermissionKey("not.a.permission")).toBe(false);
    expect(isPermissionKey(PERMISSIONS.SECURITY_GROUPS_MANAGE)).toBe(true);
  });
});

describe("default security groups", () => {
  it("includes a protected Administrators group with all tenant permissions", () => {
    const administrators = DEFAULT_SECURITY_GROUPS.find(
      (group) => group.systemKey === SYSTEM_GROUP_KEYS.ADMINISTRATORS,
    );
    expect(administrators?.permissionKeys).toEqual(ALL_PERMISSION_KEYS);
  });

  it("does not give Front Desk security administration", () => {
    const frontDesk = DEFAULT_SECURITY_GROUPS.find(
      (group) => group.systemKey === SYSTEM_GROUP_KEYS.FRONT_DESK,
    );
    expect(frontDesk?.permissionKeys).not.toContain(PERMISSIONS.SECURITY_GROUPS_MANAGE);
    expect(frontDesk?.permissionKeys).not.toContain(PERMISSIONS.USERS_MANAGE);
  });
});

describe("requirePermission", () => {
  function ctx() {
    return { organizationId: "org_a", userId: "user_a" };
  }

  function databaseWithPermissions(keys: string[]) {
    return {
      securityGroupMember: {
        findMany: async () => [
          {
            securityGroup: {
              organizationId: "org_a",
              permissions: keys.map((key) => ({
                permissionDefinition: { key, active: true },
              })),
            },
          },
        ],
      },
    };
  }

  it("allows a granted permission", async () => {
    await expect(
      requirePermission(ctx(), PERMISSIONS.SECURITY_GROUPS_VIEW, databaseWithPermissions([PERMISSIONS.SECURITY_GROUPS_VIEW])),
    ).resolves.toBeUndefined();
  });

  it("forbids a missing permission", async () => {
    await expect(
      requirePermission(ctx(), PERMISSIONS.SECURITY_GROUPS_MANAGE, databaseWithPermissions([PERMISSIONS.SECURITY_GROUPS_VIEW])),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("unions permissions across groups", async () => {
    const database = {
      securityGroupMember: {
        findMany: async () => [
          {
            securityGroup: {
              organizationId: "org_a",
              permissions: [
                { permissionDefinition: { key: PERMISSIONS.EVENTS_VIEW, active: true } },
              ],
            },
          },
          {
            securityGroup: {
              organizationId: "org_a",
              permissions: [
                { permissionDefinition: { key: PERMISSIONS.POS_ACCESS, active: true } },
              ],
            },
          },
        ],
      },
    };

    const request = ctx();
    await expect(hasPermission(request, PERMISSIONS.EVENTS_VIEW, database)).resolves.toBe(true);
    await expect(hasPermission(request, PERMISSIONS.POS_ACCESS, database)).resolves.toBe(true);
    await expect(hasPermission(request, PERMISSIONS.SECURITY_GROUPS_MANAGE, database)).resolves.toBe(false);
  });

  it("ignores another organization's nested group rows", async () => {
    const database = {
      securityGroupMember: {
        findMany: async () => [
          {
            securityGroup: {
              organizationId: "org_b",
              permissions: [
                { permissionDefinition: { key: PERMISSIONS.SECURITY_GROUPS_MANAGE, active: true } },
              ],
            },
          },
        ],
      },
    };

    await expect(hasPermission(ctx(), PERMISSIONS.SECURITY_GROUPS_MANAGE, database)).resolves.toBe(false);
  });
});
