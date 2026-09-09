import { describe, expect, it } from "vitest";

import { buildEventPlans, isAttractionAgeEligible } from "@/server/event-planner/build-event-plans";
import { EVENT_PLAN_TIERS } from "@/types/event-planner";
import { SALES_KNOWLEDGE_TYPES as KNOWLEDGE } from "@/types/inquiry";

function item(overrides: {
  id: string;
  type?: string;
  name: string;
  priceText?: string | null;
  maxGuests?: number | null;
  minGuests?: number | null;
  customerFacingNotes?: string | null;
  details?: string;
}) {
  return {
    id: overrides.id,
    type: overrides.type ?? KNOWLEDGE.ATTRACTION,
    name: overrides.name,
    shortDescription: overrides.name,
    details: overrides.details ?? overrides.name,
    priceText: overrides.priceText ?? "$10/person",
    durationMinutes: 60,
    minGuests: overrides.minGuests ?? 1,
    maxGuests: overrides.maxGuests ?? null,
    customerFacingNotes: overrides.customerFacingNotes ?? null,
    salesNotes: null,
  };
}

function corporateCatalog() {
  return [
    item({ id: "kart", name: "Go-Karts", priceText: "$18/person" }),
    item({
      id: "axe",
      name: "Axe Throwing",
      priceText: "$20/person",
      customerFacingNotes: "Participants must be 16+.",
    }),
    item({
      id: "bowl",
      name: "Bowling",
      priceText: "$12/person",
      maxGuests: 6,
      details: "Up to 6 bowlers per lane.",
    }),
    item({ id: "laser", name: "Laser Tag", priceText: "$10/person" }),
    item({
      id: "slider",
      type: KNOWLEDGE.FOOD_BEVERAGE,
      name: "Catered Slider Bar",
      priceText: "$16/person",
    }),
    item({
      id: "pizza",
      type: KNOWLEDGE.FOOD_BEVERAGE,
      name: "Pizza & Light Fare",
      priceText: "$8/person",
    }),
    item({
      id: "fajita",
      type: KNOWLEDGE.FOOD_BEVERAGE,
      name: "Catered Fajita Bar",
      priceText: "$22/person",
    }),
    item({
      id: "room",
      type: KNOWLEDGE.ADD_ON,
      name: "Private Event Room",
      priceText: "$400",
      details: "Private event room for groups.",
      maxGuests: 120,
    }),
    item({
      id: "tiny-room",
      type: KNOWLEDGE.ADD_ON,
      name: "Small Party Room",
      priceText: "$50",
      details: "Private event room for small groups.",
      maxGuests: 12,
    }),
  ];
}

const inquiry = {
  eventType: "Corporate Event",
  eventGoal: "Employee Appreciation",
  guestCount: 24,
  guestMix: "mostly_adults",
  desiredDurationMinutes: 180,
  desiredDate: "2026-10-15",
  desiredStartTime: "18:00",
  budgetMin: 300_000,
  budgetMax: 500_000,
  diningPreference: "not_sure",
  spacePreference: "private",
  attractionInterestIds: ["kart"],
  customerNotes: null as string | null,
};

