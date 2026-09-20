import { afterAll, afterEach, describe, expect, it } from "vitest";

import type { PrismaClient } from "@/generated/prisma/client";

import { loadBookingCatalogDataset } from "@/server/catalog/load-dataset";
import { loadCatalogForProposal } from "@/server/catalog/load-for-proposal";
import { deriveCatalogResourceRequirements } from "@/server/catalog/requirements";
import { ResourceError } from "@/server/errors";
import { importBookingCatalog } from "@/server/services/catalog-import-service";
import { assignExactResourcesForRequirements } from "@/server/services/proposal-hold-service";
import { provisionOrganization } from "@/server/services/provision-organization";
import {
  checkResourceAvailability,
  reserveResourcesInTransaction,
} from "@/server/services/resource-availability-service";
import { PRODUCT_KINDS, PRODUCT_QUANTITY_RULES } from "@/types/catalog";
import type { PlanResourceRequirement } from "@/types/resource-schedule";
import { RESOURCE_QUANTITY_RULES, RESOURCE_RESERVATION_SOURCES, RESOURCE_RESERVATION_STATUSES } from "@/types/resource-schedule";
import { TENANT_ALPHA_DATASET, TENANT_BETA_DATASET } from "../fixtures/tenant-alpha-beta-catalogs";
import { deleteTestOrganizations } from "../helpers/cleanup-test-organizations";
import { createTestPrismaClient } from "../helpers/test-database";

const db = createTestPrismaClient();
const createdOrganizationIds: string[] = [];

const SLOT_DATE = "2026-10-15";
const START = 18 * 60;
const END = 21 * 60;
const WINDOW = { slotDate: SLOT_DATE, startMinute: START, endMinute: END };

afterEach(async () => {
  await deleteTestOrganizations(db, createdOrganizationIds);
  createdOrganizationIds.length = 0;
}, 60_000);

afterAll(async () => {
  await db.$disconnect();
});

async function provisionTenant(suffix: string) {
  const result = await provisionOrganization(
    {
      clerkUserId: `user_comp_${suffix}_${crypto.randomUUID()}`,
      clerkOrganizationId: `clerk_org_comp_${suffix}_${crypto.randomUUID()}`,
      organizationName: `Composite ${suffix}`,
      organizationSlug: `composite-${suffix}-${crypto.randomUUID()}`,
      isClerkOrganizationAdmin: true,
    },
    db,
  );
  createdOrganizationIds.push(result.organizationId);
  return db.organization.findFirstOrThrow({
    where: { id: result.organizationId },
    include: { locations: true },
  });
}

async function seedTypedResources(
  organizationId: string,
  locationId: string,
  slug: string,
  name: string,
  count: number,
  capacity: number,
) {
  const type = await db.resourceType.create({
    data: {
      organizationId,
      locationId,
      slug,
      name,
      inventoryConfigured: true,
      active: true,
    },
  });
  const resources = [];
  for (let i = 1; i <= count; i += 1) {
    resources.push(
      await db.resource.create({
        data: {
          organizationId,
          resourceTypeId: type.id,
          locationId,
          name: count === 1 ? name : `${name} ${i}`,
          displayOrder: i,
          capacity,
          active: true,
        },
      }),
    );
  }
  return { type, resources };
}

function planRequirement(input: {
  productId: string;
  productName: string;
  resourceTypeId: string;
  resourceTypeSlug: string;
  resourceTypeName: string;
  quantityRule: string;
  quantity: number;
  specificResourceId?: string | null;
}): PlanResourceRequirement {
  return {
    knowledgeItemId: input.productId,
    knowledgeItemName: input.productName,
    productId: input.productId,
    resourceTypeId: input.resourceTypeId,
    resourceTypeSlug: input.resourceTypeSlug,
    resourceTypeName: input.resourceTypeName,
    quantityRule: input.quantityRule as PlanResourceRequirement["quantityRule"],
    quantity: input.quantity,
    guestsPerUnit: null,
    durationMinutes: 180,
    inventoryConfigured: true,
    requiresStaffConfiguration: false,
    specificResourceId: input.specificResourceId ?? null,
    locationExclusive: input.quantityRule === RESOURCE_QUANTITY_RULES.LOCATION_EXCLUSIVE,
  };
}

