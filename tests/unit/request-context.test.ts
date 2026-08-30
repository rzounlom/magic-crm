import { describe, expect, it } from "vitest";

import { TenantContextError } from "@/server/errors";
import { resolveRequestContext } from "@/server/request-context";
import {
  provisionInputFromClerkAuth,
  provisionOrganization,
} from "@/server/services/provision-organization";

function emptyDatabase() {
  return {
    organization: {
      findFirst: async () => null,
    },
    userProfile: {
      findFirst: async () => null,
    },
  };
}

describe("resolveRequestContext", () => {
  it("fails closed when the user is unauthenticated", async () => {
    await expect(
      resolveRequestContext({ clerkUserId: null, clerkOrganizationId: null }, emptyDatabase()),
    ).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });

  it("fails closed when there is no active organization", async () => {
    await expect(
      resolveRequestContext({ clerkUserId: "user_1", clerkOrganizationId: null }, emptyDatabase()),
    ).rejects.toMatchObject({ code: "NO_ACTIVE_ORGANIZATION" });
  });

  it("fails closed when the Clerk organization is not provisioned", async () => {
    await expect(
      resolveRequestContext(
        { clerkUserId: "user_1", clerkOrganizationId: "org_unknown" },
        emptyDatabase(),
      ),
    ).rejects.toMatchObject({ code: "ORGANIZATION_NOT_PROVISIONED" });
  });

  it("fails closed when the user profile is missing in the active organization", async () => {
    await expect(
      resolveRequestContext(
        { clerkUserId: "user_1", clerkOrganizationId: "org_clerk" },
        {
          organization: {
            findFirst: async () => ({
              id: "org_internal",
              clerkOrganizationId: "org_clerk",
              name: "Org",
              slug: "org",
              timezone: "UTC",
              currency: "USD",
              createdAt: new Date(),
              updatedAt: new Date(),
            }),
          },
          userProfile: {
            findFirst: async () => null,
          },
        },
      ),
    ).rejects.toMatchObject({ code: "USER_PROFILE_NOT_PROVISIONED" });
  });

  it("does not accept a browser-supplied organization id as tenant authority", async () => {
    const ctx = await resolveRequestContext(
      { clerkUserId: "user_1", clerkOrganizationId: "org_clerk" },
      {
        organization: {
          findFirst: async ({ where }) => {
            if (where.clerkOrganizationId === "org_clerk") {
              return {
                id: "org_internal",
                clerkOrganizationId: "org_clerk",
                name: "Org",
                slug: "org",
                timezone: "UTC",
                currency: "USD",
                createdAt: new Date(),
                updatedAt: new Date(),
              };
            }

            return null;
          },
        },
        userProfile: {
          findFirst: async () => ({
            id: "profile_1",
            clerkUserId: "user_1",
            organizationId: "org_internal",
            defaultLocationId: "loc_1",
            createdAt: new Date(),
            updatedAt: new Date(),
          }),
        },
      },
    );

    expect(ctx.organizationId).toBe("org_internal");
    expect(ctx.clerkOrganizationId).toBe("org_clerk");
  });

  it("fails closed when a user profile belongs to a different organization", async () => {
    await expect(
      resolveRequestContext(
        { clerkUserId: "user_1", clerkOrganizationId: "org_clerk" },
        {
          organization: {
            findFirst: async () => ({
              id: "org_internal",
              clerkOrganizationId: "org_clerk",
              name: "Org",
              slug: "org",
              timezone: "UTC",
              currency: "USD",
              createdAt: new Date(),
              updatedAt: new Date(),
            }),
          },
          userProfile: {
            findFirst: async () => ({
              id: "profile_1",
              clerkUserId: "user_1",
              organizationId: "org_other",
              defaultLocationId: null,
              createdAt: new Date(),
              updatedAt: new Date(),
            }),
          },
        },
      ),
    ).rejects.toMatchObject({ code: "INVALID_TENANT_MAPPING" });
  });
});

describe("provisionInputFromClerkAuth", () => {
  it("requires an authenticated Clerk user and active organization", () => {
    expect(() =>
      provisionInputFromClerkAuth({ clerkUserId: null, clerkOrganizationId: null }),
    ).toThrow(TenantContextError);
    expect(() =>
      provisionInputFromClerkAuth({ clerkUserId: "user_1", clerkOrganizationId: null }),
    ).toThrow(/organization/i);
  });

  it("rejects incomplete provisioning arguments before writing", async () => {
    await expect(
      provisionOrganization(
        { clerkUserId: "", clerkOrganizationId: "org_clerk", organizationName: "Org" },
        {} as never,
      ),
    ).rejects.toMatchObject({ code: "INVALID_TENANT_MAPPING" });
  });
});
