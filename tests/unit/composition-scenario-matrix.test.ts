import { describe, expect, it } from "vitest";

import { evaluateMeaningfulUpgrades, scheduledDurationMinutes } from "@/server/catalog/meaningful-upgrade";
import { loadBookingCatalogDataset } from "@/server/catalog/load-dataset";
import { buildEventPlans } from "@/server/event-planner/build-event-plans";
import { buildCatalogEventPlans, type LoadedCatalogProduct } from "@/server/services/proposal-engine";
import type { RecommendationProfilePayload } from "@/types/catalog";
import { PRODUCT_KINDS } from "@/types/catalog";
import { EVENT_PLAN_TIERS, UNCONFIRMED_DINING_LABEL, type EventPlanDraft } from "@/types/event-planner";
import { SALES_KNOWLEDGE_TYPES } from "@/types/inquiry";
import type { PlannerInquiryFacts } from "@/server/event-planner/build-event-plans";

const dataset = loadBookingCatalogDataset();
const products: LoadedCatalogProduct[] = dataset.products.map((product) => ({
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
  schedulingBehavior: product.schedulingBehavior ?? null,
  guestsPerUnit: product.requirements.find((row) => row.guestsPerUnit)?.guestsPerUnit ?? null,
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
    weekendDays: price.weekendDays ?? null,
    afterHour: price.afterHour ?? null,
    afterHourAmountCents: price.afterHourAmountCents ?? null,
    shoeAddOnCents: price.shoeAddOnCents ?? null,
    unitLabel: price.unitLabel ?? null,
  })),
  serving: product.serving
    ? { servesMin: product.serving.servesMin, servesMax: product.serving.servesMax, unitCount: product.serving.unitCount ?? null }
    : null,
  containsAlcohol: product.intakeDeclarations?.containsAlcohol === true,
}));

const profiles = dataset.recommendationProfiles.map((row) => ({
  audience: row.audience,
  payload: row.payload as RecommendationProfilePayload,
}));