async function seedGenerationsLikeVenue(organizationId: string, locationId: string) {
  const bowling = await seedTypedResources(organizationId, locationId, "bowling-lane", "Bowling Lane", 8, 6);
  const axe = await seedTypedResources(organizationId, locationId, "axe-throwing-lane", "Axe Throwing Lane", 8, 8);
  const skybox = await seedTypedResources(organizationId, locationId, "skybox", "Skybox", 1, 44);
  const mezzanine = await seedTypedResources(organizationId, locationId, "mezzanine", "Mezzanine", 1, 150);
  const fullFacility = await seedTypedResources(organizationId, locationId, "full-facility", "Full Facility", 1, 999);
  const extra = await seedTypedResources(organizationId, locationId, "laser-tag-arena", "Laser Tag Arena", 1, 20);
  const category = await db.productCategory.create({
    data: { organizationId, slug: "exclusive-area-rentals", name: "Exclusive", sortOrder: 1 },
  });
  const mezzanineProduct = await db.product.create({
    data: {
      organizationId,
      locationId,
      categoryId: category.id,
      slug: "mezzanine-rental",
      name: "Mezzanine Exclusive Rental",
      kind: PRODUCT_KINDS.RENTAL,
      audience: "ADULTS",
      durationMinutes: 180,
      active: true,
    },
  });
  const fullProduct = await db.product.create({
    data: {
      organizationId,
      locationId,
      categoryId: category.id,
      slug: "full-facility-rental",
      name: "Full Facility Rental",
      kind: PRODUCT_KINDS.RENTAL,
      audience: "MIXED",
      durationMinutes: 180,
      active: true,
    },
  });
  const bowlingProduct = await db.product.create({
    data: {
      organizationId,
      locationId,
      categoryId: category.id,
      slug: "bowling-open-play",
      name: "Bowling Open Play",
      kind: PRODUCT_KINDS.ATTRACTION,
      audience: "ALL",
      durationMinutes: 60,
      active: true,
    },
  });
  await db.productResourceRequirement.createMany({
    data: [
      {
        organizationId,
        productId: mezzanineProduct.id,
        resourceTypeId: mezzanine.type.id,
        resourceId: mezzanine.resources[0]!.id,
        quantityRule: PRODUCT_QUANTITY_RULES.SPECIFIC_RESOURCE,
        quantity: 1,
        durationMinutes: 180,
        exclusive: true,
      },
      {
        organizationId,
        productId: mezzanineProduct.id,
        resourceTypeId: bowling.type.id,
        quantityRule: PRODUCT_QUANTITY_RULES.ALL_OF_TYPE,
        durationMinutes: 180,
        exclusive: true,
      },
      {
        organizationId,
        productId: mezzanineProduct.id,
        resourceTypeId: axe.type.id,
        quantityRule: PRODUCT_QUANTITY_RULES.FIXED,
        quantity: 7,
        durationMinutes: 180,
      },
      {
        organizationId,
        productId: mezzanineProduct.id,
        resourceTypeId: skybox.type.id,
        resourceId: skybox.resources[0]!.id,
        quantityRule: PRODUCT_QUANTITY_RULES.SPECIFIC_RESOURCE,
        quantity: 1,
        durationMinutes: 180,
        exclusive: true,
      },
      {
        organizationId,
        productId: fullProduct.id,
        resourceTypeId: fullFacility.type.id,
        quantityRule: PRODUCT_QUANTITY_RULES.LOCATION_EXCLUSIVE,
        exclusive: true,
      },
      {
        organizationId,
        productId: bowlingProduct.id,
        resourceTypeId: bowling.type.id,
        quantityRule: PRODUCT_QUANTITY_RULES.FIXED,
        quantity: 1,
        durationMinutes: 60,
      },
    ],
  });
  const mezzanineRequirements = [
    planRequirement({
      productId: mezzanineProduct.id,
      productName: mezzanineProduct.name,
      resourceTypeId: mezzanine.type.id,
      resourceTypeSlug: mezzanine.type.slug,
      resourceTypeName: mezzanine.type.name,
      quantityRule: RESOURCE_QUANTITY_RULES.SPECIFIC_RESOURCE,
      quantity: 1,
      specificResourceId: mezzanine.resources[0]!.id,
    }),
    planRequirement({
      productId: mezzanineProduct.id,
      productName: mezzanineProduct.name,
      resourceTypeId: bowling.type.id,
      resourceTypeSlug: bowling.type.slug,
      resourceTypeName: bowling.type.name,
      quantityRule: RESOURCE_QUANTITY_RULES.ALL_OF_TYPE,
      quantity: bowling.resources.length,
    }),
    planRequirement({
      productId: mezzanineProduct.id,
      productName: mezzanineProduct.name,
      resourceTypeId: axe.type.id,
      resourceTypeSlug: axe.type.slug,
      resourceTypeName: axe.type.name,
      quantityRule: RESOURCE_QUANTITY_RULES.FIXED,
      quantity: 7,
    }),
    planRequirement({
      productId: mezzanineProduct.id,
      productName: mezzanineProduct.name,
      resourceTypeId: skybox.type.id,
      resourceTypeSlug: skybox.type.slug,
      resourceTypeName: skybox.type.name,
      quantityRule: RESOURCE_QUANTITY_RULES.SPECIFIC_RESOURCE,
      quantity: 1,
      specificResourceId: skybox.resources[0]!.id,
    }),
  ];
  const fullFacilityRequirements = [
    planRequirement({
      productId: fullProduct.id,
      productName: fullProduct.name,
      resourceTypeId: fullFacility.type.id,
      resourceTypeSlug: fullFacility.type.slug,
      resourceTypeName: fullFacility.type.name,
      quantityRule: RESOURCE_QUANTITY_RULES.LOCATION_EXCLUSIVE,
      quantity: 1,
    }),
  ];
  const bowlingRequirements = [
    planRequirement({
      productId: bowlingProduct.id,
      productName: bowlingProduct.name,
      resourceTypeId: bowling.type.id,
      resourceTypeSlug: bowling.type.slug,
      resourceTypeName: bowling.type.name,
      quantityRule: RESOURCE_QUANTITY_RULES.FIXED,
      quantity: 1,
    }),
  ];
  return {
    bowling,
    axe,
    skybox,
    mezzanine,
    fullFacility,
    extra,
    mezzanineProduct,
    fullProduct,
    bowlingProduct,
    mezzanineRequirements,
    fullFacilityRequirements,
    bowlingRequirements,
  };
}

