import { describe, expect, it } from "vitest";

import { quantityForRequirement } from "@/server/catalog/requirements";
import { PRODUCT_QUANTITY_RULES } from "@/types/catalog";
import { findNearbyAvailableStarts } from "@/server/services/nearby-availability";
import { selectCatalogProductsForTier, type LoadedCatalogProduct } from "@/server/services/proposal-engine";
import { ATTRACTION_MODES, PRODUCT_KINDS, type RecommendationProfilePayload } from "@/types/catalog";

function catalogProduct(overrides: Partial<LoadedCatalogProduct> & Pick<LoadedCatalogProduct, "id" | "slug" | "name">): LoadedCatalogProduct {
  return {
    kind: PRODUCT_KINDS.ATTRACTION,
    audience: "ALL",
    durationMinutes: 60,
    minGuests: null,
    maxGuests: null,
    weekendOnly: false,
    fulfillmentGroup: null,
    prices: [],
    serving: null,
    ...overrides,
  };
}

const profile: RecommendationProfilePayload = {
  defaultPackageSlugs: {
    good: "have-a-ball-bowling",
    better: "have-a-blast",
    best: "have-it-all",
  },
  defaultAttractionSlugs: [],
  fulfillmentGroups: {
    "have-a-ball": {
      default: "have-a-ball-bowling",
      options: { bowling: "have-a-ball-bowling", "mini-golf": "have-a-ball-mini-golf" },
    },
  },
  defaultFoodSlug: "pizza-pitcher-combo",
  diningPreferenceMap: { pizza_light: "pizza-pitcher-combo" },
  foodFirst: false,
  goodAddOnSlugs: [],
  betterAddOnSlugs: ["cookie-tray"],
  bestAddOnSlugs: ["cookie-tray"],
};

describe("catalog quantity rules", () => {
  it("uses configured guests per unit, not a global bowling or axe constant", () => {
    expect(
      quantityForRequirement(
        { quantityRule: PRODUCT_QUANTITY_RULES.PER_GUESTS, quantity: null, guestsPerUnit: 6, activeCount: 8 },
        30,
      ),
    ).toBe(5);
    expect(
      quantityForRequirement(
        { quantityRule: PRODUCT_QUANTITY_RULES.PER_GUESTS, quantity: null, guestsPerUnit: 5, activeCount: 2 },
        10,
      ),
    ).toBe(2);
    expect(
      quantityForRequirement(
        { quantityRule: PRODUCT_QUANTITY_RULES.PER_GUESTS, quantity: null, guestsPerUnit: 8, activeCount: 8 },
        20,
      ),
    ).toBe(3);
    expect(
      quantityForRequirement(
        { quantityRule: PRODUCT_QUANTITY_RULES.ALL_OF_TYPE, quantity: null, guestsPerUnit: null, activeCount: 8 },
        20,
      ),
    ).toBe(8);
    expect(
      quantityForRequirement(
        { quantityRule: PRODUCT_QUANTITY_RULES.ALL_OF_TYPE, quantity: null, guestsPerUnit: null, activeCount: 12 },
        20,
      ),
    ).toBe(12);
    expect(
      quantityForRequirement(
        { quantityRule: PRODUCT_QUANTITY_RULES.ALL_OF_TYPE, quantity: null, guestsPerUnit: null, activeCount: 0 },
        20,
      ),
    ).toBeNull();
    expect(
      quantityForRequirement(
        { quantityRule: PRODUCT_QUANTITY_RULES.FIXED, quantity: 7, guestsPerUnit: null, activeCount: 8 },
        40,
      ),
    ).toBe(7);
    expect(
      quantityForRequirement(
        { quantityRule: PRODUCT_QUANTITY_RULES.SPECIFIC_RESOURCE, quantity: 1, guestsPerUnit: null, activeCount: 1 },
        40,
      ),
    ).toBe(1);
    expect(
      quantityForRequirement(
        { quantityRule: PRODUCT_QUANTITY_RULES.LOCATION_EXCLUSIVE, quantity: null, guestsPerUnit: null, activeCount: 23 },
        40,
      ),
    ).toBe(1);
  });
});

