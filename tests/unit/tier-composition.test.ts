import { describe, expect, it } from "vitest";

import { composeEventItinerary } from "@/server/catalog/itinerary";
import { loadBookingCatalogDataset } from "@/server/catalog/load-dataset";
import { budgetAssessment, composeTierProducts } from "@/server/catalog/tier-composition";
import { budgetFitCustomerText } from "@/lib/event-planner/budget-fit";
import { buildCatalogEventPlans, type LoadedCatalogProduct } from "@/server/services/proposal-engine";
import {
  TENANT_BETA_COMPOSITION_PROFILE,
  TENANT_BETA_KIDS_COMPOSITION_PROFILE,
  TENANT_BETA_PRODUCTS,
} from "../fixtures/tenant-alpha-beta-catalogs";
import { ATTRACTION_MODES, PRODUCT_KINDS, type RecommendationProfilePayload } from "@/types/catalog";
import { BUDGET_BAND_CENTS, EVENT_PLAN_TIERS, type EventPlanDraft } from "@/types/event-planner";
import type { PlannerInquiryFacts } from "@/server/event-planner/build-event-plans";

function asCatalogProduct(product: ReturnType<typeof loadBookingCatalogDataset>["products"][number]): LoadedCatalogProduct {
  return {
    id: product.slug,
    slug: product.slug,
    name: product.name,
    kind: product.kind,
    audience: product.audience,
    durationMinutes: product.durationMinutes ?? null,
    minGuests: product.minGuests ?? null,
    maxGuests: product.maxGuests ?? null,
    weekendOnly: product.weekendOnly,
    fulfillmentGroup: product.fulfillmentGroup ?? null,
    guestsPerUnit: product.requirements.find((row) => row.guestsPerUnit)?.guestsPerUnit ?? null,
    schedulingBehavior: product.schedulingBehavior ?? null,
    prices: product.prices.map((price) => ({
      strategy: price.strategy,
      amountCents: price.amountCents,
      additionalGuestCents: price.additionalGuestCents ?? null,
      includedGuests: price.includedGuests ?? null,
      includedHours: price.includedHours ?? null,
      additionalHourCents: price.additionalHourCents ?? null,
      minGuests: price.minGuests ?? null,
      weekdayAmountCents: price.weekdayAmountCents ?? null,
      weekendAmountCents: price.weekendAmountCents ?? null,
      daysOfWeek: price.daysOfWeek ?? null,
      afterHour: price.afterHour ?? null,
      afterHourAmountCents: price.afterHourAmountCents ?? null,
      shoeAddOnCents: price.shoeAddOnCents ?? null,
      unitLabel: price.unitLabel ?? null,
    })),
    serving: product.serving
      ? { servesMin: product.serving.servesMin, servesMax: product.serving.servesMax, unitCount: product.serving.unitCount ?? null }
      : null,
    hasResourceRequirements: product.requirements.length > 0,
  };
}

const dataset = loadBookingCatalogDataset();
const products = dataset.products.map(asCatalogProduct);
const profiles = dataset.recommendationProfiles.map((row) => ({
  audience: row.audience,
  payload: row.payload as RecommendationProfilePayload,
}));

function facts(overrides: Partial<PlannerInquiryFacts> = {}): PlannerInquiryFacts {
  return {
    eventType: "Birthday Party",
    eventGoal: "Birthday Party",
    guestCount: 30,
    guestMix: "mostly_adults",
    desiredDurationMinutes: null,
    desiredDate: "2026-10-17",
    desiredStartTime: "14:00",
    budgetMin: null,
    budgetMax: null,
    diningPreference: "not_sure",
    spacePreference: "no_preference",
    attractionInterestIds: [],
    customerNotes: null,
    ...overrides,
  };
}

async function plans(inquiry: PlannerInquiryFacts, extra: Parameters<typeof buildCatalogEventPlans>[0] = {
  organizationId: "org",
  inquiry,
  products,
  profiles,
  resourceRequirements: [],
  currency: "USD",
}) {
  return buildCatalogEventPlans({ ...extra, inquiry });
}

function slugs(plan: EventPlanDraft | undefined) {
  return [...new Set((plan?.payload.lineItems ?? []).map((row) => row.slug))];
}