async function check(organizationId: string, locationId: string, requirements: PlanResourceRequirement[]) {
  return checkResourceAvailability(db, {
    organizationId,
    locationId,
    date: SLOT_DATE,
    startTime: "18:00",
    durationMinutes: 180,
    resourceRequirements: requirements,
  });
}

async function occupy(
  organizationId: string,
  locationId: string,
  resourceIds: string[],
  extras: { locationExclusive?: boolean; reason?: string } = {},
) {
  await reserveResourcesInTransaction(db, {
    organizationId,
    locationId,
    status: RESOURCE_RESERVATION_STATUSES.BOOKED,
    sourceType: RESOURCE_RESERVATION_SOURCES.MANUAL,
    slotDate: SLOT_DATE,
    startMinute: START,
    endMinute: END,
    resourceIds,
    locationExclusive: extras.locationExclusive,
    reason: extras.reason ?? "seed-occupancy",
  });
}

async function allocate(
  organizationId: string,
  locationId: string,
  requirements: PlanResourceRequirement[],
  reason: string,
) {
  return db.$transaction(async (tx) => {
    const assignments = await assignExactResourcesForRequirements(tx as PrismaClient, {
      organizationId,
      locationId,
      window: WINDOW,
      requirements,
    });
    await tx.resourceReservation.createMany({
      data: assignments.map((assignment) => ({
        organizationId,
        locationId,
        resourceId: assignment.resourceId,
        status: RESOURCE_RESERVATION_STATUSES.HOLD,
        slotDate: new Date(`${SLOT_DATE}T00:00:00.000Z`),
        startMinute: assignment.startMinute,
        endMinute: assignment.endMinute,
        sourceType: RESOURCE_RESERVATION_SOURCES.MANUAL,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        reason,
      })),
    });
    return assignments;
  });
}

async function releaseAll(organizationId: string) {
  await db.resourceReservation.updateMany({
    where: { organizationId, releasedAt: null },
    data: { releasedAt: new Date() },
  });
}

