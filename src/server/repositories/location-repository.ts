export type LocationRecord = {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  timezone: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type LocationByOrganizationWhere = {
  id: string;
  organizationId: string;
};

export type LocationReader = {
  location: {
    findFirst: (args: { where: LocationByOrganizationWhere }) => Promise<LocationRecord | null>;
  };
};

export function createLocationRepository(db: LocationReader) {
  return {
    /**
     * Tenant-facing location lookup. The query always constrains both
     * location id and organization id. A known foreign-tenant id is
     * indistinguishable from a missing row.
     */
    findById(input: { organizationId: string; locationId: string }): Promise<LocationRecord | null> {
      return db.location.findFirst({
        where: {
          id: input.locationId,
          organizationId: input.organizationId,
        },
      });
    },
  };
}
