import type { RequestContext } from "@/server/request-context";

export type OrganizationRecord = {
  id: string;
  clerkOrganizationId: string | null;
  name: string;
  slug: string;
  timezone: string;
  currency: string;
  createdAt: Date;
  updatedAt: Date;
};

export type OrganizationReader = {
  organization: {
    findFirst: (args: {
      where: { id?: string; clerkOrganizationId?: string };
    }) => Promise<OrganizationRecord | null>;
  };
};

export function createOrganizationRepository(db: OrganizationReader) {
  return {
    findById(ctx: Pick<RequestContext, "organizationId">): Promise<OrganizationRecord | null> {
      return db.organization.findFirst({
        where: { id: ctx.organizationId },
      });
    },

    findByClerkOrganizationId(clerkOrganizationId: string): Promise<OrganizationRecord | null> {
      return db.organization.findFirst({
        where: { clerkOrganizationId },
      });
    },
  };
}