describe("composite resource bundles (postgres)", () => {
  it("resolves Mezzanine and Full Facility from configuration, not product names", async () => {
    const organization = await provisionTenant("venue");
    const locationId = organization.locations[0]!.id;
    const venue = await seedGenerationsLikeVenue(organization.id, locationId);

    expect(venue.mezzanineRequirements.map((row) => row.quantityRule)).toEqual([
      RESOURCE_QUANTITY_RULES.SPECIFIC_RESOURCE,
      RESOURCE_QUANTITY_RULES.ALL_OF_TYPE,
      RESOURCE_QUANTITY_RULES.FIXED,
      RESOURCE_QUANTITY_RULES.SPECIFIC_RESOURCE,
    ]);
    expect(venue.mezzanineRequirements.find((row) => row.resourceTypeSlug === "bowling-lane")?.quantity).toBe(8);
    expect(venue.mezzanineRequirements.find((row) => row.resourceTypeSlug === "axe-throwing-lane")?.quantity).toBe(7);

    expect((await check(organization.id, locationId, venue.mezzanineRequirements)).available).toBe(true);

    await occupy(organization.id, locationId, [venue.bowling.resources[0]!.id]);
    expect((await check(organization.id, locationId, venue.mezzanineRequirements)).available).toBe(false);
    await releaseAll(organization.id);

    await occupy(organization.id, locationId, [venue.axe.resources[0]!.id, venue.axe.resources[1]!.id]);
    expect((await check(organization.id, locationId, venue.mezzanineRequirements)).available).toBe(false);
    await releaseAll(organization.id);

    await occupy(organization.id, locationId, [venue.axe.resources[0]!.id]);
    expect((await check(organization.id, locationId, venue.mezzanineRequirements)).available).toBe(true);
    await releaseAll(organization.id);

    await occupy(organization.id, locationId, [venue.skybox.resources[0]!.id]);
    expect((await check(organization.id, locationId, venue.mezzanineRequirements)).available).toBe(false);
    await releaseAll(organization.id);

    await occupy(organization.id, locationId, [venue.mezzanine.resources[0]!.id]);
    expect((await check(organization.id, locationId, venue.mezzanineRequirements)).available).toBe(false);
    await releaseAll(organization.id);

    const assigned = await allocate(organization.id, locationId, venue.mezzanineRequirements, "mezzanine-hold");
    const assignedIds = new Set(assigned.map((row) => row.resourceId));
    expect(assignedIds.has(venue.mezzanine.resources[0]!.id)).toBe(true);
    expect(assignedIds.has(venue.skybox.resources[0]!.id)).toBe(true);
    expect(venue.bowling.resources.every((row) => assignedIds.has(row.id))).toBe(true);
    expect(venue.axe.resources.filter((row) => assignedIds.has(row.id))).toHaveLength(7);
    expect(venue.axe.resources.filter((row) => !assignedIds.has(row.id))).toHaveLength(1);
    expect((await check(organization.id, locationId, venue.mezzanineRequirements)).available).toBe(false);
    expect((await check(organization.id, locationId, venue.bowlingRequirements)).available).toBe(false);

    await releaseAll(organization.id);
    expect((await check(organization.id, locationId, venue.fullFacilityRequirements)).available).toBe(true);

    await occupy(organization.id, locationId, [venue.bowling.resources[0]!.id]);
    expect((await check(organization.id, locationId, venue.fullFacilityRequirements)).available).toBe(false);
    await releaseAll(organization.id);

    await occupy(organization.id, locationId, [venue.axe.resources[0]!.id]);
    expect((await check(organization.id, locationId, venue.fullFacilityRequirements)).available).toBe(false);
    await releaseAll(organization.id);

    await occupy(organization.id, locationId, [venue.skybox.resources[0]!.id]);
    expect((await check(organization.id, locationId, venue.fullFacilityRequirements)).available).toBe(false);
    await releaseAll(organization.id);

    const exclusive = await allocate(organization.id, locationId, venue.fullFacilityRequirements, "full-facility-hold");
    const exclusiveIds = new Set(exclusive.map((row) => row.resourceId));
    expect(exclusiveIds.size).toBe(
      venue.bowling.resources.length
        + venue.axe.resources.length
        + venue.skybox.resources.length
        + venue.mezzanine.resources.length
        + venue.fullFacility.resources.length
        + venue.extra.resources.length,
    );
    expect((await check(organization.id, locationId, venue.bowlingRequirements)).available).toBe(false);
    expect((await check(organization.id, locationId, venue.mezzanineRequirements)).available).toBe(false);
    expect(
      (
        await check(organization.id, locationId, [
          planRequirement({
            productId: venue.fullProduct.id,
            productName: "Axe",
            resourceTypeId: venue.axe.type.id,
            resourceTypeSlug: venue.axe.type.slug,
            resourceTypeName: venue.axe.type.name,
            quantityRule: RESOURCE_QUANTITY_RULES.FIXED,
            quantity: 1,
          }),
        ])
      ).available,
    ).toBe(false);
    expect(
      (
        await check(organization.id, locationId, [
          planRequirement({
            productId: venue.fullProduct.id,
            productName: "Skybox",
            resourceTypeId: venue.skybox.type.id,
            resourceTypeSlug: venue.skybox.type.slug,
            resourceTypeName: venue.skybox.type.name,
            quantityRule: RESOURCE_QUANTITY_RULES.SPECIFIC_RESOURCE,
            quantity: 1,
            specificResourceId: venue.skybox.resources[0]!.id,
          }),
        ])
      ).available,
    ).toBe(false);

    const locationTwo = await db.location.create({
      data: {
        organizationId: organization.id,
        name: "Second Site",
        slug: `second-${crypto.randomUUID().slice(0, 8)}`,
        timezone: "UTC",
      },
    });
    const locationTwoLane = await db.resource.create({
      data: {
        organizationId: organization.id,
        resourceTypeId: venue.bowling.type.id,
        locationId: locationTwo.id,
          name: "Bowling Lane North 1",
          displayOrder: 90,
        capacity: 6,
        active: true,
      },
    });
    expect(
      (
        await check(organization.id, locationTwo.id, [
          planRequirement({
            productId: venue.bowlingProduct.id,
            productName: venue.bowlingProduct.name,
            resourceTypeId: venue.bowling.type.id,
            resourceTypeSlug: venue.bowling.type.slug,
            resourceTypeName: venue.bowling.type.name,
            quantityRule: RESOURCE_QUANTITY_RULES.FIXED,
            quantity: 1,
          }),
        ])
      ).available,
    ).toBe(true);

    await releaseAll(organization.id);
    await occupy(organization.id, locationTwo.id, [locationTwoLane.id]);
    expect((await check(organization.id, locationId, venue.fullFacilityRequirements)).available).toBe(true);
    await db.resource.update({
      where: { id: venue.bowling.resources[7]!.id },
      data: { active: false },
    });
    expect((await check(organization.id, locationId, venue.mezzanineRequirements)).available).toBe(true);
    await occupy(organization.id, locationId, [venue.bowling.resources[0]!.id]);
    expect((await check(organization.id, locationId, venue.mezzanineRequirements)).available).toBe(false);
  }, 120_000);

  it("keeps Full Facility isolated across tenants", async () => {
    const tenantA = await provisionTenant("iso-a");
    const tenantB = await provisionTenant("iso-b");
    const locationA = tenantA.locations[0]!.id;
    const locationB = tenantB.locations[0]!.id;
    const venueA = await seedGenerationsLikeVenue(tenantA.id, locationA);
    const venueB = await seedGenerationsLikeVenue(tenantB.id, locationB);
    await allocate(tenantA.id, locationA, venueA.fullFacilityRequirements, "tenant-a-exclusive");
    expect((await check(tenantA.id, locationA, venueA.bowlingRequirements)).available).toBe(false);
    expect((await check(tenantB.id, locationB, venueB.bowlingRequirements)).available).toBe(true);
    expect((await check(tenantB.id, locationB, venueB.fullFacilityRequirements)).available).toBe(true);
  }, 60_000);

  it("imports Mezzanine and Full Facility requirements idempotently from tenant data", async () => {
    const organization = await provisionTenant("import");
    const dataset = loadBookingCatalogDataset();
    const first = await importBookingCatalog(db, { organizationSlug: organization.slug, dataset });
    expect(first.productsCreated).toBeGreaterThan(0);
    const firstMezzanine = await db.product.findFirstOrThrow({
      where: { organizationId: organization.id, slug: "mezzanine-sun-thu" },
      include: { resourceRequirements: { include: { resourceType: true, resource: true } } },
    });
    expect(firstMezzanine.resourceRequirements).toHaveLength(4);
    expect(
      firstMezzanine.resourceRequirements.map((row) => `${row.resourceType.slug}:${row.quantityRule}:${row.quantity ?? ""}`).sort(),
    ).toEqual([
      "axe-throwing-lane:FIXED:7",
      "bowling-lane:ALL_OF_TYPE:",
      "mezzanine:SPECIFIC_RESOURCE:1",
      "skybox:SPECIFIC_RESOURCE:1",
    ]);
    expect(firstMezzanine.resourceRequirements.find((row) => row.resourceType.slug === "mezzanine")?.resource?.name).toBe(
      "Mezzanine",
    );
    expect(firstMezzanine.resourceRequirements.find((row) => row.resourceType.slug === "skybox")?.resource?.name).toBe(
      "Skybox",
    );

    const firstFull = await db.product.findFirstOrThrow({
      where: { organizationId: organization.id, slug: "full-facility-before-4-sun-fri" },
      include: { resourceRequirements: { include: { resourceType: true } } },
    });
    expect(firstFull.resourceRequirements).toHaveLength(1);
    expect(firstFull.resourceRequirements[0]?.quantityRule).toBe(PRODUCT_QUANTITY_RULES.LOCATION_EXCLUSIVE);

    const second = await importBookingCatalog(db, { organizationSlug: organization.slug, dataset });
    expect(second.productsCreated).toBe(0);
    const secondMezzanine = await db.productResourceRequirement.count({
      where: { organizationId: organization.id, productId: firstMezzanine.id },
    });
    const secondFull = await db.productResourceRequirement.count({
      where: { organizationId: organization.id, productId: firstFull.id },
    });
    expect(secondMezzanine).toBe(4);
    expect(secondFull).toBe(1);

    const locationId = organization.locations[0]!.id;
    const catalog = await loadCatalogForProposal(db, organization.id, locationId);
    const mezzaninePlan = deriveCatalogResourceRequirements({
      productIds: [firstMezzanine.id],
      guestCount: 40,
      durationMinutes: 180,
      requirements: catalog.resourceRequirements,
    });
    expect(mezzaninePlan).toHaveLength(4);
    expect(mezzaninePlan.find((row) => row.resourceTypeSlug === "bowling-lane")?.quantity).toBe(8);
    expect(mezzaninePlan.find((row) => row.resourceTypeSlug === "axe-throwing-lane")?.quantity).toBe(7);
    expect((await check(organization.id, locationId, mezzaninePlan)).available).toBe(true);

    const bowlingType = await db.resourceType.findFirstOrThrow({
      where: { organizationId: organization.id, slug: "bowling-lane" },
      include: { resources: { orderBy: { displayOrder: "asc" } } },
    });
    await occupy(organization.id, locationId, [bowlingType.resources[0]!.id]);
    expect((await check(organization.id, locationId, mezzaninePlan)).available).toBe(false);

    const fullPlan = deriveCatalogResourceRequirements({
      productIds: [firstFull.id],
      guestCount: 40,
      durationMinutes: 180,
      requirements: catalog.resourceRequirements,
    });
    expect(fullPlan.some((row) => row.locationExclusive)).toBe(true);
    expect((await check(organization.id, locationId, fullPlan)).available).toBe(false);
  }, 120_000);

  it("uses the same composite engine for a non-Generations tenant configuration", async () => {
    const alpha = await provisionTenant("alpha");
    const beta = await provisionTenant("beta");
    await importBookingCatalog(db, { organizationSlug: alpha.slug, dataset: TENANT_ALPHA_DATASET });
    await importBookingCatalog(db, { organizationSlug: beta.slug, dataset: TENANT_BETA_DATASET });

    const alphaLocation = alpha.locations[0]!.id;
    const betaLocation = beta.locations[0]!.id;
    const alphaCatalog = await loadCatalogForProposal(db, alpha.id, alphaLocation);
    const buyout = alphaCatalog.products.find((row) => row.slug === "upstairs-buyout");
    expect(buyout).toBeTruthy();
    const buyoutPlan = deriveCatalogResourceRequirements({
      productIds: [buyout!.id],
      guestCount: 20,
      durationMinutes: 120,
      requirements: alphaCatalog.resourceRequirements,
    });
    expect(buyoutPlan.map((row) => `${row.resourceTypeSlug}:${row.quantityRule}:${row.quantity}`).sort()).toEqual([
      "axe-bay:FIXED:4",
      "bowling-lane:ALL_OF_TYPE:8",
      "private-lounge:SPECIFIC_RESOURCE:1",
    ]);
    expect((await check(alpha.id, alphaLocation, buyoutPlan)).available).toBe(true);

    const alphaLanes = await db.resource.findMany({
      where: { organizationId: alpha.id, resourceType: { slug: "bowling-lane" } },
    });
    await occupy(alpha.id, alphaLocation, [alphaLanes[0]!.id]);
    expect((await check(alpha.id, alphaLocation, buyoutPlan)).available).toBe(false);

    const betaCatalog = await loadCatalogForProposal(db, beta.id, betaLocation);
    const venue = betaCatalog.products.find((row) => row.slug === "full-venue");
    expect(venue).toBeTruthy();
    const venuePlan = deriveCatalogResourceRequirements({
      productIds: [venue!.id],
      guestCount: 20,
      durationMinutes: 180,
      requirements: betaCatalog.resourceRequirements,
    });
    expect(venuePlan[0]?.locationExclusive).toBe(true);
    expect((await check(beta.id, betaLocation, venuePlan)).available).toBe(true);
    expect((await check(beta.id, betaLocation, buyoutPlan)).validated).toBe(false);
  }, 60_000);

  it("never overallocates under Full Facility and Mezzanine races", async () => {
    const organization = await provisionTenant("race");
    const locationId = organization.locations[0]!.id;
    const venue = await seedGenerationsLikeVenue(organization.id, locationId);

    const exclusiveVsBowling = await Promise.allSettled([
      allocate(organization.id, locationId, venue.fullFacilityRequirements, "race-exclusive"),
      occupy(organization.id, locationId, [venue.bowling.resources[0]!.id], { reason: "race-bowling" }),
    ]);
    expect(exclusiveVsBowling.filter((row) => row.status === "fulfilled")).toHaveLength(1);
    expect(exclusiveVsBowling.filter((row) => row.status === "rejected")).toHaveLength(1);
    const live = await db.resourceReservation.findMany({
      where: { organizationId: organization.id, releasedAt: null },
    });
    const bowlingHeld = live.some((row) => row.resourceId === venue.bowling.resources[0]!.id);
    expect(bowlingHeld).toBe(true);
    if (live.some((row) => row.reason === "race-exclusive")) {
      expect(live).toHaveLength(
        venue.bowling.resources.length
          + venue.axe.resources.length
          + venue.skybox.resources.length
          + venue.mezzanine.resources.length
          + venue.fullFacility.resources.length
          + venue.extra.resources.length,
      );
    } else {
      expect(live).toHaveLength(1);
    }

    await releaseAll(organization.id);
    const exclusiveVsMezzanine = await Promise.allSettled([
      allocate(organization.id, locationId, venue.fullFacilityRequirements, "race-exclusive-2"),
      allocate(organization.id, locationId, venue.mezzanineRequirements, "race-mezzanine"),
    ]);
    expect(exclusiveVsMezzanine.filter((row) => row.status === "fulfilled")).toHaveLength(1);
    expect(exclusiveVsMezzanine.filter((row) => row.status === "rejected")).toHaveLength(1);

    await releaseAll(organization.id);
    await occupy(organization.id, locationId, [venue.axe.resources[0]!.id], { reason: "pre-axe" });
    const mezzanineVsAxe = await Promise.allSettled([
      allocate(organization.id, locationId, venue.mezzanineRequirements, "race-mezzanine-axe"),
      occupy(organization.id, locationId, [venue.axe.resources[1]!.id], { reason: "race-single-axe" }),
    ]);
    expect(mezzanineVsAxe.filter((row) => row.status === "fulfilled")).toHaveLength(1);
    const axeHeld = await db.resourceReservation.count({
      where: {
        organizationId: organization.id,
        releasedAt: null,
        resourceId: { in: venue.axe.resources.map((row) => row.id) },
      },
    });
    expect(axeHeld).toBeLessThanOrEqual(8);
    expect(axeHeld).toBeGreaterThanOrEqual(2);

    await releaseAll(organization.id);
    await occupy(organization.id, locationId, [venue.bowling.resources[0]!.id], { reason: "block-lane" });
    await expect(allocate(organization.id, locationId, venue.mezzanineRequirements, "partial-mezzanine")).rejects.toBeInstanceOf(
      ResourceError,
    );
    expect(
      await db.resourceReservation.count({
        where: { organizationId: organization.id, releasedAt: null, reason: "partial-mezzanine" },
      }),
    ).toBe(0);
  }, 120_000);
});