function facts(overrides: Partial<PlannerInquiryFacts>): PlannerInquiryFacts {
  return {
    eventType: "Birthday Party",
    eventGoal: "Birthday Party",
    guestCount: 20,
    guestMix: "mostly_adults",
    desiredDurationMinutes: 180,
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

async function compose(
  inquiry: PlannerInquiryFacts,
  selections: Array<{ interestSlug: string; productIds: string[] }> = [],
) {
  return buildCatalogEventPlans({
    organizationId: "org",
    inquiry,
    products,
    profiles,
    resourceRequirements: [],
    currency: "USD",
    attractionSelections: selections,
  });
}

function tier(rows: EventPlanDraft[], name: string) {
  const match = rows.find((row) => row.tier === name);
  expect(match).toBeTruthy();
  return match as EventPlanDraft;
}

function slugs(plan: EventPlanDraft) {
  return [...new Set((plan.payload.lineItems ?? []).map((row) => row.slug).filter((row): row is string => Boolean(row)))];
}

function priced(plan: EventPlanDraft) {
  return (plan.payload.lineItems ?? []).map((row) => ({
    slug: row.slug,
    quantity: row.quantity,
    unitPriceCents: row.unitPriceCents,
    totalCents: row.totalCents,
  }));
}

function activityMinutes(plan: EventPlanDraft) {
  const seen = new Set<string>();
  return (plan.payload.lineItems ?? []).reduce((sum, row) => {
    const product = products.find((candidate) => candidate.slug === row.slug);
    if (
      !product ||
      seen.has(product.slug) ||
      (product.kind !== PRODUCT_KINDS.ATTRACTION && product.kind !== PRODUCT_KINDS.PACKAGE)
    ) {
      return sum;
    }
    seen.add(product.slug);
    return sum + scheduledDurationMinutes(product);
  }, 0);
}

function present(rows: EventPlanDraft[], name: string) {
  return rows.find((row) => row.tier === name) ?? null;
}

function upgrades(previous: EventPlanDraft, current: EventPlanDraft) {
  return evaluateMeaningfulUpgrades(
    (previous.payload.lineItems ?? []).map((row) => ({
      id: row.productId ?? row.slug ?? row.name,
      slug: row.slug ?? undefined,
      name: row.name,
      kind: row.kind ?? "",
      durationMinutes: products.find((product) => product.slug === row.slug)?.durationMinutes,
      fulfillmentGroup: products.find((product) => product.slug === row.slug)?.fulfillmentGroup,
    })),
    (current.payload.lineItems ?? []).map((row) => ({
      id: row.productId ?? row.slug ?? row.name,
      slug: row.slug ?? undefined,
      name: row.name,
      kind: row.kind ?? "",
      durationMinutes: products.find((product) => product.slug === row.slug)?.durationMinutes,
      fulfillmentGroup: products.find((product) => product.slug === row.slug)?.fulfillmentGroup,
    })),
  );
}

describe("Phase 4 composition scenario matrix", () => {
  it("1. Adults, 20 guests, 3 hours, food, bowling interest", async () => {
    const inquiry = facts({
      guestCount: 20,
      desiredDurationMinutes: 180,
      attractionInterestIds: ["bowling"],
    });
    const drafts = await compose(inquiry, [{ interestSlug: "bowling", productIds: ["bowling-1h"] }]);
    const good = tier(drafts, EVENT_PLAN_TIERS.BUDGET);
    const recommended = tier(drafts, EVENT_PLAN_TIERS.BEST_FIT);
    const premium = tier(drafts, EVENT_PLAN_TIERS.PREMIUM);
    expect(slugs(good)).toEqual(["bowling-1h", "pizza-pitcher-combo"]);
    expect(slugs(recommended)).toEqual(["bowling-1h", "slider-bar"]);
    expect(slugs(premium)).toEqual(["bowling-1h", "smokehouse-bbq"]);
    expect(priced(good).every((row) => row.totalCents > 0)).toBe(true);
    expect(activityMinutes(good)).toBeLessThanOrEqual(180);
    expect(activityMinutes(recommended)).toBeLessThanOrEqual(180);
    expect(upgrades(good, recommended).map((row) => row.kind)).toEqual(["dining"]);
    expect(upgrades(recommended, premium).map((row) => row.kind)).toEqual(["dining"]);
    expect(slugs(premium)).not.toContain("unlimited-arcade-1h");
    expect(slugs(premium)).not.toContain("axe-throwing-60");
    expect(good.durationMinutes).toBe(180);
    expect(good.payload.itineraryPrecise).not.toBe(false);
    expect((good.payload.itinerary ?? []).some((row) => row.role === "DINING")).toBe(false);
    expect(drafts).toHaveLength(3);
  });

  it("2. Adults, 25 guests, 2 hours, food, private space", async () => {
    const drafts = await compose(
      facts({
        guestCount: 25,
        desiredDurationMinutes: 120,
        spacePreference: "private",
      }),
    );
    const good = tier(drafts, EVENT_PLAN_TIERS.BUDGET);
    const recommended = tier(drafts, EVENT_PLAN_TIERS.BEST_FIT);
    const premium = tier(drafts, EVENT_PLAN_TIERS.PREMIUM);
    expect(slugs(good)).toEqual(expect.arrayContaining(["axe-throwing-30", "bowling-1h", "pizza-pitcher-combo", "lower-event-room"]));
    expect(slugs(recommended)).toEqual(expect.arrayContaining(["axe-throwing-60", "bowling-1h", "slider-bar", "lower-event-room"]));
    expect(slugs(premium)).toEqual(expect.arrayContaining(["axe-throwing-60", "bowling-1h", "smokehouse-bbq", "skybox"]));
    expect(activityMinutes(good)).toBeLessThanOrEqual(120);
    expect(activityMinutes(recommended)).toBeLessThanOrEqual(120);
    expect(good.durationMinutes).toBe(120);
    expect(premium.durationMinutes).toBe(120);
    expect(upgrades(good, recommended).map((row) => row.kind)).toEqual(expect.arrayContaining(["dining", "activity_time"]));
    expect(upgrades(recommended, premium).map((row) => row.kind)).toEqual(expect.arrayContaining(["dining", "space"]));
    expect(slugs(premium)).not.toContain("unlimited-arcade-1h");
  });

  it("3. Youth, 20 guests, 3 hours, food, laser and arcade interests", async () => {
    const drafts = await compose(
      facts({
        guestCount: 20,
        guestMix: "mostly_children",
        desiredDurationMinutes: 180,
        attractionInterestIds: ["laser-tag", "arcade"],
      }),
      [
        { interestSlug: "laser-tag", productIds: ["unlimited-laser-tag-90"] },
        { interestSlug: "arcade", productIds: ["unlimited-arcade-1h"] },
      ],
    );
    const good = tier(drafts, EVENT_PLAN_TIERS.BUDGET);
    const recommended = tier(drafts, EVENT_PLAN_TIERS.BEST_FIT);
    const premium = tier(drafts, EVENT_PLAN_TIERS.PREMIUM);
    expect(slugs(good)).toEqual(["unlimited-laser-tag-90", "unlimited-arcade-1h", "pizza-pitcher-combo"]);
    expect(slugs(recommended)).toEqual(["unlimited-laser-tag-90", "unlimited-arcade-1h", "slider-bar"]);
    expect(slugs(premium)).toEqual(["unlimited-laser-tag-90", "unlimited-arcade-1h", "smokehouse-bbq"]);
    expect(activityMinutes(good)).toBeLessThanOrEqual(180);
    expect(upgrades(good, recommended).map((row) => row.kind)).toEqual(["dining"]);
    expect(slugs(premium)).not.toContain("climbers-cove-90");
    expect(slugs(premium)).not.toContain("axe-throwing-60");
  });

  it("4. Youth, 30 guests, 2 hours, pizza preference", async () => {
    const drafts = await compose(
      facts({
        guestCount: 30,
        guestMix: "mostly_children",
        desiredDurationMinutes: 120,
        diningPreference: "pizza_light",
      }),
    );
    const recommended = present(drafts, EVENT_PLAN_TIERS.BEST_FIT) ?? present(drafts, EVENT_PLAN_TIERS.BUDGET);
    expect(recommended).toBeTruthy();
    expect(slugs(recommended!)).toEqual(["unlimited-laser-tag-90", "pizza-pitcher-combo"]);
    expect(activityMinutes(recommended!)).toBeLessThanOrEqual(120);
    expect(recommended!.durationMinutes).toBe(120);
    expect(slugs(recommended!)).not.toContain("unlimited-arcade-1h");
    expect(present(drafts, EVENT_PLAN_TIERS.PREMIUM) && present(drafts, EVENT_PLAN_TIERS.BEST_FIT)).toBeFalsy();
  });

  it("5. Mixed, 25 guests, 3 hours, food, no activity interests", async () => {
    const drafts = await compose(
      facts({
        guestCount: 25,
        guestMix: "mixed_ages",
        desiredDurationMinutes: 180,
      }),
    );
    const good = tier(drafts, EVENT_PLAN_TIERS.BUDGET);
    const recommended = tier(drafts, EVENT_PLAN_TIERS.BEST_FIT);
    const premium = tier(drafts, EVENT_PLAN_TIERS.PREMIUM);
    expect(slugs(good)).toEqual(["bowling-1h", "pizza-pitcher-combo"]);
    expect(slugs(recommended)).toEqual(["bowling-1h", "unlimited-arcade-1h", "slider-bar"]);
    expect(slugs(premium)).toEqual(["bowling-1h", "unlimited-arcade-1h", "smokehouse-bbq"]);
    expect(activityMinutes(recommended)).toBeLessThanOrEqual(180);
    expect(upgrades(good, recommended).map((row) => row.kind)).toEqual(expect.arrayContaining(["dining", "added_activity"]));
    expect(slugs(premium)).not.toContain("axe-throwing-60");
  });

  it("6. Mixed, 20 guests, 2 hours, bowling, no food", async () => {
    const drafts = await compose(
      facts({
        guestCount: 20,
        guestMix: "mixed_ages",
        desiredDurationMinutes: 120,
        diningPreference: "none",
        attractionInterestIds: ["bowling"],
      }),
      [{ interestSlug: "bowling", productIds: ["bowling-1h"] }],
    );
    const good = tier(drafts, EVENT_PLAN_TIERS.BUDGET);
    const recommended = present(drafts, EVENT_PLAN_TIERS.BEST_FIT) ?? present(drafts, EVENT_PLAN_TIERS.PREMIUM);
    expect(recommended).toBeTruthy();
    expect(slugs(good)).toEqual(["bowling-1h"]);
    expect(slugs(recommended!)).toEqual(["bowling-1h", "unlimited-arcade-1h"]);
    expect(activityMinutes(recommended!)).toBeLessThanOrEqual(120);
    expect(upgrades(good, recommended!).map((row) => row.kind)).toEqual(["added_activity"]);
    expect(slugs(recommended!).some((slug) => slug.includes("pizza") || slug.includes("bar"))).toBe(false);
    expect(present(drafts, EVENT_PLAN_TIERS.PREMIUM) && present(drafts, EVENT_PLAN_TIERS.BEST_FIT)).toBeFalsy();
  });

  it("7. Adults, no food, no private room", async () => {
    const drafts = await compose(
      facts({
        diningPreference: "none",
        spacePreference: "none",
      }),
    );
    const good = tier(drafts, EVENT_PLAN_TIERS.BUDGET);
    const recommended = present(drafts, EVENT_PLAN_TIERS.BEST_FIT) ?? present(drafts, EVENT_PLAN_TIERS.PREMIUM);
    expect(recommended).toBeTruthy();
    expect(slugs(good)).toEqual(["axe-throwing-30", "bowling-1h"]);
    expect(slugs(recommended!)).toEqual(["axe-throwing-60", "bowling-1h"]);
    expect(upgrades(good, recommended!).map((row) => row.kind)).toEqual(["activity_time"]);
    expect(slugs(recommended!)).not.toContain("skybox");
    expect(slugs(recommended!)).not.toContain("pizza-pitcher-combo");
    expect(present(drafts, EVENT_PLAN_TIERS.PREMIUM) && present(drafts, EVENT_PLAN_TIERS.BEST_FIT)).toBeFalsy();
  });

  it("8. Youth, private room requested", async () => {
    const drafts = await compose(
      facts({
        guestCount: 20,
        guestMix: "mostly_children",
        spacePreference: "private",
      }),
    );
    const good = tier(drafts, EVENT_PLAN_TIERS.BUDGET);
    const recommended = tier(drafts, EVENT_PLAN_TIERS.BEST_FIT);
    const premium = tier(drafts, EVENT_PLAN_TIERS.PREMIUM);
    expect(slugs(good)).toEqual(expect.arrayContaining(["unlimited-laser-tag-90", "pizza-pitcher-combo", "lower-event-room"]));
    expect(slugs(recommended)).toEqual(
      expect.arrayContaining(["unlimited-laser-tag-90", "unlimited-arcade-1h", "slider-bar", "lower-event-room"]),
    );
    expect(slugs(premium)).toEqual(
      expect.arrayContaining(["unlimited-laser-tag-90", "unlimited-arcade-1h", "smokehouse-bbq", "climbers-cove-90"]),
    );
    expect(upgrades(recommended, premium).map((row) => row.kind)).toEqual(expect.arrayContaining(["dining", "space"]));
  });

  it("9. Adult event with an explicit eligible food preference", async () => {
    const drafts = await compose(facts({ diningPreference: "pizza_light" }));
    const good = tier(drafts, EVENT_PLAN_TIERS.BUDGET);
    const recommended = present(drafts, EVENT_PLAN_TIERS.BEST_FIT) ?? present(drafts, EVENT_PLAN_TIERS.PREMIUM);
    expect(recommended).toBeTruthy();
    expect(slugs(good)).toEqual(["axe-throwing-30", "bowling-1h", "pizza-pitcher-combo"]);
    expect(slugs(recommended!)).toEqual(["axe-throwing-60", "bowling-1h", "pizza-pitcher-combo"]);
    expect(upgrades(good, recommended!).map((row) => row.kind)).toEqual(["activity_time"]);
    expect(present(drafts, EVENT_PLAN_TIERS.PREMIUM) && present(drafts, EVENT_PLAN_TIERS.BEST_FIT)).toBeFalsy();
  });

  it("10. Knowledge-fallback tenant with no catalog food products", () => {
    const drafts = buildEventPlans({
      inquiry: facts({ diningPreference: "not_sure", spacePreference: "no_preference" }),
      currency: "USD",
      knowledge: [
        {
          id: "bowl",
          type: SALES_KNOWLEDGE_TYPES.ATTRACTION,
          name: "R1 Bowling",
          shortDescription: "Bowling",
          details: "Bowling",
          priceText: "$30/lane",
          durationMinutes: 60,
          minGuests: 1,
          maxGuests: 6,
          customerFacingNotes: null,
          salesNotes: null,
        },
        {
          id: "bowl-r5",
          type: SALES_KNOWLEDGE_TYPES.ATTRACTION,
          name: "R5 Bowling",
          shortDescription: "Bowling",
          details: "Bowling",
          priceText: "$40/lane",
          durationMinutes: 60,
          minGuests: 1,
          maxGuests: 6,
          customerFacingNotes: null,
          salesNotes: null,
        },
        {
          id: "laser",
          type: SALES_KNOWLEDGE_TYPES.ATTRACTION,
          name: "Laser Tag",
          shortDescription: "Laser",
          details: "Laser",
          priceText: "$10/person",
          durationMinutes: 90,
          minGuests: 1,
          maxGuests: null,
          customerFacingNotes: null,
          salesNotes: null,
        },
      ],
    });
    expect(drafts).toHaveLength(3);
    for (const draft of drafts) {
      expect(draft.payload.dining.label).toBe(UNCONFIRMED_DINING_LABEL);
      expect(draft.payload.dining.priceCents).toBe(0);
      expect(draft.payload.dining.knowledgeItemId).toBeUndefined();
      expect(draft.payload.dining.label).not.toMatch(/Not Sure/);
      expect(draft.durationMinutes).toBe(180);
      expect(draft.payload.spaces).toEqual([]);
      const bowlingNames = draft.payload.activities.filter((row) => /bowling/i.test(row.name));
      expect(bowlingNames.length).toBeLessThanOrEqual(1);
    }
  });

  it("does not add irrelevant upgrades", async () => {
    const adultBowling = await compose(
      facts({ attractionInterestIds: ["bowling"] }),
      [{ interestSlug: "bowling", productIds: ["bowling-1h"] }],
    );
    for (const draft of adultBowling) {
      expect(slugs(draft)).not.toContain("unlimited-arcade-1h");
      expect(slugs(draft)).not.toContain("unlimited-laser-tag-90");
      expect(slugs(draft)).not.toContain("climbers-cove-90");
    }

    const mixed = await compose(facts({ guestMix: "mixed_ages" }));
    for (const draft of mixed) {
      expect(slugs(draft)).not.toContain("axe-throwing-30");
      expect(slugs(draft)).not.toContain("axe-throwing-60");
    }

    const noFood = await compose(facts({ diningPreference: "none" }));
    for (const draft of noFood) {
      expect(draft.payload.lineItems?.some((row) => row.kind === PRODUCT_KINDS.FOOD)).toBe(false);
    }

    const noRoom = await compose(facts({ spacePreference: "none" }));
    for (const draft of noRoom) {
      expect(slugs(draft)).not.toContain("skybox");
      expect(slugs(draft)).not.toContain("lower-event-room");
    }
  });
});

describe("Phase 5 youth interests and schedule windows", () => {
  it("keeps an explicit laser-only youth request on Good and upgrades dining later", async () => {
    const drafts = await compose(
      facts({
        guestMix: "mostly_children",
        attractionInterestIds: ["laser-tag"],
      }),
      [{ interestSlug: "laser-tag", productIds: ["unlimited-laser-tag-90"] }],
    );
    expect(slugs(tier(drafts, EVENT_PLAN_TIERS.BUDGET))).toEqual(["unlimited-laser-tag-90", "pizza-pitcher-combo"]);
    expect(slugs(tier(drafts, EVENT_PLAN_TIERS.BEST_FIT))).toEqual(
      expect.arrayContaining(["unlimited-laser-tag-90", "unlimited-arcade-1h", "slider-bar"]),
    );
    expect(drafts).toHaveLength(3);
  });

  it("keeps an explicit arcade-only youth request on Good", async () => {
    const drafts = await compose(
      facts({
        guestMix: "mostly_children",
        attractionInterestIds: ["arcade"],
      }),
      [{ interestSlug: "arcade", productIds: ["unlimited-arcade-1h"] }],
    );
    expect(slugs(tier(drafts, EVENT_PLAN_TIERS.BUDGET))).toEqual(["unlimited-arcade-1h", "pizza-pitcher-combo"]);
    expect(slugs(tier(drafts, EVENT_PLAN_TIERS.BUDGET))).not.toContain("unlimited-laser-tag-90");
  });

  it("does not drop explicit laser and arcade from Good to manufacture an upgrade", async () => {
    const drafts = await compose(
      facts({
        guestMix: "mostly_children",
        desiredDurationMinutes: 180,
        attractionInterestIds: ["laser-tag", "arcade"],
      }),
      [
        { interestSlug: "laser-tag", productIds: ["unlimited-laser-tag-90"] },
        { interestSlug: "arcade", productIds: ["unlimited-arcade-1h"] },
      ],
    );
    const good = tier(drafts, EVENT_PLAN_TIERS.BUDGET);
    expect(slugs(good)).toEqual(["unlimited-laser-tag-90", "unlimited-arcade-1h", "pizza-pitcher-combo"]);
    expect(good.payload.itineraryPrecise).not.toBe(false);
    expect(good.durationMinutes).toBe(180);
  });

  it("reports a 2-hour laser plus arcade overflow instead of inventing a longer timeline", async () => {
    const drafts = await compose(
      facts({
        guestMix: "mostly_children",
        desiredDurationMinutes: 120,
        attractionInterestIds: ["laser-tag", "arcade"],
      }),
      [
        { interestSlug: "laser-tag", productIds: ["unlimited-laser-tag-90"] },
        { interestSlug: "arcade", productIds: ["unlimited-arcade-1h"] },
      ],
    );
    const good = tier(drafts, EVENT_PLAN_TIERS.BUDGET);
    expect(slugs(good)).toEqual(expect.arrayContaining(["unlimited-laser-tag-90", "unlimited-arcade-1h"]));
    expect(good.durationMinutes).toBe(120);
    expect(good.payload.itineraryPrecise).toBe(false);
    expect(good.payload.scheduleLimitation).toMatch(/longer than the requested 2 hours/i);
    expect((good.payload.itinerary ?? []).some((row) => row.role === "ACTIVITY")).toBe(false);
  });

  it("skips weekend-only laser on a weekday and says so", async () => {
    const drafts = await compose(
      facts({
        guestMix: "mostly_children",
        desiredDate: "2026-10-15",
        attractionInterestIds: ["laser-tag"],
      }),
      [{ interestSlug: "laser-tag", productIds: ["unlimited-laser-tag-90"] }],
    );
    const good = drafts[0];
    expect(good).toBeTruthy();
    expect(slugs(good!)).not.toContain("unlimited-laser-tag-90");
    expect(good!.payload.unfulfilledInterestSlugs).toContain("laser-tag");
    expect(good!.customerFacingReason).toMatch(/could not be included/i);
  });

  it("defaults youth with no interests to laser on Good and arcade as a later upgrade", async () => {
    const drafts = await compose(facts({ guestMix: "mostly_children", guestCount: 20 }));
    expect(slugs(tier(drafts, EVENT_PLAN_TIERS.BUDGET))).toEqual(["unlimited-laser-tag-90", "pizza-pitcher-combo"]);
    expect(slugs(tier(drafts, EVENT_PLAN_TIERS.BEST_FIT))).toEqual(
      expect.arrayContaining(["unlimited-laser-tag-90", "unlimited-arcade-1h", "slider-bar"]),
    );
  });
});
