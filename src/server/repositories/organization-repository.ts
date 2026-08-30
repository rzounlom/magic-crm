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
    findFirst: (args: { where: { id: string } }) => Promise<OrganizationRecord | null>;
  };
};

export function createOrganizationRepository(db: OrganizationReader) {
  return {
    /**
     * Tenant-facing organization lookup. The caller supplies the trusted
     * organizationId from RequestContext — never a browser-provided value.
     */
    findById(input: { organizationId: string }): Promise<OrganizationRecord | null> {
      return db.organization.findFirst({
        where: { id: input.organizationId },
      });
    },
  };
}
