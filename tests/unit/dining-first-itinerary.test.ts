import { describe, expect, it } from "vitest";

import { diningPlacementFromProfile } from "@/server/catalog/dining-placement";
import { composeEventItinerary } from "@/server/catalog/itinerary";
import { loadBookingCatalogDataset } from "@/server/catalog/load-dataset";
import { isEventPlanScheduleInfeasible, readEventPlanPayload } from "@/lib/event-planner/payload";
import { buildCatalogEventPlans, type LoadedCatalogProduct } from "@/server/services/proposal-engine";
import type { PlannerInquiryFacts } from "@/server/event-planner/build-event-plans";
import type { RecommendationProfilePayload } from "@/types/catalog";
import { EVENT_PLAN_TIERS, type EventPlanDraft } from "@/types/event-planner";
import { TENANT_ALPHA_ADULT_PROFILE, TENANT_BETA_ADULT_PROFILE } from "../fixtures/tenant-alpha-beta-catalogs";

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

function facts(overrides: Partial<PlannerInquiryFacts> = {}): PlannerInquiryFacts {
  return {
    eventType: "Birthday Party",
    eventGoal: "Birthday Party",
    guestCount: 20,
    guestMix: "mostly_adults",
    desiredDurationMinutes: 180,
    desiredDate: "2026-10-27",
    desiredStartTime: "17:00",
    budgetMin: null,
    budgetMax: null,
    diningPreference: "not_sure",
    spacePreference: "no_preference",
    attractionInterestIds: ["bowling"],
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

function sampleLines(plan: EventPlanDraft) {
  return (plan.payload.itinerary ?? [])
    .filter((row) => row.role !== "SPACE")
    .map((row) => `${row.startTime}–${row.endTime} ${row.label}`);
}

function bowlingOnlySelections() {
  return [{ interestSlug: "bowling", productIds: ["bowling-1h"] }];
}

function axeOnlySelections() {
  return [{ interestSlug: "axe-throwing", productIds: ["axe-throwing-60", "axe-throwing-30"] }];
}

function bowlingAndAxeSelections() {
  return [
    { interestSlug: "axe-throwing", productIds: ["axe-throwing-60", "axe-throwing-30"] },
    { interestSlug: "bowling", productIds: ["bowling-1h"] },
  ];
}

describe("dining-first itineraries and explicit attractions", () => {
  it("1. bowling-only intake keeps bowling and the dining ladder", async () => {
    const drafts = await compose(facts(), bowlingOnlySelections());
    expect(slugs(tier(drafts, EVENT_PLAN_TIERS.BUDGET))).toEqual(["bowling-1h", "pizza-pitcher-combo"]);
    expect(slugs(tier(drafts, EVENT_PLAN_TIERS.BEST_FIT))).toEqual(["bowling-1h", "slider-bar"]);
    expect(slugs(tier(drafts, EVENT_PLAN_TIERS.PREMIUM))).toEqual(["bowling-1h", "smokehouse-bbq"]);
    for (const draft of drafts) {
      expect(slugs(draft)).not.toContain("axe-throwing-30");
      expect(slugs(draft)).not.toContain("axe-throwing-60");
      expect(slugs(draft)).not.toContain("unlimited-laser-tag-90");
      expect(slugs(draft)).not.toContain("unlimited-arcade-1h");
    }
  });

  it("2. axe-only intake keeps axe and does not add bowling", async () => {
    const drafts = await compose(facts({ attractionInterestIds: ["axe-throwing"] }), axeOnlySelections());
    expect(slugs(tier(drafts, EVENT_PLAN_TIERS.BUDGET))).toEqual(["axe-throwing-30", "pizza-pitcher-combo"]);
    expect(slugs(tier(drafts, EVENT_PLAN_TIERS.BEST_FIT))).toEqual(["axe-throwing-60", "slider-bar"]);
    expect(slugs(tier(drafts, EVENT_PLAN_TIERS.PREMIUM))).toEqual(["axe-throwing-60", "smokehouse-bbq"]);
    for (const draft of drafts) {
      expect(slugs(draft)).not.toContain("bowling-1h");
    }
  });

  it("3. bowling and axe explicitly selected stay on every tier", async () => {
    const drafts = await compose(
      facts({ attractionInterestIds: ["axe-throwing", "bowling"] }),
      bowlingAndAxeSelections(),
    );
    expect(slugs(tier(drafts, EVENT_PLAN_TIERS.BUDGET))).toEqual([
      "axe-throwing-30",
      "bowling-1h",
      "pizza-pitcher-combo",
    ]);
    expect(slugs(tier(drafts, EVENT_PLAN_TIERS.BEST_FIT))).toEqual(["axe-throwing-60", "bowling-1h", "slider-bar"]);
    expect(slugs(tier(drafts, EVENT_PLAN_TIERS.PREMIUM))).toEqual(["axe-throwing-60", "bowling-1h", "smokehouse-bbq"]);
  });

  it("4. open-to-suggestions uses tenant adult recommendation cores", async () => {
    const drafts = await compose(facts({ attractionInterestIds: [], attractionMode: "recommend" }));
    expect(slugs(tier(drafts, EVENT_PLAN_TIERS.BUDGET))).toEqual(
      expect.arrayContaining(["axe-throwing-30", "bowling-1h", "pizza-pitcher-combo"]),
    );
    expect(slugs(tier(drafts, EVENT_PLAN_TIERS.BEST_FIT))).toEqual(
      expect.arrayContaining(["axe-throwing-60", "bowling-1h", "slider-bar"]),
    );
  });

  it("5. no-attraction fallback matches the documented adult cores", async () => {
    const drafts = await compose(facts({ attractionInterestIds: [] }));
    expect(slugs(tier(drafts, EVENT_PLAN_TIERS.BUDGET))).toEqual(
      expect.arrayContaining(["axe-throwing-30", "bowling-1h"]),
    );
  });

  it("6-8. dining-first good, recommended, and premium bowling-only itineraries", async () => {
    const drafts = await compose(facts(), bowlingOnlySelections());
    expect(sampleLines(tier(drafts, EVENT_PLAN_TIERS.BUDGET))).toEqual([
      "17:00–18:00 Dining: Pizza & Pitcher Combination",
      "18:00–19:00 Bowling - 1 Hour",
    ]);
    expect(sampleLines(tier(drafts, EVENT_PLAN_TIERS.BEST_FIT))).toEqual([
      "17:00–18:00 Dining: Slider Bar",
      "18:00–19:00 Bowling - 1 Hour",
    ]);
    expect(sampleLines(tier(drafts, EVENT_PLAN_TIERS.PREMIUM))).toEqual([
      "17:00–18:00 Dining: Smokehouse BBQ",
      "18:00–19:00 Bowling - 1 Hour",
    ]);
    for (const draft of drafts) {
      expect(draft.durationMinutes).toBe(180);
      expect(draft.payload.itineraryPrecise).not.toBe(false);
    }
  });

  it("9. youth events with dining still start with the meal", async () => {
    const drafts = await compose(
      facts({
        guestMix: "mostly_children",
        attractionInterestIds: ["laser-tag"],
        desiredDate: "2026-10-24",
      }),
      [{ interestSlug: "laser-tag", productIds: ["unlimited-laser-tag-90"] }],
    );
    expect(sampleLines(tier(drafts, EVENT_PLAN_TIERS.BUDGET))[0]).toBe("17:00–18:00 Dining: Pizza & Pitcher Combination");
    expect(sampleLines(tier(drafts, EVENT_PLAN_TIERS.BEST_FIT))[0]).toBe("17:00–18:00 Dining: Slider Bar");
    expect(sampleLines(tier(drafts, EVENT_PLAN_TIERS.PREMIUM))[0]).toBe("17:00–18:00 Dining: Smokehouse BBQ");
    expect(slugs(tier(drafts, EVENT_PLAN_TIERS.BEST_FIT))).not.toContain("unlimited-arcade-1h");
  });

  it("10. mixed-age events with dining start with the meal", async () => {
    const drafts = await compose(
      facts({ guestMix: "mixed_ages", attractionInterestIds: ["bowling"] }),
      bowlingOnlySelections(),
    );
    expect(sampleLines(tier(drafts, EVENT_PLAN_TIERS.BUDGET))).toEqual([
      "17:00–18:00 Dining: Pizza & Pitcher Combination",
      "18:00–19:00 Bowling - 1 Hour",
    ]);
    expect(slugs(tier(drafts, EVENT_PLAN_TIERS.PREMIUM))).toEqual(["bowling-1h", "smokehouse-bbq"]);
  });

  it("11. no-food events keep activity-only scheduling", async () => {
    const drafts = await compose(facts({ diningPreference: "none" }), bowlingOnlySelections());
    const remaining = drafts[0];
    expect(remaining).toBeTruthy();
    expect(slugs(remaining!)).toEqual(["bowling-1h"]);
    expect(sampleLines(remaining!)).toEqual(["17:00–18:00 Bowling - 1 Hour"]);
    expect((remaining!.payload.itinerary ?? []).some((row) => row.role === "DINING")).toBe(false);
  });

  it("12. missing event start time still sequences dining first from the clock fallback", () => {
    const composed = composeEventItinerary({
      startTime: null,
      foodFirst: true,
      requestedMinutes: 180,
      products: [
        { id: "food", name: "Slider Bar", kind: "FOOD", durationMinutes: 60 },
        { id: "bowl", name: "Bowling - 1 Hour", kind: "ATTRACTION", durationMinutes: 60, hasResourceRequirements: true },
      ],
    });
    expect(composed.itinerary.map((row) => `${row.startTime}–${row.endTime} ${row.role}`)).toEqual([
      "12:00–13:00 DINING",
      "13:00–14:00 ACTIVITY",
    ]);
    expect(composed.precise).toBe(true);
  });

  it("13. short-duration dining plus laser is an infeasible schedule", async () => {
    const drafts = await compose(
      facts({
        guestMix: "mostly_children",
        desiredDate: "2026-10-24",
        desiredDurationMinutes: 120,
        attractionInterestIds: ["laser-tag"],
      }),
      [{ interestSlug: "laser-tag", productIds: ["unlimited-laser-tag-90"] }],
    );
    const good = tier(drafts, EVENT_PLAN_TIERS.BUDGET);
    expect(slugs(good)).toEqual(expect.arrayContaining(["unlimited-laser-tag-90", "pizza-pitcher-combo"]));
    expect(good.durationMinutes).toBe(120);
    expect(good.payload.itineraryPrecise).toBe(false);
    expect(good.payload.scheduleLimitation).toMatch(/Laser Tag/i);
    expect(good.payload.scheduleLimitation).toMatch(/longer than the requested 2 hours/i);
    expect((good.payload.itinerary ?? []).some((row) => row.role === "ACTIVITY")).toBe(false);
    expect(isEventPlanScheduleInfeasible(good.payload)).toBe(true);
  });

  it("14. leftover event time stays unscheduled", async () => {
    const drafts = await compose(facts(), bowlingOnlySelections());
    const good = tier(drafts, EVENT_PLAN_TIERS.BUDGET);
    expect(sampleLines(good)).toHaveLength(2);
    expect(good.durationMinutes).toBe(180);
    expect(good.payload.itineraryPrecise).not.toBe(false);
    expect(slugs(good)).not.toContain("axe-throwing-30");
  });

  it("15. a tenant without dining-first keeps flexible dining off the activity clock", () => {
    expect(diningPlacementFromProfile(TENANT_BETA_ADULT_PROFILE)).toBe("flexible");
    const composed = composeEventItinerary({
      startTime: "17:00",
      foodFirst: TENANT_BETA_ADULT_PROFILE.foodFirst,
      diningPlacement: TENANT_BETA_ADULT_PROFILE.diningPlacement,
      requestedMinutes: 180,
      products: [
        { id: "food", name: "Snack Combo", kind: "FOOD", durationMinutes: 60 },
        { id: "bowl", name: "Bowling", kind: "ATTRACTION", durationMinutes: 60, hasResourceRequirements: true },
      ],
    });
    expect(composed.itinerary.filter((row) => row.role === "DINING")).toEqual([]);
    expect(composed.includedItems.some((row) => row.name === "Snack Combo")).toBe(true);
    expect(composed.itinerary.filter((row) => row.role === "ACTIVITY").map((row) => row.startTime)).toEqual(["17:00"]);
  });

  it("16. tenant isolation: dining-first does not leak another tenant's food", () => {
    expect(diningPlacementFromProfile(TENANT_ALPHA_ADULT_PROFILE)).toBe("first");
    const alpha = composeEventItinerary({
      startTime: "17:00",
      foodFirst: TENANT_ALPHA_ADULT_PROFILE.foodFirst,
      requestedMinutes: 120,
      products: [
        { id: "food", name: "Pizza Combo", kind: "FOOD", durationMinutes: 45 },
        { id: "bowl", name: "Bowling", kind: "ATTRACTION", durationMinutes: 60 },
      ],
    });
    const beta = composeEventItinerary({
      startTime: "17:00",
      foodFirst: TENANT_BETA_ADULT_PROFILE.foodFirst,
      requestedMinutes: 120,
      products: [
        { id: "food", name: "Snack Combo", kind: "FOOD", durationMinutes: 45 },
        { id: "bowl", name: "Bowling", kind: "ATTRACTION", durationMinutes: 60 },
      ],
    });
    expect(alpha.itinerary.map((row) => row.label)).toEqual(["Dining: Pizza Combo", "Bowling"]);
    expect(alpha.itinerary.some((row) => row.label.includes("Snack Combo"))).toBe(false);
    expect(beta.itinerary.map((row) => row.label)).toEqual(["Bowling"]);
    expect(beta.itinerary.some((row) => row.label.includes("Pizza Combo"))).toBe(false);
  });

  it("17. booking guard stays tied to scheduleLimitation", () => {
    expect(
      isEventPlanScheduleInfeasible({
        itineraryPrecise: false,
        scheduleLimitation: "These activities need 2 hours 30 minutes, which is longer than the requested 2 hours.",
      }),
    ).toBe(true);
    expect(isEventPlanScheduleInfeasible({ itineraryPrecise: true, scheduleLimitation: null })).toBe(false);
  });

  it("18. public proposal copy uses Sample itinerary and dining labels", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const source = readFileSync(join(process.cwd(), "src/components/layout/public-event-plan-view.tsx"), "utf8");
    expect(source).toContain('title="Sample itinerary"');
    expect(source).not.toContain('title="Sample timeline"');
    const drafts = await compose(facts(), bowlingOnlySelections());
    expect(sampleLines(tier(drafts, EVENT_PLAN_TIERS.BEST_FIT))[0]).toBe("17:00–18:00 Dining: Slider Bar");
  });

  it("19. bowling-only dining quantities and prices stay on the existing ladder", async () => {
    const drafts = await compose(facts(), bowlingOnlySelections());
    const pizza = tier(drafts, EVENT_PLAN_TIERS.BUDGET).payload.lineItems?.find((row) => row.slug === "pizza-pitcher-combo");
    const slider = tier(drafts, EVENT_PLAN_TIERS.BEST_FIT).payload.lineItems?.find((row) => row.slug === "slider-bar");
    const bbq = tier(drafts, EVENT_PLAN_TIERS.PREMIUM).payload.lineItems?.find((row) => row.slug === "smokehouse-bbq");
    expect(pizza?.quantity).toBe(5);
    expect(pizza?.totalCents).toBe(10_000);
    expect(slider?.quantity).toBe(20);
    expect(slider?.totalCents).toBe(60_000);
    expect(bbq?.quantity).toBe(20);
    expect(bbq?.totalCents).toBe(70_000);
  });

  it("does not rewrite a stored snapshot that omitted dining from the itinerary", () => {
    const stored = {
      guestCount: 20,
      eventDate: "2026-10-27",
      startTime: "17:00",
      durationMinutes: 180,
      activities: [{ knowledgeItemId: "bowl", name: "Bowling - 1 Hour", quantity: 1, priceCents: 0 }],
      dining: { label: "Pizza & Pitcher Combination", priceCents: 10000 },
      spaces: [],
      schedule: ["17:00–18:00 Bowling - 1 Hour"],
      itinerary: [{ startTime: "17:00", endTime: "18:00", label: "Bowling - 1 Hour", role: "ACTIVITY" as const }],
      itineraryPrecise: true,
    };
    expect(readEventPlanPayload(stored).itinerary).toEqual(stored.itinerary);
    expect(readEventPlanPayload(stored).itinerary?.some((row) => row.role === "DINING")).toBe(false);
  });

  it("sequences bowling and axe after dining using catalog durations", async () => {
    const drafts = await compose(
      facts({ attractionInterestIds: ["axe-throwing", "bowling"] }),
      bowlingAndAxeSelections(),
    );
    expect(sampleLines(tier(drafts, EVENT_PLAN_TIERS.BUDGET))).toEqual([
      "17:00–18:00 Dining: Pizza & Pitcher Combination",
      "18:00–18:30 Axe Throwing - 30 Minutes",
      "18:30–19:30 Bowling - 1 Hour",
    ]);
    expect(sampleLines(tier(drafts, EVENT_PLAN_TIERS.BEST_FIT))).toEqual([
      "17:00–18:00 Dining: Slider Bar",
      "18:00–19:00 Axe Throwing - 60 Minutes",
      "19:00–20:00 Bowling - 1 Hour",
    ]);
    expect(sampleLines(tier(drafts, EVENT_PLAN_TIERS.PREMIUM))).toEqual([
      "17:00–18:00 Dining: Smokehouse BBQ",
      "18:00–19:00 Axe Throwing - 60 Minutes",
      "19:00–20:00 Bowling - 1 Hour",
    ]);
  });
});
