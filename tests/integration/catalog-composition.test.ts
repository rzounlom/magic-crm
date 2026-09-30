import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { Prisma } from "@/generated/prisma/client";
import { createMemoryRateLimiter } from "@/lib/ai/rate-limiter";
import { readEventPlanPayload } from "@/lib/event-planner/payload";
import { loadBookingCatalogDataset } from "@/server/catalog/load-dataset";
import { importBookingCatalog } from "@/server/services/catalog-import-service";
import { createPublicInquiry } from "@/server/services/inquiry-service";
import { provisionOrganization } from "@/server/services/provision-organization";
import { EVENT_PLAN_KINDS } from "@/types/inquiry";
import { EVENT_PLAN_TIERS } from "@/types/event-planner";
import { tenantBetaCompositionDataset } from "../fixtures/tenant-alpha-beta-catalogs";
import { deleteTestOrganizations } from "../helpers/cleanup-test-organizations";
import { createTestPrismaClient } from "../helpers/test-database";

const db = createTestPrismaClient();
const createdOrganizationIds: string[] = [];
const unlimitedLimiter = createMemoryRateLimiter();
const GENERATIONS_ONLY = [
  "fajita-bar",
  "slider-bar",
  "smokehouse-bbq",
  "axe-throwing-30",
  "axe-throwing-60",
  "lower-event-room",
  "skybox",
  "beer-wall",
  "unlimited-arcade-1h",
];

type Tenant = { organizationId: string; slug: string };

let generations: Tenant;
let beta: Tenant;
let axeAndBowlingIds: string[] = [];

async function provision(label: string): Promise<Tenant> {
  const provisioned = await provisionOrganization(
    {
      clerkUserId: `user_comp_${label}_${crypto.randomUUID()}`,
      clerkOrganizationId: `clerk_org_comp_${label}_${crypto.randomUUID()}`,
      organizationName: `Composition ${label}`,
      organizationSlug: `comp-${label}-${crypto.randomUUID()}`,
      isClerkOrganizationAdmin: true,
    },
    db,
  );
  createdOrganizationIds.push(provisioned.organizationId);
  const organization = await db.organization.findFirstOrThrow({ where: { id: provisioned.organizationId } });
  return { organizationId: organization.id, slug: organization.slug };
}

async function planSlugs(organizationId: string, inquiryId: string, tier: string) {
  const plan = await db.eventPlanRecommendation.findFirstOrThrow({
    where: { organizationId, inquiryId, kind: EVENT_PLAN_KINDS.RECOMMENDATION, tier },
  });
  const payload = readEventPlanPayload(plan.payload);
  return {
    plan,
    payload,
    slugs: [...new Set((payload.lineItems ?? []).map((row) => row.slug))],
  };
}

beforeAll(async () => {
  generations = await provision("gen");
  await importBookingCatalog(db, {
    organizationSlug: generations.slug,
    dataset: loadBookingCatalogDataset(),
  });
  const interests = await db.attractionInterest.findMany({
    where: { organizationId: generations.organizationId, slug: { in: ["axe-throwing", "bowling"] } },
    select: { id: true, slug: true },
  });
  axeAndBowlingIds = ["axe-throwing", "bowling"].map((slug) => interests.find((row) => row.slug === slug)?.id ?? "");

  beta = await provision("beta");
  await importBookingCatalog(db, {
    organizationSlug: beta.slug,
    dataset: tenantBetaCompositionDataset(),
  });
}, 60_000);

afterAll(async () => {
  await deleteTestOrganizations(db, createdOrganizationIds);
  await db.$disconnect();
}, 60_000);

