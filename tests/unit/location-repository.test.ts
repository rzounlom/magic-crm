import { describe, expect, it, vi } from "vitest";

import {
  createLocationRepository,
  type LocationRecord,
} from "@/server/repositories/location-repository";

function location(overrides: Partial<LocationRecord> & Pick<LocationRecord, "id" | "organizationId">): LocationRecord {
  return {
    name: "Main Location",
    slug: "main",
    timezone: "America/New_York",
    active: true,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

describe("createLocationRepository.findById", () => {
  it("queries with both location id and organization id", async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const repository = createLocationRepository({
      location: { findFirst },
    });

    await repository.findById({
      organizationId: "org_a",
      locationId: "loc_b",
    });

    expect(findFirst).toHaveBeenCalledTimes(1);
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        id: "loc_b",
        organizationId: "org_a",
      },
    });
  });

  it("cannot retrieve a location that belongs to another organization", async () => {
    const orgA = "org_a";
    const orgB = "org_b";
    const locationB = location({
      id: "loc_known_to_tenant_a",
      organizationId: orgB,
      name: "Tenant B Location",
    });

    const repository = createLocationRepository({
      location: {
        findFirst: async ({ where }) => {
          if (where.id === locationB.id && where.organizationId === locationB.organizationId) {
            return locationB;
          }

          return null;
        },
      },
    });

    const result = await repository.findById({
      organizationId: orgA,
      locationId: locationB.id,
    });

    expect(result).toBeNull();
  });

  it("returns the location when organization and id both match", async () => {
    const orgA = "org_a";
    const locationA = location({
      id: "loc_a",
      organizationId: orgA,
    });

    const repository = createLocationRepository({
      location: {
        findFirst: async ({ where }) => {
          if (where.id === locationA.id && where.organizationId === locationA.organizationId) {
            return locationA;
          }

          return null;
        },
      },
    });

    await expect(
      repository.findById({
        organizationId: orgA,
        locationId: locationA.id,
      }),
    ).resolves.toEqual(locationA);
  });
});
