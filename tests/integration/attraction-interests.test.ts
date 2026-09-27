import { afterAll, afterEach, describe, expect, it } from "vitest";

import { attractionSelectionLabels } from "@/server/catalog/attraction-interests";
import { InquiryError } from "@/server/errors";
import { attractionInterestIdsFromJson } from "@/server/event-planner/build-event-plans";
import {
  assertSelectablePublicAttractions,
  expandStoredAttractionSelections,
  listSelectablePublicAttractions,
} from "@/server/services/event-plan-service";
import { deleteTestOrganizations } from "../helpers/cleanup-test-organizations";
import { createTestPrismaClient } from "../helpers/test-database";

const db = createTestPrismaClient();
const createdOrganizationIds: string[] = [];

afterEach(async () => {
  await deleteTestOrganizations(db, createdOrganizationIds);
  createdOrganizationIds.length = 0;
});

afterAll(async () => {
  await db.$disconnect();
});

async function createTenant(suffix: string) {
  const organization = await db.organization.create({
    data: {
      name: `Interests ${suffix}`,
      slug: `interests-${suffix}-${crypto.randomUUID()}`,
      timezone: "UTC",
      currency: "USD",
    },
  });
  createdOrganizationIds.push(organization.id);
  return organization;
}

async function storedAttractionLabels(organizationId: string, inquiryId: string) {
  const inquiry = await db.inquiry.findFirstOrThrow({
    where: { id: inquiryId, organizationId },
    select: { attractionInterestIds: true },
  });
  const storedIds = attractionInterestIdsFromJson(inquiry.attractionInterestIds);
  const [knowledge, products, interests] = await Promise.all([
    db.salesKnowledgeItem.findMany({
      where: { organizationId, id: { in: storedIds } },
      select: { id: true, name: true },
    }),
    db.product.findMany({
      where: { organizationId, id: { in: storedIds } },
      select: { id: true, name: true },
    }),
    db.attractionInterest.findMany({
      where: { organizationId, id: { in: storedIds } },
      select: { id: true, label: true },
    }),
  ]);
  return attractionSelectionLabels({ storedIds, knowledge, products, interests });
}

async function seedAttraction(
  organizationId: string,
  categoryId: string,
  slug: string,
  name: string,
  kind = "ATTRACTION",
) {
  return db.product.create({
    data: {
      organizationId,
      categoryId,
      slug,
      name,
      kind,
      audience: "ALL",
      active: true,
    },
  });
}