describe("buildEventPlans", () => {
  it("builds three distinct tenant-knowledge plans and does not invent prices", () => {
    const drafts = buildEventPlans({
      inquiry,
      currency: "USD",
      knowledge: [
        item({ id: "kart", name: "Go-Karts", priceText: "$12/person" }),
        item({
          id: "bowl",
          name: "Bowling",
          priceText: "$30/lane",
          maxGuests: 6,
          details: "Up to 6 bowlers per lane.",
        }),
        item({ id: "laser", name: "Laser Tag", priceText: "$8/person" }),
        item({ id: "golf", name: "Mini Golf", priceText: "$10/person" }),
        item({
          id: "food",
          type: KNOWLEDGE.FOOD_BEVERAGE,
          name: "Catered Food Bar",
          priceText: "$15/person",
        }),
        item({
          id: "room",
          type: KNOWLEDGE.ADD_ON,
          name: "Private Event Room",
          priceText: "Variable.",
          details: "Private event room for groups.",
        }),
      ],
    });

    expect(drafts).toHaveLength(3);
    expect(drafts.map((row) => row.tier)).toEqual([
      EVENT_PLAN_TIERS.BUDGET,
      EVENT_PLAN_TIERS.BEST_FIT,
      EVENT_PLAN_TIERS.PREMIUM,
    ]);
    expect(drafts[0].payload.activities.length).toBeLessThan(drafts[2].payload.activities.length);
    expect(drafts[1].payload.activities.some((row) => row.knowledgeItemId === "kart")).toBe(true);
    const bowling = drafts
      .flatMap((row) => row.payload.activities)
      .find((row) => row.knowledgeItemId === "bowl");
    expect(bowling?.quantity).toBe(4);
    expect(drafts.every((row) => row.availabilityValidated === false)).toBe(true);
    expect(drafts.some((row) => row.payload.spaces.length > 0)).toBe(true);
    expect(drafts.every((row) => row.estimatedTotalCents > 0)).toBe(true);
    expect(drafts.every((row) => row.payload.ranking != null)).toBe(true);
  });

  it("builds differentiated corporate plans near a $3,000–$5,000 budget", () => {
    const drafts = buildEventPlans({
      inquiry: {
        ...inquiry,
        guestCount: 75,
        diningPreference: "catered_slider",
        spacePreference: "private",
        attractionInterestIds: ["kart", "axe"],
        eventGoal: "Employee Appreciation",
      },
      currency: "USD",
      knowledge: corporateCatalog(),
    });

    expect(drafts).toHaveLength(3);
    const [budget, bestFit, premium] = drafts;
    expect(bestFit.title).toBe("Best Fit");
    expect(budget.payload.activities.length).toBeLessThanOrEqual(2);
    expect(premium.payload.activities.length).toBeGreaterThan(budget.payload.activities.length);
    expect(bestFit.payload.dining.label).toMatch(/slider/i);
    expect(bestFit.payload.spaces.some((space) => space.knowledgeItemId === "room")).toBe(true);
    expect(bestFit.payload.spaces.some((space) => space.knowledgeItemId === "tiny-room")).toBe(false);
    expect(bestFit.payload.activities.some((row) => row.knowledgeItemId === "kart")).toBe(true);
    expect(bestFit.estimatedTotalCents).toBeGreaterThanOrEqual(300_000);
    expect(bestFit.estimatedTotalCents).toBeLessThanOrEqual(540_000);
    expect(budget.estimatedTotalCents).toBeLessThan(bestFit.estimatedTotalCents);
    expect(premium.estimatedTotalCents).toBeGreaterThan(bestFit.estimatedTotalCents);
    expect(budget.durationMinutes).toBeLessThan(premium.durationMinutes);
    expect(new Set(drafts.map((row) => JSON.stringify(row.payload.activities.map((a) => a.knowledgeItemId)))).size).toBeGreaterThan(1);
  });

  it("does not return three plans dramatically above a low budget", () => {
    const drafts = buildEventPlans({
      inquiry: {
        ...inquiry,
        guestCount: 20,
        budgetMin: 0,
        budgetMax: 150_000,
        diningPreference: "pizza_light",
        attractionInterestIds: [],
      },
      currency: "USD",
      knowledge: corporateCatalog(),
    });

    expect(drafts).toHaveLength(3);
    expect(drafts.every((row) => row.estimatedTotalCents <= 150_000 * 1.2)).toBe(true);
    expect(drafts[1].estimatedTotalCents).toBeLessThanOrEqual(180_000);
  });

  it("excludes 16+ attractions for mostly children and returns no invented fallbacks", () => {
    expect(
      isAttractionAgeEligible(
        item({
          id: "axe",
          name: "Axe Throwing",
          customerFacingNotes: "Participants must be 16+.",
        }),
        "mostly_children",
      ),
    ).toBe(false);

    const empty = buildEventPlans({
      inquiry: { ...inquiry, guestMix: "mostly_children", attractionInterestIds: ["axe"] },
      currency: "USD",
      knowledge: [
        item({
          id: "axe",
          name: "Axe Throwing",
          priceText: "$30/person",
          customerFacingNotes: "Participants must be 16+.",
        }),
      ],
    });
    expect(empty).toEqual([]);

    const youth = buildEventPlans({
      inquiry: {
        ...inquiry,
        eventType: "School / Church",
        eventGoal: "Youth Outing",
        guestMix: "mostly_children",
        attractionInterestIds: ["axe", "bowl"],
      },
      currency: "USD",
      knowledge: corporateCatalog(),
    });
    expect(youth.length).toBeGreaterThan(0);
    expect(youth.flatMap((row) => row.payload.activities).every((row) => row.knowledgeItemId !== "axe")).toBe(
      true,
    );
  });

  it("respects a specific slider-bar dining preference when that product exists", () => {
    const drafts = buildEventPlans({
      inquiry: { ...inquiry, diningPreference: "catered_slider" },
      currency: "USD",
      knowledge: corporateCatalog(),
    });
    expect(drafts.every((row) => /slider/i.test(row.payload.dining.label))).toBe(true);
  });

  it("lets Not Sure dining differ across tiers when those offerings exist", () => {
    const drafts = buildEventPlans({
      inquiry: { ...inquiry, diningPreference: "not_sure", spacePreference: "no_preference" },
      currency: "USD",
      knowledge: corporateCatalog(),
    });
    expect(drafts[0].payload.dining.label).toMatch(/pizza/i);
    expect(drafts[1].payload.dining.label).toMatch(/slider/i);
    expect(drafts[2].payload.dining.label).toMatch(/fajita/i);
  });

  it("keeps a strong selected attraction in Best Fit when it is valid", () => {
    const drafts = buildEventPlans({
      inquiry: { ...inquiry, attractionInterestIds: ["axe"] },
      currency: "USD",
      knowledge: corporateCatalog(),
    });
    expect(drafts[1].payload.activities.some((row) => row.knowledgeItemId === "axe")).toBe(true);
  });

  it("honors notes that exclude an attraction without overriding age limits", () => {
    const drafts = buildEventPlans({
      inquiry: {
        ...inquiry,
        attractionInterestIds: ["axe", "kart"],
        customerNotes: "We do not want axe throwing. We really want go-karts.",
      },
      currency: "USD",
      knowledge: corporateCatalog(),
    });
    expect(drafts.flatMap((row) => row.payload.activities).every((row) => row.knowledgeItemId !== "axe")).toBe(
      true,
    );
    expect(drafts[1].payload.activities.some((row) => row.knowledgeItemId === "kart")).toBe(true);
  });

  it("returns no plans when tenant knowledge has no eligible attractions", () => {
    expect(
      buildEventPlans({
        inquiry,
        currency: "USD",
        knowledge: [
          item({
            id: "policy",
            type: KNOWLEDGE.POLICY,
            name: "Waiver",
            priceText: null,
          }),
        ],
      }),
    ).toEqual([]);
  });
});
