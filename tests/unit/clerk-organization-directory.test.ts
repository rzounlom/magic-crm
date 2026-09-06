import { describe, expect, it } from "vitest";

import { createOrganizationDirectory } from "@/lib/auth/create-organization-directory";
import { CLERK_ORGANIZATION_MEMBER_ROLE } from "@/types/team";

describe("Clerk organization invitation adapter", () => {
  it("creates invitations as org:member with a trusted redirect URL", async () => {
    const captured: Array<{ role: string; redirectUrl: string }> = [];
    const directory = createOrganizationDirectory({
      async createOrganizationInvitation(params) {
        captured.push({ role: params.role, redirectUrl: params.redirectUrl });
        return {
          id: "orginv_1",
          emailAddress: params.emailAddress,
          organizationId: params.organizationId,
          expiresAt: Date.now(),
        };
      },
      async revokeOrganizationInvitation() {
        return undefined;
      },
      async getOrganizationInvitationList() {
        return { data: [], totalCount: 0 };
      },
      async getOrganizationInvitation() {
        throw new Error("unused");
      },
      async getOrganizationMembershipList() {
        return { data: [] };
      },
      async createOrganization(params) {
        return { id: "org_1", name: params.name, slug: params.slug, privateMetadata: params.privateMetadata };
      },
      async getOrganization() {
        return { id: "org_1", name: "Demo", slug: "demo", privateMetadata: {} };
      },
    });

    await directory.createInvitation({
      clerkOrganizationId: "org_clerk",
      emailAddress: "a@b.co",
      expiresInDays: 14,
      redirectUrl: "http://localhost:3000/accept-invitation",
    });
    expect(captured).toEqual([
      { role: CLERK_ORGANIZATION_MEMBER_ROLE, redirectUrl: "http://localhost:3000/accept-invitation" },
    ]);
  });

  it("lists current-organization invitations in pages and treats 404 get as missing", async () => {
    const listed: Array<{ limit?: number; offset?: number }> = [];
    const directory = createOrganizationDirectory({
      async createOrganizationInvitation(params) {
        return {
          id: "orginv_1",
          emailAddress: params.emailAddress,
          organizationId: params.organizationId,
          expiresAt: Date.now(),
          status: "pending",
        };
      },
      async revokeOrganizationInvitation() {
        return undefined;
      },
      async getOrganizationInvitationList(params) {
        listed.push({ limit: params.limit, offset: params.offset });
        if ((params.offset ?? 0) > 0) {
          return { data: [], totalCount: 1 };
        }
        return {
          data: [
            {
              id: "orginv_1",
              emailAddress: "a@b.co",
              organizationId: params.organizationId,
              expiresAt: Date.now(),
              status: "accepted",
            },
          ],
          totalCount: 1,
        };
      },
      async getOrganizationInvitation() {
        const error = Object.assign(new Error("missing"), {
          status: 404,
          errors: [{ code: "resource_not_found" }],
        });
        throw error;
      },
      async getOrganizationMembershipList() {
        return { data: [] };
      },
      async createOrganization(params) {
        return { id: "org_1", name: params.name, slug: params.slug, privateMetadata: params.privateMetadata };
      },
      async getOrganization() {
        return { id: "org_1", name: "Demo", slug: "demo", privateMetadata: {} };
      },
    });

    const invitations = await directory.listInvitations({ clerkOrganizationId: "org_clerk" });
    expect(invitations).toEqual([
      expect.objectContaining({ id: "orginv_1", status: "accepted", clerkOrganizationId: "org_clerk" }),
    ]);
    expect(listed[0]).toEqual({ limit: 100, offset: 0 });

    await expect(
      directory.getInvitation({ clerkOrganizationId: "org_clerk", invitationId: "orginv_missing" }),
    ).resolves.toBeNull();
  });
});