function tier(rows: EventPlanDraft[], name: string) {
  return rows.find((row) => row.tier === name);
}

describe("deterministic tier composition", () => {
  it("composes adult tiers from configuration instead of stacking add-ons", async () => {
    const rows = await plans(facts());
    const good = tier(rows, EVENT_PLAN_TIERS.BUDGET);
    const recommended = tier(rows, EVENT_PLAN_TIERS.BEST_FIT);
    const premium = tier(rows, EVENT_PLAN_TIERS.PREMIUM);
    expect(slugs(good)).toEqual(expect.arrayContaining(["fajita-bar", "axe-throwing-30", "bowling-1h"]));
    expect(slugs(good)).not.toEqual(expect.arrayContaining(["axe-throwing-60", "unlimited-arcade-1h", "skybox", "beer-wall"]));
    expect(slugs(recommended)).toEqual(expect.arrayContaining(["slider-bar", "axe-throwing-60", "bowling-1h"]));
    expect(slugs(recommended)).not.toContain("unlimited-arcade-1h");
    expect(slugs(premium)).toEqual(expect.arrayContaining(["smokehouse-bbq", "axe-throwing-60", "bowling-1h", "unlimited-arcade-1h"]));
    expect(slugs(premium)).not.toContain("laser-plex-card");
    expect(good?.payload.compositionDelta?.foodTo).toBeNull();
    expect(good?.customerFacingReason).toMatch(/^Includes /);
    expect(recommended?.customerFacingReason).toMatch(/upgrades dining to Slider Bar/i);
    expect(recommended?.customerFacingReason).not.toMatch(/extra hour of Bowling|hour of Bowling/);
    expect(premium?.customerFacingReason).toMatch(/Smokehouse BBQ/);
    expect(premium?.customerFacingReason).toMatch(/Arcade/);
    expect(premium?.customerFacingReason).not.toMatch(/beer/i);
  });

  it("composes youth laser tag and arcade, with climbing only on premium", async () => {
    const rows = await plans(facts({ guestMix: "mostly_children" }));
    const good = tier(rows, EVENT_PLAN_TIERS.BUDGET);
    const premium = tier(rows, EVENT_PLAN_TIERS.PREMIUM);
    expect(slugs(good)).toEqual(expect.arrayContaining(["pizza-pitcher-combo", "unlimited-laser-tag-90", "unlimited-arcade-1h"]));
    expect(slugs(good)).not.toContain("climbers-cove-90");
    expect(slugs(premium)).toContain("climbers-cove-90");
    expect(good?.payload.itinerary?.[0]?.label).toMatch(/Pizza/);
  });

  it("keeps explicit axe and bowling on every tier and one axe duration", async () => {
    const rows = await plans(facts({ attractionInterestIds: ["axe-throwing", "bowling"] }), {
      organizationId: "org",
      inquiry: facts(),
      products,
      profiles,
      resourceRequirements: [],
      currency: "USD",
      attractionSelections: [
        { interestSlug: "axe-throwing", productIds: ["axe-throwing-60", "axe-throwing-30"] },
        { interestSlug: "bowling", productIds: ["bowling-1h"] },
      ],
    });
    for (const row of rows) {
      const chosen = slugs(row);
      expect(chosen).toContain("bowling-1h");
      expect(chosen.includes("axe-throwing-30") || chosen.includes("axe-throwing-60")).toBe(true);
      expect(chosen.includes("axe-throwing-30") && chosen.includes("axe-throwing-60")).toBe(false);
      expect(chosen).not.toContain("unlimited-laser-tag-90");
    }
    expect(slugs(tier(rows, EVENT_PLAN_TIERS.BUDGET))).toContain("axe-throwing-30");
    expect(slugs(tier(rows, EVENT_PLAN_TIERS.BEST_FIT))).toContain("axe-throwing-60");
    expect(tier(rows, EVENT_PLAN_TIERS.BUDGET)?.customerFacingReason).toMatch(/your selected/);
  });

  it("selects a fitting private room and leaves an unmet request explicit", async () => {
    const twenty = await plans(facts({ spacePreference: "private", guestCount: 20 }));
    expect(slugs(tier(twenty, EVENT_PLAN_TIERS.BUDGET))).toContain("lower-event-room");
    expect(slugs(tier(twenty, EVENT_PLAN_TIERS.BEST_FIT))).toContain("lower-event-room");
    expect(slugs(tier(twenty, EVENT_PLAN_TIERS.PREMIUM))).toContain("skybox");
    expect(slugs(tier(twenty, EVENT_PLAN_TIERS.PREMIUM))).not.toContain("lower-event-room");
    expect(tier(twenty, EVENT_PLAN_TIERS.BEST_FIT)?.customerFacingReason).toMatch(/while keeping Lower Event Room/);
    expect(tier(twenty, EVENT_PLAN_TIERS.PREMIUM)?.customerFacingReason).toMatch(/moves your group to Skybox/);
    const fitting = await plans(facts({ spacePreference: "private", guestCount: 40 }));
    for (const name of [EVENT_PLAN_TIERS.BUDGET, EVENT_PLAN_TIERS.BEST_FIT, EVENT_PLAN_TIERS.PREMIUM]) {
      expect(slugs(tier(fitting, name))).toContain("skybox");
      expect(slugs(tier(fitting, name))).not.toContain("lower-event-room");
    }
    const tooBig = await plans(facts({ spacePreference: "private", guestCount: 80 }));
    expect(tier(tooBig, EVENT_PLAN_TIERS.BUDGET)?.payload.spaceUnmet).toBe(true);
    expect(tier(tooBig, EVENT_PLAN_TIERS.BUDGET)?.customerFacingReason).toContain("No private space");
    expect(slugs(tier(tooBig, EVENT_PLAN_TIERS.BUDGET))).not.toEqual(expect.arrayContaining(["skybox", "lower-event-room"]));
  });

  it("omits a room on Good when private space was not requested", async () => {
    const rows = await plans(facts({ spacePreference: "no_preference" }));
    expect(slugs(tier(rows, EVENT_PLAN_TIERS.BUDGET))).not.toEqual(expect.arrayContaining(["skybox", "lower-event-room"]));
    expect(slugs(tier(rows, EVENT_PLAN_TIERS.PREMIUM))).toContain("skybox");
  });

  it("swaps only Good food to fit a total budget and keeps explicit interests", async () => {
    const open = await plans(facts());
    const openGood = tier(open, EVENT_PLAN_TIERS.BUDGET);
    const explicitFacts = facts({
      budgetMax: (openGood?.estimatedTotalCents ?? 0) - 1,
      attractionInterestIds: ["axe-throwing", "bowling"],
    });
    const tight = await plans(explicitFacts, {
      organizationId: "org",
      inquiry: explicitFacts,
      products,
      profiles,
      resourceRequirements: [],
      currency: "USD",
      attractionSelections: [
        { interestSlug: "axe-throwing", productIds: ["axe-throwing-60", "axe-throwing-30"] },
        { interestSlug: "bowling", productIds: ["bowling-1h"] },
      ],
    });
    const tightGood = tier(tight, EVENT_PLAN_TIERS.BUDGET);
    expect(slugs(tightGood)).toContain("breakfast-bar");
    expect(slugs(tightGood)).toContain("axe-throwing-30");
    expect(slugs(tightGood)).toContain("bowling-1h");
    expect(tightGood?.payload.budgetFit).toBe("WITHIN_RANGE");
    expect(tightGood?.payload.budgetExplanationCode).toBe("WITHIN_BUDGET");
    expect(tightGood?.estimatedTotalCents).not.toBe(openGood?.estimatedTotalCents);
    const axePrice = (plan: EventPlanDraft | undefined) =>
      plan?.payload.lineItems?.find((row) => row.slug === "axe-throwing-30")?.unitPriceCents;
    const bowlingPrice = (plan: EventPlanDraft | undefined) =>
      plan?.payload.lineItems?.find((row) => row.slug === "bowling-1h")?.unitPriceCents;
    expect(axePrice(tightGood)).toBe(axePrice(openGood));
    expect(bowlingPrice(tightGood)).toBe(bowlingPrice(openGood));
    expect(slugs(tier(tight, EVENT_PLAN_TIERS.BEST_FIT))).toContain("axe-throwing-60");
    expect(slugs(tier(tight, EVENT_PLAN_TIERS.BEST_FIT))).toContain("bowling-1h");
    expect(slugs(tier(tight, EVENT_PLAN_TIERS.PREMIUM))).toContain("unlimited-arcade-1h");
    const flexible = await plans(facts({ budgetFlexible: true }));
    expect(tier(flexible, EVENT_PLAN_TIERS.BUDGET)?.payload.budgetFit).toBe("FLEXIBLE");
  });

  it("keeps bowling and mini golf as separate interests", async () => {
    const rows = await plans(facts({ attractionInterestIds: ["bowling", "mini-golf"], diningPreference: "none" }), {
      organizationId: "org",
      inquiry: facts(),
      products,
      profiles,
      resourceRequirements: [],
      currency: "USD",
      attractionSelections: [
        { interestSlug: "bowling", productIds: ["bowling-1h"] },
        { interestSlug: "mini-golf", productIds: ["have-a-ball-mini-golf"] },
      ],
    });
    expect(slugs(tier(rows, EVENT_PLAN_TIERS.BUDGET))).toEqual(
      expect.arrayContaining(["bowling-1h", "have-a-ball-mini-golf"]),
    );
  });

  it("does not invent a beverage that is absent from the tenant catalog", () => {
    const encoded = JSON.stringify(dataset.recommendationProfiles);
    expect(encoded).not.toMatch(/beer-wall|beer wall/i);
    expect(dataset.products.some((row) => row.slug === "beer-wall")).toBe(false);
  });

  it("keeps two explicit interests when their products share a fulfillment group", () => {
    const bowling = {
      id: "bowl",
      slug: "bowling-1h",
      name: "Bowling",
      kind: "ATTRACTION",
      minGuests: null,
      maxGuests: null,
      weekendOnly: false,
      fulfillmentGroup: "shared-package",
    };
    const golf = { ...bowling, id: "golf", slug: "mini-golf", name: "Mini Golf" };
    const extra = { ...bowling, id: "extra", slug: "axe-extra", name: "Axe Extra" };
    const bySlug = new Map([
      [bowling.slug, bowling],
      [golf.slug, golf],
      [extra.slug, extra],
    ]);
    const byId = new Map([
      [bowling.id, bowling],
      [golf.id, golf],
      [extra.id, extra],
    ]);
    const tier = {
      foodStrategy: "value" as const,
      coreAttractionSlugs: [],
      upgradeSlugs: ["axe-extra"],
      fulfillmentByInterest: {},
      includeSpace: false,
      spaceFit: "tightest" as const,
    };
    const composed = composeTierProducts({
      tierKey: "good",
      tier,
      profile: {
        ...profiles[0]!.payload,
        composition: {
          foodStrategies: { value: [], standard: [], premium: [] },
          spaceSlugs: [],
          tiers: { good: tier, better: tier, best: tier },
        },
      },
      inquiry: facts({ diningPreference: "none", attractionInterestIds: ["bowling", "mini-golf"] }),
      attractionMode: ATTRACTION_MODES.KNOWN,
      selections: [
        { interestSlug: "bowling", productIds: ["bowl"] },
        { interestSlug: "mini-golf", productIds: ["golf"] },
      ],
      directProductIds: [],
      productsBySlug: bySlug,
      productsById: byId,
      isWeekend: () => false,
    });
    expect(composed.products.map((row) => row.slug).sort()).toEqual(["bowling-1h", "mini-golf"]);
    expect(composed.products.some((row) => row.slug === "axe-extra")).toBe(false);
    expect(composed.unfulfilledInterestSlugs).toEqual([]);
  });

  it("uses the same composer for a second tenant with different products and activities-first order", () => {
    const bySlug = new Map(TENANT_BETA_PRODUCTS.map((row) => [row.slug, row]));
    const byId = new Map(TENANT_BETA_PRODUCTS.map((row) => [row.id, row]));
    const inquiry = facts({ guestMix: "mostly_children", diningPreference: "not_sure" });
    const kids = composeTierProducts<LoadedCatalogProduct>({
      tierKey: "better",
      tier: TENANT_BETA_KIDS_COMPOSITION_PROFILE.composition!.tiers.better,
      profile: TENANT_BETA_KIDS_COMPOSITION_PROFILE,
      inquiry,
      attractionMode: ATTRACTION_MODES.RECOMMEND,
      selections: [],
      directProductIds: [],
      productsBySlug: bySlug,
      productsById: byId,
      isWeekend: () => false,
    });
    const adults = composeTierProducts<LoadedCatalogProduct>({
      tierKey: "good",
      tier: TENANT_BETA_COMPOSITION_PROFILE.composition!.tiers.good,
      profile: TENANT_BETA_COMPOSITION_PROFILE,
      inquiry: facts(),
      attractionMode: ATTRACTION_MODES.RECOMMEND,
      selections: [],
      directProductIds: [],
      productsBySlug: bySlug,
      productsById: byId,
      isWeekend: () => false,
    });
    expect(kids.products.map((row) => row.slug)).toEqual(["trampoline", "arcade", "snack-combo"]);
    expect(adults.products.map((row) => row.slug)).toEqual(["bowling-1h", "snack-combo", "fountain-drinks"]);
    expect(adults.products.some((row) => row.slug === "trampoline")).toBe(false);
    const itinerary = composeEventItinerary({
      startTime: "14:00",
      foodFirst: TENANT_BETA_KIDS_COMPOSITION_PROFILE.foodFirst,
      products: kids.products.map((row) => ({
        id: row.id,
        name: row.name,
        kind: row.kind,
        durationMinutes: row.durationMinutes,
      })),
      fallbackMinutes: 60,
    });
    expect(itinerary.itinerary[0]?.label).not.toMatch(/Snack/);
    expect(kids.products.some((row) => row.kind === PRODUCT_KINDS.ATTRACTION)).toBe(true);
    const premium = composeTierProducts<LoadedCatalogProduct>({
      tierKey: "best",
      tier: TENANT_BETA_COMPOSITION_PROFILE.composition!.tiers.best,
      profile: TENANT_BETA_COMPOSITION_PROFILE,
      inquiry: facts({ spacePreference: "private", guestCount: 12 }),
      attractionMode: ATTRACTION_MODES.RECOMMEND,
      selections: [],
      directProductIds: [],
      productsBySlug: bySlug,
      productsById: byId,
      isWeekend: () => false,
    });
    expect(premium.products.map((row) => row.slug)).toEqual(
      expect.arrayContaining(["bowling-1h", "trampoline", "grill-platter", "fountain-drinks", "party-hall"]),
    );
    expect(premium.products.map((row) => row.slug)).not.toEqual(
      expect.arrayContaining(["fajita-bar", "axe-throwing-60", "lower-event-room", "skybox", "beer-wall"]),
    );
    const crowded = composeTierProducts<LoadedCatalogProduct>({
      tierKey: "good",
      tier: TENANT_BETA_COMPOSITION_PROFILE.composition!.tiers.good,
      profile: TENANT_BETA_COMPOSITION_PROFILE,
      inquiry: facts({ spacePreference: "private", guestCount: 30 }),
      attractionMode: ATTRACTION_MODES.RECOMMEND,
      selections: [],
      directProductIds: [],
      productsBySlug: bySlug,
      productsById: byId,
      isWeekend: () => false,
    });
    expect(crowded.products.map((row) => row.slug)).toContain("party-hall");
    expect(crowded.products.map((row) => row.slug)).not.toContain("lane-side-room");
    const impossible = composeTierProducts<LoadedCatalogProduct>({
      tierKey: "good",
      tier: TENANT_BETA_COMPOSITION_PROFILE.composition!.tiers.good,
      profile: TENANT_BETA_COMPOSITION_PROFILE,
      inquiry: facts({ spacePreference: "private", guestCount: 200 }),
      attractionMode: ATTRACTION_MODES.RECOMMEND,
      selections: [],
      directProductIds: [],
      productsBySlug: bySlug,
      productsById: byId,
      isWeekend: () => false,
    });
    expect(impossible.spaceUnmet).toBe(true);
    expect(impossible.products.some((row) => row.kind === PRODUCT_KINDS.RENTAL)).toBe(false);
  });

  it("omits dining when food is declined and does not invent dining without configuration", async () => {
    const declined = await plans(facts({ diningPreference: "none" }));
    for (const row of declined) {
      expect(slugs(row).some((slug) => slug.includes("bar") || slug.includes("bbq") || slug.includes("pizza"))).toBe(false);
    }
    const legacy = await plans(facts({ diningPreference: null }), {
      organizationId: "org",
      inquiry: facts({ diningPreference: null }),
      products,
      profiles,
      resourceRequirements: [],
      currency: "USD",
    });
    expect(slugs(tier(legacy, EVENT_PLAN_TIERS.BUDGET))).toContain("fajita-bar");
    const bareProfile = structuredClone(profiles.find((row) => row.audience === "ADULTS")!);
    bareProfile.payload.composition!.foodStrategies = { value: [], standard: [], premium: [] };
    const emptyFood = await plans(facts(), {
      organizationId: "org",
      inquiry: facts(),
      products,
      profiles: [bareProfile],
      resourceRequirements: [],
      currency: "USD",
    });
    expect(slugs(tier(emptyFood, EVENT_PLAN_TIERS.BUDGET)).some((slug) => slug.includes("bar"))).toBe(false);
  });

  it("classifies total-event budget bands without changing the quoted total", () => {
    const under = BUDGET_BAND_CENTS.under_1500;
    const bounded = BUDGET_BAND_CENTS["1500_3000"];
    const open = BUDGET_BAND_CENTS["7500_plus"];
    expect(budgetAssessment({ totalCents: 150_000, budgetMin: under.min, budgetMax: under.max, flexible: false })).toMatchObject({
      budgetFit: "WITHIN_RANGE",
      budgetExplanationCode: "WITHIN_BUDGET",
      budgetDifferenceCents: 0,
    });
    expect(budgetAssessment({ totalCents: 182_000, budgetMin: under.min, budgetMax: under.max, flexible: false })).toMatchObject({
      budgetExplanationCode: "ABOVE_BUDGET",
      budgetDifferenceCents: 32_000,
    });
    expect(budgetAssessment({ totalCents: 100_000, budgetMin: under.min, budgetMax: under.max, flexible: false }).budgetExplanationCode).toBe(
      "WITHIN_BUDGET",
    );
    expect(budgetAssessment({ totalCents: 235_000, budgetMin: bounded.min, budgetMax: bounded.max, flexible: false }).budgetExplanationCode).toBe(
      "WITHIN_BUDGET",
    );
    expect(budgetAssessment({ totalCents: 340_000, budgetMin: bounded.min, budgetMax: bounded.max, flexible: false })).toMatchObject({
      budgetExplanationCode: "ABOVE_BUDGET",
      budgetDifferenceCents: 40_000,
    });
    expect(budgetAssessment({ totalCents: 120_000, budgetMin: bounded.min, budgetMax: bounded.max, flexible: false })).toMatchObject({
      budgetExplanationCode: "BELOW_BUDGET",
      budgetDifferenceCents: -30_000,
    });
    expect(budgetAssessment({ totalCents: 800_000, budgetMin: open.min, budgetMax: open.max, flexible: false }).budgetExplanationCode).toBe(
      "WITHIN_BUDGET",
    );
    expect(budgetAssessment({ totalCents: 700_000, budgetMin: open.min, budgetMax: open.max, flexible: false })).toMatchObject({
      budgetExplanationCode: "BELOW_BUDGET",
      budgetDifferenceCents: -50_000,
    });
    expect(budgetAssessment({ totalCents: 900_000, budgetMin: open.min, budgetMax: open.max, flexible: false }).budgetFit).not.toBe(
      "ABOVE_RANGE",
    );
    expect(budgetAssessment({ totalCents: 200_000, budgetMin: null, budgetMax: null, flexible: true })).toMatchObject({
      budgetFit: "FLEXIBLE",
      budgetExplanationCode: "NO_BUDGET",
      budgetDifferenceCents: null,
    });
    expect(budgetAssessment({ totalCents: 200_000, budgetMin: null, budgetMax: null, flexible: false }).budgetExplanationCode).toBe(
      "UNSPECIFIED",
    );
    expect(budgetFitCustomerText({ code: "WITHIN_BUDGET", differenceCents: 0 })).toBe("Within your preferred budget");
    expect(budgetFitCustomerText({ code: "ABOVE_BUDGET", differenceCents: 32_000 })).toBe("$320 above your preferred range");
    expect(
      budgetFitCustomerText({ code: "ABOVE_BUDGET", differenceCents: 32_000, preservedSelections: true }),
    ).toBe("Your selected activities put this option $320 above your preferred budget range.");
    expect(budgetFitCustomerText({ code: "BELOW_BUDGET", differenceCents: -50_000 })).toBe("$500 below your preferred range");
    expect(budgetFitCustomerText({ code: "NO_BUDGET", differenceCents: null })).toBeNull();
  });

  it("drops only a configured optional upgrade on Good when the total is over budget", async () => {
    const adult = structuredClone(profiles.find((row) => row.audience === "ADULTS")!);
    adult.payload.composition!.tiers.good.upgradeSlugs = ["unlimited-arcade-1h"];
    adult.payload.composition!.tiers.good.budgetOptionalUpgradeSlugs = ["unlimited-arcade-1h"];
    const custom = profiles.map((row) => (row.audience === "ADULTS" ? adult : row));
    const roomy = await plans(facts({ budgetMax: 100_000_000 }), {
      organizationId: "org",
      inquiry: facts({ budgetMax: 100_000_000 }),
      products,
      profiles: custom,
      resourceRequirements: [],
      currency: "USD",
    });
    expect(slugs(tier(roomy, EVENT_PLAN_TIERS.BUDGET))).toContain("unlimited-arcade-1h");
    const tight = await plans(facts({ budgetMax: 1 }), {
      organizationId: "org",
      inquiry: facts({ budgetMax: 1 }),
      products,
      profiles: custom,
      resourceRequirements: [],
      currency: "USD",
    });
    const tightGood = tier(tight, EVENT_PLAN_TIERS.BUDGET);
    expect(slugs(tightGood)).not.toContain("unlimited-arcade-1h");
    expect(slugs(tightGood)).toEqual(expect.arrayContaining(["axe-throwing-30", "bowling-1h"]));
    expect(slugs(tier(tight, EVENT_PLAN_TIERS.PREMIUM))).toContain("unlimited-arcade-1h");
    expect(tightGood?.payload.budgetExplanationCode).toBe("ABOVE_BUDGET");
    const quoted = tightGood?.payload.lineItems?.find((row) => row.slug === "bowling-1h")?.unitPriceCents;
    const openQuoted = tier(roomy, EVENT_PLAN_TIERS.BUDGET)?.payload.lineItems?.find((row) => row.slug === "bowling-1h")?.unitPriceCents;
    expect(quoted).toBe(openQuoted);
  });

  it("keeps a persisted composition snapshot stable after later configuration changes", async () => {
    const inquiry = facts({ budgetMax: 300_000, budgetMin: 150_000 });
    const rows = await plans(inquiry);
    const snapshot = tier(rows, EVENT_PLAN_TIERS.BEST_FIT);
    const adult = profiles.find((row) => row.audience === "ADULTS");
    const original = adult?.payload.composition?.foodStrategies.standard.slice() ?? [];
    try {
      if (adult?.payload.composition) {
        adult.payload.composition.foodStrategies.standard = ["smokehouse-bbq"];
      }
      expect(snapshot?.payload.lineItems?.some((row) => row.slug === "slider-bar")).toBe(true);
      expect(snapshot?.payload.budgetExplanationCode).toBeDefined();
      expect(snapshot?.customerFacingReason).toMatch(/Slider Bar/);
    } finally {
      if (adult?.payload.composition) {
        adult.payload.composition.foodStrategies.standard = original;
      }
    }
  });

  it("skips a food product that does not fit the group and keeps beverages off the itinerary", () => {
    const bySlug = new Map(TENANT_BETA_PRODUCTS.map((row) => [row.slug, { ...row }]));
    const snack = bySlug.get("snack-combo");
    if (snack) {
      bySlug.set("snack-combo", { ...snack, maxGuests: 8 });
    }
    const byId = new Map([...bySlug.values()].map((row) => [row.id, row]));
    const profile = structuredClone(TENANT_BETA_COMPOSITION_PROFILE);
    profile.composition!.foodStrategies.value = ["snack-combo", "party-platter"];
    const composed = composeTierProducts<LoadedCatalogProduct>({
      tierKey: "good",
      tier: profile.composition!.tiers.good,
      profile,
      inquiry: facts({ guestCount: 20, diningPreference: "not_sure", spacePreference: "no_preference" }),
      attractionMode: ATTRACTION_MODES.RECOMMEND,
      selections: [],
      directProductIds: [],
      productsBySlug: bySlug,
      productsById: byId,
      isWeekend: () => false,
    });
    expect(composed.products.map((row) => row.slug)).toEqual(["bowling-1h", "party-platter", "fountain-drinks"]);
    const declined = composeTierProducts<LoadedCatalogProduct>({
      tierKey: "good",
      tier: profile.composition!.tiers.good,
      profile,
      inquiry: facts({ diningPreference: "none", spacePreference: "no_preference" }),
      attractionMode: ATTRACTION_MODES.RECOMMEND,
      selections: [],
      directProductIds: [],
      productsBySlug: bySlug,
      productsById: byId,
      isWeekend: () => false,
    });
    expect(declined.products.map((row) => row.slug)).not.toContain("fountain-drinks");
    expect(declined.products.map((row) => row.slug)).not.toContain("party-platter");
    const itinerary = composeEventItinerary({
      startTime: "17:00",
      foodFirst: true,
      products: composed.products.map((row) => ({
        id: row.id,
        name: row.name,
        kind: row.kind,
        durationMinutes: row.kind === "ADD_ON" ? null : row.durationMinutes,
      })),
    });
    expect(itinerary.itinerary.some((row) => row.label === "Fountain Drinks")).toBe(false);
    expect(itinerary.eventLengthMinutes).toBe(120);
  });

  it("uses the next configured room when the first room's resources conflict", async () => {
    const requirements = ["lane-side-room", "party-hall"].map((slug) => ({
      productId: slug,
      productName: slug,
      resourceTypeId: slug,
      resourceTypeSlug: slug,
      resourceTypeName: slug,
      inventoryConfigured: true,
      activeCount: 1,
      quantityRule: "FIXED",
      quantity: 1,
      guestsPerUnit: null,
      durationMinutes: 120,
      exclusive: true,
    }));
    const drafts = await buildCatalogEventPlans({
      organizationId: "org-beta",
      inquiry: facts({ guestCount: 12, spacePreference: "private", diningPreference: "not_sure" }),
      products: TENANT_BETA_PRODUCTS,
      profiles: [{ audience: "ADULTS", payload: TENANT_BETA_COMPOSITION_PROFILE }],
      resourceRequirements: requirements,
      currency: "USD",
      availabilityProvider: {
        check: async ({ resourceRequirements }) => {
          const lane = resourceRequirements?.some((row) => row.resourceTypeSlug === "lane-side-room");
          return {
            validated: true,
            available: !lane,
            note: "",
            types: lane
              ? [
                  {
                    resourceTypeSlug: "lane-side-room",
                    resourceTypeName: "Lane Side Room",
                    requestedQuantity: 1,
                    availableQuantity: 0,
                    inventoryConfigured: true,
                    conflict: true,
                    requiresStaffConfiguration: false,
                  },
                ]
              : [],
          };
        },
      },
    });
    const good = tier(drafts, EVENT_PLAN_TIERS.BUDGET);
    expect(good?.payload.spaces.map((row) => row.name)).toEqual(["Party Hall"]);
    expect(good?.payload.beverages?.map((row) => row.name)).toEqual(["Fountain Drinks"]);
    expect(good?.payload.includedItems?.some((row) => row.name === "Fountain Drinks")).toBe(false);
    expect(good?.payload.lineItems?.filter((row) => row.slug === "fountain-drinks")).toHaveLength(1);
    expect(good?.payload.durationMinutes).toBe(120);
    expect(good?.payload.spaces[0]?.durationMinutes).toBe(180);
    expect(good?.availabilityValidated).toBe(true);
  });
});
