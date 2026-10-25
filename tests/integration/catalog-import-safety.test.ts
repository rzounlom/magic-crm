import { afterAll, afterEach, describe, expect, it } from "vitest";

import { createMemoryRateLimiter } from "@/lib/ai/rate-limiter";
import { readEventPlanPayload } from "@/lib/event-planner/payload";
import { loadBookingCatalogDataset } from "@/server/catalog/load-dataset";
import { importBookingCatalog } from "@/server/services/catalog-import-service";
import { createPublicInquiry } from "@/server/services/inquiry-service";
import { provisionOrganization } from "@/server/services/provision-organization";
import { PRODUCT_KINDS, PRODUCT_PRICE_STRATEGIES } from "@/types/catalog";
import { EVENT_PLAN_KINDS } from "@/types/inquiry";
import { EVENT_PLAN_TIERS } from "@/types/event-planner";
import { TENANT_ALPHA_DATASET, TENANT_BETA_DATASET } from "../fixtures/tenant-alpha-beta-catalogs";
import { deleteTestOrganizations } from "../helpers/cleanup-test-organizations";
import { createTestPrismaClient } from "../helpers/test-database";
import { futureEventDateOnWeekday } from "../helpers/future-event-date";

const db = createTestPrismaClient();
const createdOrganizationIds: string[] = [];
const unlimitedLimiter = createMemoryRateLimiter();
const EVENT_DATE = futureEventDateOnWeekday("thu", 28);

afterEach(async () => {
  await deleteTestOrganizations(db, createdOrganizationIds);
  createdOrganizationIds.length = 0;
}, 60_000);

afterAll(async () => {
  await db.$disconnect();
});

async function provision(label: string) {
  const result = await provisionOrganization(
    {
      clerkUserId: `user_imp_${label}_${crypto.randomUUID()}`,
      clerkOrganizationId: `clerk_org_imp_${label}_${crypto.randomUUID()}`,
      organizationName: `Import ${label}`,
      organizationSlug: `import-${label}-${crypto.randomUUID()}`,
      isClerkOrganizationAdmin: true,
    },
    db,
  );
  createdOrganizationIds.push(result.organizationId);
  return db.organization.findFirstOrThrow({ where: { id: result.organizationId } });
}

function cloneAlpha() {
  return structuredClone(TENANT_ALPHA_DATASET);
}

async function createCustomProduct(organizationId: string, slug: string, amountCents: number) {
  const category = await db.productCategory.findFirstOrThrow({
    where: { organizationId, slug: "food" },
  });
  const product = await db.product.create({
    data: {
      organizationId,
      categoryId: category.id,
      slug,
      name: "Custom Party Pack",
      kind: PRODUCT_KINDS.FOOD,
      audience: "ALL",
      active: true,
      sortOrder: 90,
    },
  });
  const price = await db.productPrice.create({
    data: {
      organizationId,
      productId: product.id,
      strategy: PRODUCT_PRICE_STRATEGIES.FOOD_FIXED_SET,
      amountCents,
      unitLabel: "pack",
    },
  });
  return { product, price };
}

function intake(slug: string, extras: Record<string, unknown> = {}) {
  return {
    organizationSlug: slug,
    rateLimitKey: `${slug}:${crypto.randomUUID()}`,
    firstName: "Ada",
    lastName: "Lovelace",
    email: `ada.${crypto.randomUUID()}@example.com`,
    eventType: "Birthday Party",
    preferredDate: EVENT_DATE,
    startTime: "18:00",
    guestCount: 20,
    guestMix: "mostly_children",
    desiredDurationMinutes: 180,
    budgetBand: "1500_3000" as const,
    eventGoal: "Celebration",
    diningPreference: "pizza_light",
    spacePreference: "no_preference",
    attractionInterestIds: [] as string[],
    attractionMode: "recommend",
    submissionId: `sub_${crypto.randomUUID()}`,
    ...extras,
  };
}