describe("catalog proposal selection", () => {
  const products = [
    catalogProduct({ id: "ball-bowl", slug: "have-a-ball-bowling", name: "Have a Ball Bowling", kind: PRODUCT_KINDS.PACKAGE, fulfillmentGroup: "have-a-ball" }),
    catalogProduct({ id: "ball-golf", slug: "have-a-ball-mini-golf", name: "Have a Ball Mini Golf", kind: PRODUCT_KINDS.PACKAGE, fulfillmentGroup: "have-a-ball" }),
    catalogProduct({ id: "blast", slug: "have-a-blast", name: "Have a Blast", kind: PRODUCT_KINDS.PACKAGE }),
    catalogProduct({ id: "pizza", slug: "pizza-pitcher-combo", name: "Pizza", kind: PRODUCT_KINDS.FOOD }),
    catalogProduct({ id: "cookie", slug: "cookie-tray", name: "Cookie Tray", kind: PRODUCT_KINDS.FOOD }),
  ];
  const bySlug = new Map(products.map((row) => [row.slug, row]));
  const byId = new Map(products.map((row) => [row.id, row]));

  it("uses kids defaults when attractions should be recommended", () => {
    const good = selectCatalogProductsForTier({
      tierKey: "good",
      addOnSlugs: [],
      includeSpace: false,
      attractionMode: ATTRACTION_MODES.RECOMMEND,
      profile,
      productsBySlug: bySlug,
      productsById: byId,
      inquiry: {
        eventType: "Birthday Party",
        eventGoal: "Celebration",
        guestCount: 12,
        guestMix: "mostly_children",
        desiredDurationMinutes: 120,
        desiredDate: "2026-10-17",
        desiredStartTime: "14:00",
        budgetMin: null,
        budgetMax: null,
        diningPreference: "pizza_light",
        spacePreference: "no_preference",
        attractionInterestIds: [],
        customerNotes: null,
      },
    });
    expect(good.map((row) => row.slug)).toEqual(["have-a-ball-bowling", "pizza-pitcher-combo"]);
  });

  it("lets explicit attractions override defaults, including Have a Ball mini golf", () => {
    const good = selectCatalogProductsForTier({
      tierKey: "good",
      addOnSlugs: [],
      includeSpace: false,
      attractionMode: ATTRACTION_MODES.KNOWN,
      profile,
      productsBySlug: bySlug,
      productsById: byId,
      inquiry: {
        eventType: "Birthday Party",
        eventGoal: "Celebration",
        guestCount: 12,
        guestMix: "mostly_children",
        desiredDurationMinutes: 120,
        desiredDate: "2026-10-17",
        desiredStartTime: "14:00",
        budgetMin: null,
        budgetMax: null,
        diningPreference: "none",
        spacePreference: "no_preference",
        attractionInterestIds: ["ball-golf"],
        customerNotes: null,
      },
    });
    expect(good.map((row) => row.slug)).toEqual(["have-a-ball-mini-golf"]);
  });

  it("keeps one product when a conceptual interest expands to grouped duration SKUs", () => {
    const axes = [
      catalogProduct({
        id: "axe-60",
        slug: "axe-throwing-60",
        name: "Axe Throwing - 60 Minutes",
        fulfillmentGroup: "axe-throwing",
      }),
      catalogProduct({
        id: "axe-30",
        slug: "axe-throwing-30",
        name: "Axe Throwing - 30 Minutes",
        fulfillmentGroup: "axe-throwing",
      }),
      ...products,
    ];
    const good = selectCatalogProductsForTier({
      tierKey: "good",
      addOnSlugs: [],
      includeSpace: false,
      attractionMode: ATTRACTION_MODES.KNOWN,
      profile,
      productsBySlug: new Map(axes.map((row) => [row.slug, row])),
      productsById: new Map(axes.map((row) => [row.id, row])),
      inquiry: {
        eventType: "Birthday Party",
        eventGoal: "Celebration",
        guestCount: 12,
        guestMix: "mostly_adults",
        desiredDurationMinutes: 120,
        desiredDate: "2026-10-17",
        desiredStartTime: "14:00",
        budgetMin: null,
        budgetMax: null,
        diningPreference: "none",
        spacePreference: "no_preference",
        attractionInterestIds: ["axe-60", "axe-30"],
        customerNotes: null,
      },
    });
    expect(good.map((row) => row.slug)).toEqual(["axe-throwing-60"]);
  });
});

describe("nearby availability", () => {
  it("returns nearby validated starts without inserting reservations", async () => {
    const suggestions = await findNearbyAvailableStarts({
      startTime: "18:00",
      check: async (startTime) => ({
        validated: startTime === "18:30",
        available: startTime === "18:30",
        note: "",
        types: [],
      }),
    });
    expect(suggestions.map((row) => row.startTime)).toEqual(["18:30"]);
  });
});
