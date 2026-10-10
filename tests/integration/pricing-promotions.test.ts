import { afterAll, afterEach, describe, expect, it } from "vitest";

import { applyPromotions, PROMOTION_TYPES } from "@/server/catalog/promotions";
import { priceProduct } from "@/server/catalog/pricing";
import { loadCatalogForProposal } from "@/server/catalog/load-for-proposal";
import { importBookingCatalog } from "@/server/services/catalog-import-service";
import { provisionOrganization } from "@/server/services/provision-organization";
import { PRODUCT_PRICE_STRATEGIES } from "@/types/catalog";
import type { BookingCatalogDataset } from "@/server/catalog/dataset";
import { TENANT_ALPHA_DATASET } from "../fixtures/tenant-alpha-beta-catalogs";
import { deleteTestOrganizations } from "../helpers/cleanup-test-organizations";
import { createTestPrismaClient } from "../helpers/test-database";

const db = createTestPrismaClient();
const createdOrganizationIds: string[] = [];

afterEach(async () => {
  await deleteTestOrganizations(db, createdOrganizationIds);
  createdOrganizationIds.length = 0;
}, 60_000);

afterAll(async () => {
  await db.$disconnect();
});

describe("pricing promotions and weekendDays", () => {
  it("persists tenant weekendDays and promotions with org isolation and snapshot stability", async () => {
    const fridayCatalog: BookingCatalogDataset = {
      ...TENANT_ALPHA_DATASET,
      promotions: [
        {
          slug: "axe-half",
          name: "Axe Half Off",
          type: "PERCENTAGE" as const,
          version: 1,
          active: true,
          stackable: false,
          stackingGroup: null,
          priority: 10,
          allowsFurtherDiscount: false,
          productSlugs: ["axe-throwing"],
          categorySlugs: null,
          daysOfWeek: null,
          localStartMinute: null,
          localEndMinute: null,
          effectiveFrom: null,
          effectiveTo: null,
          minQuantity: null,
          maxQuantity: null,
          locationSlug: null,
          payload: { percent: 50 },
        },
      ],
      products: TENANT_ALPHA_DATASET.products.map((product) =>
        product.slug === "bowling-1h"
          ? {
              ...product,
              prices: product.prices.map((price) =>
                price.strategy === PRODUCT_PRICE_STRATEGIES.PER_LANE_WEEKDAY_WEEKEND
                  ? { ...price, weekendDays: ["fri", "sat", "sun"] }
                  : price,
              ),
            }
          : product,
      ),
    };

    const provisioned = await provisionOrganization(
      {
        clerkUserId: `user_promo_${crypto.randomUUID()}`,
        clerkOrganizationId: `clerk_org_promo_${crypto.randomUUID()}`,
        organizationName: "Promo Tenant",
        organizationSlug: `promo-${crypto.randomUUID()}`,
        isClerkOrganizationAdmin: true,
      },
      db,
    );
    createdOrganizationIds.push(provisioned.organizationId);
    const other = await provisionOrganization(
      {
        clerkUserId: `user_promo_other_${crypto.randomUUID()}`,
        clerkOrganizationId: `clerk_org_promo_other_${crypto.randomUUID()}`,
        organizationName: "Other Promo Tenant",
        organizationSlug: `promo-other-${crypto.randomUUID()}`,
        isClerkOrganizationAdmin: true,
      },
      db,
    );
    createdOrganizationIds.push(other.organizationId);

    const organization = await db.organization.findFirstOrThrow({
      where: { id: provisioned.organizationId },
      select: { id: true, slug: true },
    });
    await importBookingCatalog(db, { organizationSlug: organization.slug, dataset: fridayCatalog });
    await importBookingCatalog(db, {
      organizationSlug: (await db.organization.findFirstOrThrow({ where: { id: other.organizationId } })).slug,
      dataset: TENANT_ALPHA_DATASET,
    });

    const loaded = await loadCatalogForProposal(db, organization.id);
    const otherLoaded = await loadCatalogForProposal(db, other.organizationId);
    const bowling = loaded.products.find((row) => row.slug === "bowling-1h");
    const otherBowling = otherLoaded.products.find((row) => row.slug === "bowling-1h");
    expect(bowling?.prices[0]?.weekendDays).toEqual(["fri", "sat", "sun"]);
    expect(otherBowling?.prices[0]?.weekendDays ?? null).toBeNull();

    const friday = priceProduct(bowling!, {
      guestCount: 6,
      eventDate: "2026-10-16",
      startTime: "18:00",
      durationMinutes: 60,
      organizationId: organization.id,
    });
    const otherFriday = priceProduct(otherBowling!, {
      guestCount: 6,
      eventDate: "2026-10-16",
      startTime: "18:00",
      durationMinutes: 60,
      organizationId: other.organizationId,
    });
    expect(friday.totalCents).toBe(4000);
    expect(otherFriday.totalCents).toBe(3000);

    expect(loaded.promotions).toHaveLength(1);
    expect(otherLoaded.promotions).toHaveLength(0);

    const axe = loaded.products.find((row) => row.slug === "axe-throwing")!;
    const base = priceProduct(axe, {
      guestCount: 2,
      eventDate: "2026-10-15",
      startTime: "18:00",
      durationMinutes: 60,
      organizationId: organization.id,
    });
    const promoted = applyPromotions({
      quotes: [base],
      context: {
        guestCount: 2,
        eventDate: "2026-10-15",
        startTime: "18:00",
        durationMinutes: 60,
        organizationId: organization.id,
      },
      promotions: loaded.promotions,
    });
    expect(promoted.quotes[0]?.totalCents).toBe(2500);
    expect(promoted.applied[0]?.type).toBe(PROMOTION_TYPES.PERCENTAGE);
    const snapshottedTotal = promoted.quotes[0]!.totalCents;

    await db.pricingPromotion.updateMany({
      where: { organizationId: organization.id, slug: "axe-half" },
      data: { active: false, version: 2, payload: { percent: 10 } },
    });
    const reloaded = await loadCatalogForProposal(db, organization.id);
    expect(reloaded.promotions[0]?.active).toBe(false);
    expect(snapshottedTotal).toBe(2500);
  }, 90_000);
});