describe("safe catalog import (postgres)", () => {
  it("dry-run reports changes without writing", async () => {
    const organization = await provision("dry");
    const preview = await importBookingCatalog(db, {
      organizationSlug: organization.slug,
      dataset: TENANT_ALPHA_DATASET,
      dryRun: true,
    });
    expect(preview.dryRun).toBe(true);
    expect(preview.applied).toBe(false);
    expect(preview.products.created.length).toBeGreaterThan(0);
    expect(await db.product.count({ where: { organizationId: organization.id } })).toBe(0);
    expect((await db.organization.findFirstOrThrow({ where: { id: organization.id } })).depositPercent).toBe(30);
  }, 60_000);

  it("preserves tenant-managed records, isolates organizations, and stays idempotent", async () => {
    const orgA = await provision("alpha");
    const orgB = await provision("beta");
    await importBookingCatalog(db, { organizationSlug: orgA.slug, dataset: TENANT_ALPHA_DATASET });
    await importBookingCatalog(db, { organizationSlug: orgB.slug, dataset: TENANT_BETA_DATASET });

    const custom = await createCustomProduct(orgA.id, "custom-party-pack", 7777);
    const bowlingA = await db.product.findFirstOrThrow({
      where: { organizationId: orgA.id, slug: "bowling-1h" },
      include: { prices: true, resourceRequirements: true },
    });
    const snapshotB = {
      products: await db.product.findMany({
        where: { organizationId: orgB.id },
        include: { prices: true },
        orderBy: { slug: "asc" },
      }),
      profiles: await db.recommendationProfile.findMany({
        where: { organizationId: orgB.id },
        orderBy: { audience: "asc" },
      }),
      deposit: (await db.organization.findFirstOrThrow({ where: { id: orgB.id } })).depositPercent,
    };

    const quote = await createPublicInquiry(db, intake(orgA.slug), undefined, unlimitedLimiter);
    const originalPlans = await db.eventPlanRecommendation.findMany({
      where: { organizationId: orgA.id, inquiryId: quote.inquiryId, kind: EVENT_PLAN_KINDS.RECOMMENDATION },
    });
    expect(originalPlans.length).toBeGreaterThan(0);
    const originalTotals = originalPlans.map((row) => row.estimatedTotalCents);

    const updated = cloneAlpha();
    const pizza = updated.products.find((row) => row.slug === "pizza-combo");
    if (!pizza) {
      throw new Error("Expected pizza-combo in the alpha dataset.");
    }
    pizza.name = "Pizza Combo Updated";
    pizza.prices = pizza.prices.map((price) => ({ ...price, amountCents: price.amountCents + 100 }));

    const firstUpdate = await importBookingCatalog(db, { organizationSlug: orgA.slug, dataset: updated });
    expect(firstUpdate.applied).toBe(true);
    expect(firstUpdate.products.updated).toContain("pizza-combo");
    expect(firstUpdate.products.preserved).toContain("custom-party-pack");
    expect(firstUpdate.pricing.preserved).toContain("custom-party-pack");

    const customAfter = await db.product.findFirstOrThrow({
      where: { organizationId: orgA.id, id: custom.product.id },
      include: { prices: true },
    });
    expect(customAfter.name).toBe("Custom Party Pack");
    expect(customAfter.prices).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: custom.price.id, amountCents: 7777 })]),
    );

    const bowlingAfter = await db.product.findFirstOrThrow({
      where: { organizationId: orgA.id, slug: "bowling-1h" },
      include: { prices: true, resourceRequirements: true },
    });
    expect(bowlingAfter.prices.map((row) => row.amountCents)).toEqual(bowlingA.prices.map((row) => row.amountCents));
    expect(bowlingAfter.resourceRequirements).toHaveLength(bowlingA.resourceRequirements.length);

    const pizzaAfter = await db.product.findFirstOrThrow({
      where: { organizationId: orgA.id, slug: "pizza-combo" },
      include: { prices: true },
    });
    expect(pizzaAfter.name).toBe("Pizza Combo Updated");
    expect(pizzaAfter.prices[0]?.amountCents).toBe((TENANT_ALPHA_DATASET.products.find((row) => row.slug === "pizza-combo")?.prices[0]?.amountCents ?? 0) + 100);

    const productsB = await db.product.findMany({
      where: { organizationId: orgB.id },
      include: { prices: true },
      orderBy: { slug: "asc" },
    });
    expect(productsB.map((row) => ({ slug: row.slug, name: row.name, prices: row.prices.map((price) => price.amountCents) }))).toEqual(
      snapshotB.products.map((row) => ({
        slug: row.slug,
        name: row.name,
        prices: row.prices.map((price) => price.amountCents),
      })),
    );
    expect((await db.organization.findFirstOrThrow({ where: { id: orgB.id } })).depositPercent).toBe(snapshotB.deposit);

    const rereadPlans = await db.eventPlanRecommendation.findMany({
      where: { organizationId: orgA.id, inquiryId: quote.inquiryId, kind: EVENT_PLAN_KINDS.RECOMMENDATION },
    });
    expect(rereadPlans.map((row) => row.estimatedTotalCents)).toEqual(originalTotals);

    const second = await importBookingCatalog(db, { organizationSlug: orgA.slug, dataset: updated });
    expect(second.products.created).toEqual([]);
    expect(second.products.updated).toEqual([]);
    expect(second.pricing.updated).toEqual([]);
    expect(second.pricing.created).toEqual([]);
  }, 90_000);

  it("rolls back a failed import so the tenant catalog is unchanged", async () => {
    const organization = await provision("rollback");
    await importBookingCatalog(db, { organizationSlug: organization.slug, dataset: TENANT_ALPHA_DATASET });
    const before = await db.product.findMany({
      where: { organizationId: organization.id },
      include: { prices: true },
      orderBy: { slug: "asc" },
    });

    const updated = cloneAlpha();
    const pizza = updated.products.find((row) => row.slug === "pizza-combo");
    if (!pizza) {
      throw new Error("Expected pizza-combo in the alpha dataset.");
    }
    pizza.name = "Should Not Persist";

    await expect(
      importBookingCatalog(db, {
        organizationSlug: organization.slug,
        dataset: updated,
        interruptAfterStep: "products",
      }),
    ).rejects.toThrow(/interrupted after "products"/);

    const after = await db.product.findMany({
      where: { organizationId: organization.id },
      include: { prices: true },
      orderBy: { slug: "asc" },
    });
    expect(after.map((row) => ({ slug: row.slug, name: row.name }))).toEqual(
      before.map((row) => ({ slug: row.slug, name: row.name })),
    );
    expect(after.some((row) => row.name === "Should Not Persist")).toBe(false);
  }, 60_000);

  it("imports the Generations dataset into an isolated tenant with the dining ladder", async () => {
    const organization = await provision("generations");
    const other = await provision("other");
    await importBookingCatalog(db, { organizationSlug: other.slug, dataset: TENANT_BETA_DATASET });
    const otherCount = await db.product.count({ where: { organizationId: other.id } });

    const imported = await importBookingCatalog(db, {
      organizationSlug: organization.slug,
      dataset: loadBookingCatalogDataset(),
    });
    expect(imported.productsCreated).toBeGreaterThan(0);
    expect(await db.product.count({ where: { organizationId: other.id } })).toBe(otherCount);

    const pizza = await db.product.findFirstOrThrow({
      where: { organizationId: organization.id, slug: "pizza-pitcher-combo" },
      include: { prices: true, servings: true },
    });
    expect(pizza.name).toBe("Pizza & Pitcher Combination");
    expect(pizza.intakeDeclarations).not.toEqual(expect.objectContaining({ containsAlcohol: true }));
    expect(pizza.servings[0]).toEqual(expect.objectContaining({ servesMin: 4, servesMax: 5 }));

    async function diningSlugs(guestMix: string) {
      const created = await createPublicInquiry(
        db,
        intake(organization.slug, { guestMix, diningPreference: "not_sure" }),
        undefined,
        unlimitedLimiter,
      );
      const plans = await db.eventPlanRecommendation.findMany({
        where: { organizationId: organization.id, inquiryId: created.inquiryId, kind: EVENT_PLAN_KINDS.RECOMMENDATION },
      });
      return Object.fromEntries(
        plans.map((row) => [
          row.tier,
          [...new Set((readEventPlanPayload(row.payload).lineItems ?? []).map((item) => item.slug))],
        ]),
      );
    }

    for (const guestMix of ["mostly_adults", "mostly_children", "mixed_ages"]) {
      const byTier = await diningSlugs(guestMix);
      expect(byTier[EVENT_PLAN_TIERS.BUDGET]).toContain("pizza-pitcher-combo");
      expect(byTier[EVENT_PLAN_TIERS.BEST_FIT]).toContain("slider-bar");
      expect(byTier[EVENT_PLAN_TIERS.PREMIUM]).toContain("smokehouse-bbq");
    }
  }, 90_000);
});
