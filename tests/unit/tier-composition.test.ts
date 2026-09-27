import { describe, expect, it } from "vitest";

import { composeEventItinerary } from "@/server/catalog/itinerary";
import { loadBookingCatalogDataset } from "@/server/catalog/load-dataset";
import { composeTierProducts } from "@/server/catalog/tier-composition";
import { buildCatalogEventPlans, type LoadedCatalogProduct } from "@/server/services/proposal-engine";
import {
  TENANT_BETA_COMPOSITION_PROFILE,
  TENANT_BETA_KIDS_COMPOSITION_PROFILE,
  TENANT_BETA_PRODUCTS,
} from "../fixtures/tenant-alpha-beta-catalogs";
import { ATTRACTION_MODES, PRODUCT_KINDS, type RecommendationProfilePayload } from "@/types/catalog";
import { EVENT_PLAN_TIERS, type EventPlanDraft } from "@/types/event-planner";
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
    expect(recommended?.customerFacingReason).toContain("Dining changes from");
    expect(recommended?.customerFacingReason).not.toMatch(/extra hour of Bowling|hour of Bowling/);
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
  });

  it("selects a fitting private room and leaves an unmet request explicit", async () => {
    const fitting = await plans(facts({ spacePreference: "private", guestCount: 40 }));
    expect(slugs(tier(fitting, EVENT_PLAN_TIERS.BUDGET))).toContain("skybox");
    expect(slugs(tier(fitting, EVENT_PLAN_TIERS.BUDGET))).not.toContain("lower-event-room");
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
    expect(tightGood?.estimatedTotalCents).not.toBe(openGood?.estimatedTotalCents);
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
    expect(adults.products.map((row) => row.slug)).toEqual(["bowling-1h", "snack-combo"]);
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
  });
});