describe("attraction interests (postgres)", () => {
  it("lists conceptual interests per tenant, rejects foreign or inactive ids, and still reads legacy product ids", async () => {
    const tenant = await createTenant("primary");
    const category = await db.productCategory.create({
      data: { organizationId: tenant.id, slug: "activities", name: "Activities", sortOrder: 0 },
    });
    const axe60 = await seedAttraction(tenant.id, category.id, "axe-throwing-60", "Axe Throwing - 60 Minutes");
    const axe30 = await seedAttraction(tenant.id, category.id, "axe-throwing-30", "Axe Throwing - 30 Minutes");
    const bowling = await seedAttraction(tenant.id, category.id, "bowling-1h", "Bowling - 1 Hour");
    await seedAttraction(tenant.id, category.id, "laser-plex-card", "Laser Plex Card");
    const miniGolf = await seedAttraction(
      tenant.id,
      category.id,
      "have-a-ball-mini-golf",
      "Have a Ball Birthday Party (Mini Golf)",
      "PACKAGE",
    );

    const axe = await db.attractionInterest.create({
      data: {
        organizationId: tenant.id,
        slug: "axe-throwing",
        label: "Axe Throwing",
        displayOrder: 0,
      },
    });
    const bowlingInterest = await db.attractionInterest.create({
      data: {
        organizationId: tenant.id,
        slug: "bowling",
        label: "Bowling",
        displayOrder: 1,
      },
    });
    const miniGolfInterest = await db.attractionInterest.create({
      data: {
        organizationId: tenant.id,
        slug: "mini-golf",
        label: "Mini Golf",
        displayOrder: 2,
      },
    });
    const inactive = await db.attractionInterest.create({
      data: {
        organizationId: tenant.id,
        slug: "closed",
        label: "Closed activity",
        active: false,
        displayOrder: 3,
      },
    });
    await db.attractionInterestProduct.createMany({
      data: [
        { organizationId: tenant.id, attractionInterestId: axe.id, productId: axe60.id, sortOrder: 0 },
        { organizationId: tenant.id, attractionInterestId: axe.id, productId: axe30.id, sortOrder: 1 },
        {
          organizationId: tenant.id,
          attractionInterestId: bowlingInterest.id,
          productId: bowling.id,
          sortOrder: 0,
        },
        {
          organizationId: tenant.id,
          attractionInterestId: miniGolfInterest.id,
          productId: miniGolf.id,
          sortOrder: 0,
        },
        {
          organizationId: tenant.id,
          attractionInterestId: inactive.id,
          productId: bowling.id,
          sortOrder: 0,
        },
      ],
    });

    const other = await db.organization.create({
      data: {
        name: "Interest other",
        slug: `interest-other-${crypto.randomUUID()}`,
        timezone: "UTC",
        currency: "USD",
      },
    });
    createdOrganizationIds.push(other.id);
    const otherCategory = await db.productCategory.create({
      data: { organizationId: other.id, slug: "activities", name: "Activities", sortOrder: 0 },
    });
    const trampoline = await seedAttraction(other.id, otherCategory.id, "trampoline", "Trampoline Park");
    const foreign = await db.attractionInterest.create({
      data: {
        organizationId: other.id,
        slug: "trampoline",
        label: "Trampoline",
        displayOrder: 0,
      },
    });
    await db.attractionInterestProduct.create({
      data: {
        organizationId: other.id,
        attractionInterestId: foreign.id,
        productId: trampoline.id,
        sortOrder: 0,
      },
    });

    const primaryChoices = await listSelectablePublicAttractions(db, tenant.id);
    expect(primaryChoices.map((choice) => choice.name)).toEqual(["Axe Throwing", "Bowling", "Mini Golf"]);
    expect(primaryChoices.map((choice) => choice.name).join(" ")).not.toMatch(/30 Minutes|60 Minutes|1 Hour|Laser Plex/);

    const otherChoices = await listSelectablePublicAttractions(db, other.id);
    expect(otherChoices.map((choice) => choice.name)).toEqual(["Trampoline"]);

    await expect(assertSelectablePublicAttractions(db, tenant.id, [])).resolves.toBeUndefined();
    await expect(assertSelectablePublicAttractions(db, tenant.id, [axe.id])).resolves.toBeUndefined();
    await expect(assertSelectablePublicAttractions(db, tenant.id, [foreign.id])).rejects.toBeInstanceOf(
      InquiryError,
    );
    await expect(assertSelectablePublicAttractions(db, tenant.id, [inactive.id])).rejects.toBeInstanceOf(
      InquiryError,
    );
    await expect(assertSelectablePublicAttractions(db, tenant.id, [axe30.id])).rejects.toBeInstanceOf(
      InquiryError,
    );

    expect(await expandStoredAttractionSelections(db, tenant.id, [axe.id])).toEqual([axe60.id, axe30.id]);
    expect(await expandStoredAttractionSelections(db, tenant.id, [])).toEqual([]);
    expect(await expandStoredAttractionSelections(db, tenant.id, [axe30.id])).toEqual([axe30.id]);

    const legacy = await db.inquiry.create({
      data: {
        organizationId: tenant.id,
        status: "NEW",
        source: "WEB",
        customerFirstName: "Legacy",
        customerEmail: `legacy.${crypto.randomUUID()}@example.com`,
        customerEmailNormalized: `legacy.${crypto.randomUUID()}@example.com`,
        attractionInterestIds: [axe30.id],
      },
    });
    expect(await storedAttractionLabels(tenant.id, legacy.id)).toEqual([
      "Axe Throwing - 30 Minutes",
    ]);

    const current = await db.inquiry.create({
      data: {
        organizationId: tenant.id,
        status: "NEW",
        source: "WEB",
        customerFirstName: "Current",
        customerEmail: `current.${crypto.randomUUID()}@example.com`,
        customerEmailNormalized: `current.${crypto.randomUUID()}@example.com`,
        attractionInterestIds: [axe.id],
      },
    });
    expect(await storedAttractionLabels(tenant.id, current.id)).toEqual(["Axe Throwing"]);
  });
});