describe("recommendation composition snapshots (postgres)", () => {
  it("persists distinct Good, Recommended, and Premium compositions for a flexible adult party", async () => {
    expect(axeAndBowlingIds.every((id) => id.length > 0)).toBe(true);
    const created = await createPublicInquiry(
      db,
      {
        organizationSlug: generations.slug,
        rateLimitKey: `comp-a:${crypto.randomUUID()}`,
        firstName: "Casey",
        lastName: "Nguyen",
        email: `comp.flex.${crypto.randomUUID()}@example.com`,
        eventType: "Birthday Party",
        preferredDate: "2026-11-04",
        startTime: "14:00",
        guestCount: 20,
        guestMix: "mostly_adults",
        foodPreference: "WANTS_FOOD",
        privateSpacePreference: "YES",
        budgetPreference: "FLEXIBLE",
        attractionMode: "known",
        attractionInterestIds: axeAndBowlingIds,
        submissionId: `sub_${crypto.randomUUID()}`,
      },
      undefined,
      unlimitedLimiter,
    );
    const good = await planSlugs(generations.organizationId, created.inquiryId, EVENT_PLAN_TIERS.BUDGET);
    const recommended = await planSlugs(generations.organizationId, created.inquiryId, EVENT_PLAN_TIERS.BEST_FIT);
    const premium = await planSlugs(generations.organizationId, created.inquiryId, EVENT_PLAN_TIERS.PREMIUM);

    expect(good.slugs).toEqual(expect.arrayContaining(["axe-throwing-30", "bowling-1h", "fajita-bar", "lower-event-room"]));
    expect(good.slugs).not.toEqual(expect.arrayContaining(["axe-throwing-60", "unlimited-arcade-1h", "skybox", "beer-wall"]));
    expect(recommended.slugs).toEqual(expect.arrayContaining(["axe-throwing-60", "bowling-1h", "slider-bar", "lower-event-room"]));
    expect(recommended.slugs).not.toContain("unlimited-arcade-1h");
    expect(premium.slugs).toEqual(
      expect.arrayContaining(["axe-throwing-60", "bowling-1h", "smokehouse-bbq", "unlimited-arcade-1h", "skybox"]),
    );
    expect(good.payload.budgetExplanationCode).toBe("NO_BUDGET");
    expect(good.payload.beverages ?? []).toEqual([]);
    expect(good.payload.durationMinutes).not.toBe(good.payload.spaces[0]?.durationMinutes);
    expect(recommended.plan.customerFacingReason).toMatch(/Slider Bar/);
    expect(premium.plan.customerFacingReason).toMatch(/Smokehouse BBQ/);
    expect(premium.plan.customerFacingReason).toMatch(/Arcade/);

    const profile = await db.recommendationProfile.findFirstOrThrow({
      where: { organizationId: generations.organizationId, audience: "ADULTS" },
    });
    const original = profile.payload;
    const edited = structuredClone(original) as { composition?: { foodStrategies?: { value?: string[] } } };
    if (edited.composition?.foodStrategies) {
      edited.composition.foodStrategies.value = ["smokehouse-bbq"];
    }
    await db.recommendationProfile.update({
      where: { id: profile.id },
      data: { payload: edited as Prisma.InputJsonValue },
    });
    const reread = await planSlugs(generations.organizationId, created.inquiryId, EVENT_PLAN_TIERS.BUDGET);
    expect(reread.slugs).toContain("fajita-bar");
    expect(reread.payload.budgetExplanationCode).toBe("NO_BUDGET");
    await db.recommendationProfile.update({
      where: { id: profile.id },
      data: { payload: original as Prisma.InputJsonValue },
    });
  }, 60_000);

  it("keeps explicit attractions and catalog prices when the event is above a low budget", async () => {
    const flexible = await createPublicInquiry(
      db,
      {
        organizationSlug: generations.slug,
        rateLimitKey: `comp-b-flex:${crypto.randomUUID()}`,
        firstName: "Casey",
        lastName: "Nguyen",
        email: `comp.base.${crypto.randomUUID()}@example.com`,
        eventType: "Birthday Party",
        preferredDate: "2026-11-05",
        startTime: "14:00",
        guestCount: 20,
        guestMix: "mostly_adults",
        foodPreference: "WANTS_FOOD",
        privateSpacePreference: "YES",
        budgetPreference: "FLEXIBLE",
        attractionMode: "known",
        attractionInterestIds: axeAndBowlingIds,
        submissionId: `sub_${crypto.randomUUID()}`,
      },
      undefined,
      unlimitedLimiter,
    );
    const low = await createPublicInquiry(
      db,
      {
        organizationSlug: generations.slug,
        rateLimitKey: `comp-b-low:${crypto.randomUUID()}`,
        firstName: "Casey",
        lastName: "Nguyen",
        email: `comp.low.${crypto.randomUUID()}@example.com`,
        eventType: "Birthday Party",
        preferredDate: "2026-11-06",
        startTime: "14:00",
        guestCount: 20,
        guestMix: "mostly_adults",
        foodPreference: "WANTS_FOOD",
        privateSpacePreference: "YES",
        budgetBand: "under_1500",
        attractionMode: "known",
        attractionInterestIds: axeAndBowlingIds,
        submissionId: `sub_${crypto.randomUUID()}`,
      },
      undefined,
      unlimitedLimiter,
    );
    const flexGood = await planSlugs(generations.organizationId, flexible.inquiryId, EVENT_PLAN_TIERS.BUDGET);
    const lowGood = await planSlugs(generations.organizationId, low.inquiryId, EVENT_PLAN_TIERS.BUDGET);
    const lowPremium = await planSlugs(generations.organizationId, low.inquiryId, EVENT_PLAN_TIERS.PREMIUM);
    const price = (slugs: typeof flexGood, product: string) =>
      slugs.payload.lineItems?.find((row) => row.slug === product)?.unitPriceCents;

    expect(lowGood.slugs).toEqual(expect.arrayContaining(["axe-throwing-30", "bowling-1h"]));
    expect(lowGood.slugs.includes("axe-throwing-30") && lowGood.slugs.includes("axe-throwing-60")).toBe(false);
    expect(lowPremium.slugs).toContain("axe-throwing-60");
    expect(lowPremium.slugs).toContain("bowling-1h");
    expect(lowPremium.slugs).toContain("unlimited-arcade-1h");
    const lowGoodTotal = lowGood.plan.estimatedTotalCents ?? 0;
    const lowPremiumTotal = lowPremium.plan.estimatedTotalCents ?? 0;
    if (lowGoodTotal > 150_000) {
      expect(lowGood.payload.budgetExplanationCode).toBe("ABOVE_BUDGET");
      expect(lowGood.payload.budgetDifferenceCents).toBe(lowGoodTotal - 150_000);
    } else {
      expect(lowGood.payload.budgetExplanationCode).toBe("WITHIN_BUDGET");
      expect(lowGood.payload.budgetDifferenceCents).toBe(0);
    }
    if (lowPremiumTotal > 150_000) {
      expect(lowPremium.payload.budgetExplanationCode).toBe("ABOVE_BUDGET");
      expect(lowPremium.payload.budgetDifferenceCents).toBe(lowPremiumTotal - 150_000);
    }
    expect(lowPremiumTotal).toBeGreaterThan(lowGoodTotal);
    const flexFood = flexGood.slugs.find((slug) => slug.endsWith("-bar") || slug.includes("bbq"));
    const lowFood = lowGood.slugs.find((slug) => slug.endsWith("-bar") || slug.includes("bbq"));
    if (flexFood === lowFood) {
      expect(lowGoodTotal).toBe(flexGood.plan.estimatedTotalCents);
    }
    expect(price(lowGood, "axe-throwing-30")).toBe(price(flexGood, "axe-throwing-30"));
    expect(price(lowGood, "bowling-1h")).toBe(price(flexGood, "bowling-1h"));
    expect(price(lowGood, "lower-event-room")).toBe(price(flexGood, "lower-event-room"));
  }, 60_000);

  it("does not offer a private room below the group's size", async () => {
    const room = await db.product.findFirstOrThrow({
      where: { organizationId: generations.organizationId, slug: "lower-event-room" },
      select: { maxGuests: true },
    });
    expect(room.maxGuests).toBe(35);
    const created = await createPublicInquiry(
      db,
      {
        organizationSlug: generations.slug,
        rateLimitKey: `comp-c:${crypto.randomUUID()}`,
        firstName: "Casey",
        lastName: "Nguyen",
        email: `comp.forty.${crypto.randomUUID()}@example.com`,
        eventType: "Birthday Party",
        preferredDate: "2026-11-07",
        startTime: "14:00",
        guestCount: 40,
        guestMix: "mostly_adults",
        foodPreference: "WANTS_FOOD",
        privateSpacePreference: "YES",
        budgetPreference: "FLEXIBLE",
        attractionMode: "known",
        attractionInterestIds: axeAndBowlingIds,
        submissionId: `sub_${crypto.randomUUID()}`,
      },
      undefined,
      unlimitedLimiter,
    );
    for (const tier of [EVENT_PLAN_TIERS.BUDGET, EVENT_PLAN_TIERS.BEST_FIT, EVENT_PLAN_TIERS.PREMIUM]) {
      const row = await planSlugs(generations.organizationId, created.inquiryId, tier);
      expect(row.slugs).toContain("skybox");
      expect(row.slugs).not.toContain("lower-event-room");
      expect(row.payload.spaceUnmet).not.toBe(true);
    }
    const skybox = await db.product.findFirstOrThrow({
      where: { organizationId: generations.organizationId, slug: "skybox" },
      select: { maxGuests: true },
    });
    expect(skybox.maxGuests).toBeGreaterThanOrEqual(40);
  }, 60_000);

  it("composes a second tenant from its own dining, rooms, and add-ons", async () => {
    const created = await createPublicInquiry(
      db,
      {
        organizationSlug: beta.slug,
        rateLimitKey: `comp-d:${crypto.randomUUID()}`,
        firstName: "Jordan",
        lastName: "Lee",
        email: `comp.beta.${crypto.randomUUID()}@example.com`,
        eventType: "Birthday Party",
        preferredDate: "2026-11-04",
        startTime: "15:00",
        guestCount: 12,
        guestMix: "mostly_adults",
        foodPreference: "WANTS_FOOD",
        privateSpacePreference: "YES",
        budgetPreference: "FLEXIBLE",
        submissionId: `sub_${crypto.randomUUID()}`,
      },
      undefined,
      unlimitedLimiter,
    );
    const good = await planSlugs(beta.organizationId, created.inquiryId, EVENT_PLAN_TIERS.BUDGET);
    const premium = await planSlugs(beta.organizationId, created.inquiryId, EVENT_PLAN_TIERS.PREMIUM);
    expect(good.slugs).toEqual(expect.arrayContaining(["bowling-1h", "snack-combo", "lane-side-room", "fountain-drinks"]));
    expect(premium.slugs).toEqual(
      expect.arrayContaining(["bowling-1h", "trampoline", "grill-platter", "fountain-drinks", "party-hall"]),
    );
    expect(good.payload.beverages?.map((row) => row.name)).toEqual(["Fountain Drinks"]);
    expect(good.payload.dining.label).toBe("Snack Combo");
    expect(good.payload.lineItems?.filter((row) => row.slug === "fountain-drinks")).toHaveLength(1);
    expect(good.payload.includedItems?.some((row) => row.name === "Fountain Drinks")).toBe(false);
    const combined = [...good.slugs, ...premium.slugs];
    for (const slug of GENERATIONS_ONLY) {
      expect(combined).not.toContain(slug);
    }
    const foreign = await db.product.count({
      where: { organizationId: beta.organizationId, slug: { in: GENERATIONS_ONLY } },
    });
    expect(foreign).toBe(0);
  }, 60_000);

  it("leaves Good without a paid room when the customer has no space preference", async () => {
    const created = await createPublicInquiry(
      db,
      {
        organizationSlug: generations.slug,
        rateLimitKey: `comp-room:${crypto.randomUUID()}`,
        firstName: "Casey",
        lastName: "Nguyen",
        email: `comp.noroom.${crypto.randomUUID()}@example.com`,
        eventType: "Birthday Party",
        preferredDate: "2026-11-07",
        startTime: "14:00",
        guestCount: 20,
        guestMix: "mostly_adults",
        foodPreference: "WANTS_FOOD",
        privateSpacePreference: "NO_PREFERENCE",
        budgetPreference: "FLEXIBLE",
        attractionMode: "known",
        attractionInterestIds: axeAndBowlingIds,
        submissionId: `sub_${crypto.randomUUID()}`,
      },
      undefined,
      unlimitedLimiter,
    );
    const good = await planSlugs(generations.organizationId, created.inquiryId, EVENT_PLAN_TIERS.BUDGET);
    const recommended = await planSlugs(generations.organizationId, created.inquiryId, EVENT_PLAN_TIERS.BEST_FIT);
    const premium = await planSlugs(generations.organizationId, created.inquiryId, EVENT_PLAN_TIERS.PREMIUM);
    expect(good.slugs).not.toContain("lower-event-room");
    expect(good.slugs).not.toContain("skybox");
    expect(recommended.slugs).not.toContain("lower-event-room");
    expect(recommended.slugs).not.toContain("skybox");
    expect(premium.slugs).toContain("skybox");
    expect(good.slugs).toEqual(expect.arrayContaining(["axe-throwing-30", "bowling-1h", "fajita-bar"]));
  }, 60_000);
});
