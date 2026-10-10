import { describe, expect, it } from "vitest";

import {
  applyPromotions,
  PROMOTION_TYPES,
  type PricingPromotionRule,
} from "@/server/catalog/promotions";
import { priceProduct } from "@/server/catalog/pricing";
import { PRODUCT_KINDS, PRODUCT_PRICE_STRATEGIES, type CatalogProductInput, type PriceQuote } from "@/types/catalog";

function product(
  overrides: Partial<CatalogProductInput> & Pick<CatalogProductInput, "slug" | "name" | "prices">,
): CatalogProductInput {
  return {
    id: overrides.id ?? overrides.slug,
    kind: PRODUCT_KINDS.ATTRACTION,
    audience: "ALL",
    durationMinutes: 60,
    minGuests: null,
    maxGuests: null,
    weekendOnly: false,
    fulfillmentGroup: null,
    serving: null,
    ...overrides,
  };
}

function quoteFor(productInput: CatalogProductInput, guestCount = 12, eventDate = "2026-10-15"): PriceQuote {
  return priceProduct(productInput, {
    guestCount,
    eventDate,
    startTime: "18:00",
    durationMinutes: 60,
    organizationId: "org-a",
  });
}

function rule(overrides: Partial<PricingPromotionRule> & Pick<PricingPromotionRule, "slug" | "type" | "payload">): PricingPromotionRule {
  return {
    id: overrides.id ?? overrides.slug,
    organizationId: "org-a",
    locationId: null,
    name: overrides.name ?? overrides.slug,
    version: 1,
    active: true,
    stackable: false,
    stackingGroup: null,
    priority: 100,
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
    ...overrides,
  };
}

const axe = product({
  slug: "axe-throwing",
  name: "Axe Throwing",
  prices: [
    {
      strategy: PRODUCT_PRICE_STRATEGIES.PER_PERSON,
      amountCents: 2500,
      additionalGuestCents: null,
      includedGuests: null,
      includedHours: null,
      additionalHourCents: null,
      minGuests: null,
      weekdayAmountCents: null,
      weekendAmountCents: null,
      daysOfWeek: null,
      afterHour: null,
      afterHourAmountCents: null,
      shoeAddOnCents: null,
      unitLabel: "person",
    },
  ],
});

describe("promotion evaluator", () => {
  it("applies percentage with half-up cents rounding", () => {
    const quote = quoteFor(axe, 1);
    expect(quote.totalCents).toBe(2500);
    const result = applyPromotions({
      quotes: [quote],
      context: { guestCount: 1, eventDate: "2026-10-15", startTime: "18:00", durationMinutes: 60, organizationId: "org-a" },
      promotions: [rule({ slug: "half-off", type: PROMOTION_TYPES.PERCENTAGE, payload: { percent: 50 } })],
    });
    expect(result.quotes[0]?.totalCents).toBe(1250);
    expect(result.applied[0]?.discountCents).toBe(1250);
  });

  it("caps fixed amount at the line total and supports per-unit", () => {
    const quote = quoteFor(axe, 2);
    const perLine = applyPromotions({
      quotes: [quote],
      context: { guestCount: 2, eventDate: "2026-10-15", startTime: "18:00", durationMinutes: 60, organizationId: "org-a" },
      promotions: [
        rule({
          slug: "ten-off",
          type: PROMOTION_TYPES.FIXED_AMOUNT,
          payload: { amountCents: 10_000, application: "PER_LINE" },
        }),
      ],
    });
    expect(perLine.quotes[0]?.totalCents).toBe(0);

    const perUnit = applyPromotions({
      quotes: [quote],
      context: { guestCount: 2, eventDate: "2026-10-15", startTime: "18:00", durationMinutes: 60, organizationId: "org-a" },
      promotions: [
        rule({
          slug: "five-off-unit",
          type: PROMOTION_TYPES.FIXED_AMOUNT,
          payload: { amountCents: 500, application: "PER_UNIT" },
        }),
      ],
    });
    expect(perUnit.quotes[0]?.totalCents).toBe(4000);
  });

  it("applies fixed promotional price without implicit stacking", () => {
    const quote = quoteFor(axe, 2);
    const result = applyPromotions({
      quotes: [quote],
      context: { guestCount: 2, eventDate: "2026-10-15", startTime: "18:00", durationMinutes: 60, organizationId: "org-a" },
      promotions: [
        rule({
          slug: "fixed-20",
          type: PROMOTION_TYPES.FIXED_PRICE,
          priority: 10,
          payload: { promotionalPriceCents: 2000, application: "PER_UNIT" },
        }),
        rule({
          slug: "extra-10",
          type: PROMOTION_TYPES.PERCENTAGE,
          priority: 20,
          payload: { percent: 10 },
        }),
      ],
    });
    expect(result.quotes[0]?.totalCents).toBe(4000);
    expect(result.applied).toHaveLength(1);
    expect(result.applied[0]?.slug).toBe("fixed-20");
  });

  it("evaluates buy X get Y for quantities 1–5 with optional cap", () => {
    const context = {
      guestCount: 5,
      eventDate: "2026-10-15",
      startTime: "18:00",
      durationMinutes: 60,
      organizationId: "org-a",
    };
    const promotion = rule({
      slug: "bogo",
      type: PROMOTION_TYPES.BUY_X_GET_Y,
      payload: { buyQuantity: 1, getQuantity: 1, rewardPercent: 100 },
    });
    const totals = [1, 2, 3, 4, 5].map((qty) => {
      const quote = quoteFor(axe, qty);
      return applyPromotions({ quotes: [quote], context: { ...context, guestCount: qty }, promotions: [promotion] })
        .quotes[0]!.totalCents;
    });
    expect(totals).toEqual([2500, 2500, 5000, 5000, 7500]);

    const capped = applyPromotions({
      quotes: [quoteFor(axe, 4)],
      context: { ...context, guestCount: 4 },
      promotions: [
        rule({
          slug: "bogo-cap",
          type: PROMOTION_TYPES.BUY_X_GET_Y,
          payload: { buyQuantity: 1, getQuantity: 1, rewardPercent: 100, maxApplications: 1 },
        }),
      ],
    });
    expect(capped.quotes[0]?.totalCents).toBe(7500);
  });

  it("picks the exclusive promotion with the lowest final total then priority then slug", () => {
    const quote = quoteFor(axe, 2);
    const context = {
      guestCount: 2,
      eventDate: "2026-10-15",
      startTime: "18:00",
      durationMinutes: 60,
      organizationId: "org-a",
    };
    const promotions = [
      rule({
        slug: "z-percent",
        type: PROMOTION_TYPES.PERCENTAGE,
        priority: 50,
        payload: { percent: 20 },
      }),
      rule({
        slug: "a-fixed",
        type: PROMOTION_TYPES.FIXED_AMOUNT,
        priority: 50,
        payload: { amountCents: 1000, application: "PER_LINE" },
      }),
      rule({
        slug: "m-better",
        type: PROMOTION_TYPES.PERCENTAGE,
        priority: 10,
        payload: { percent: 40 },
      }),
    ];
    const forward = applyPromotions({ quotes: [quote], context, promotions });
    const reverse = applyPromotions({ quotes: [quote], context, promotions: [...promotions].reverse() });
    expect(forward.quotes[0]?.totalCents).toBe(3000);
    expect(forward.applied[0]?.slug).toBe("m-better");
    expect(reverse.applied[0]?.slug).toBe("m-better");
  });

  it("stacks explicit stackables in priority then slug order", () => {
    const quote = quoteFor(axe, 2);
    const result = applyPromotions({
      quotes: [quote],
      context: { guestCount: 2, eventDate: "2026-10-15", startTime: "18:00", durationMinutes: 60, organizationId: "org-a" },
      promotions: [
        rule({
          slug: "stack-b",
          type: PROMOTION_TYPES.FIXED_AMOUNT,
          stackable: true,
          stackingGroup: "axe",
          priority: 20,
          payload: { amountCents: 500, application: "PER_LINE" },
        }),
        rule({
          slug: "stack-a",
          type: PROMOTION_TYPES.PERCENTAGE,
          stackable: true,
          stackingGroup: "axe",
          priority: 10,
          payload: { percent: 10 },
        }),
      ],
    });
    // 5000 -> 10% = 4500 -> -500 = 4000
    expect(result.quotes[0]?.totalCents).toBe(4000);
    expect(result.applied.map((row) => row.slug)).toEqual(["stack-a", "stack-b"]);
  });

  it("ignores inactive promotions and other organizations", () => {
    const quote = quoteFor(axe, 2);
    const result = applyPromotions({
      quotes: [quote],
      context: { guestCount: 2, eventDate: "2026-10-15", startTime: "18:00", durationMinutes: 60, organizationId: "org-a" },
      promotions: [
        rule({ slug: "off", type: PROMOTION_TYPES.PERCENTAGE, active: false, payload: { percent: 50 } }),
        rule({
          slug: "other-org",
          type: PROMOTION_TYPES.PERCENTAGE,
          organizationId: "org-b",
          payload: { percent: 50 },
        }),
      ],
    });
    expect(result.quotes[0]?.totalCents).toBe(5000);
    expect(result.applied).toHaveLength(0);
  });

  it("does not discount ineligible products or stored-value kinds without flag", () => {
    const food = product({
      slug: "pizza-combo",
      name: "Pizza",
      kind: PRODUCT_KINDS.FOOD,
      serving: { servesMin: 4, servesMax: 5, unitCount: null },
      prices: [
        {
          strategy: PRODUCT_PRICE_STRATEGIES.FOOD_PER_COMBO,
          amountCents: 2000,
          additionalGuestCents: null,
          includedGuests: null,
          includedHours: null,
          additionalHourCents: null,
          minGuests: null,
          weekdayAmountCents: null,
          weekendAmountCents: null,
          daysOfWeek: null,
          afterHour: null,
          afterHourAmountCents: null,
          shoeAddOnCents: null,
          unitLabel: "combo",
        },
      ],
    });
    const credit = product({
      slug: "play-card",
      name: "Play Card",
      kind: PRODUCT_KINDS.ADD_ON,
      prices: [
        {
          strategy: PRODUCT_PRICE_STRATEGIES.PER_PERSON,
          amountCents: 1000,
          additionalGuestCents: null,
          includedGuests: null,
          includedHours: null,
          additionalHourCents: null,
          minGuests: null,
          weekdayAmountCents: null,
          weekendAmountCents: null,
          daysOfWeek: null,
          afterHour: null,
          afterHourAmountCents: null,
          shoeAddOnCents: null,
          unitLabel: "card",
        },
      ],
    });
    const result = applyPromotions({
      quotes: [quoteFor(food, 12), quoteFor(credit, 1)],
      context: { guestCount: 12, eventDate: "2026-10-15", startTime: "18:00", durationMinutes: 60, organizationId: "org-a" },
      promotions: [
        rule({
          slug: "food-off",
          type: PROMOTION_TYPES.PERCENTAGE,
          productSlugs: ["pizza-combo"],
          payload: { percent: 50 },
        }),
        rule({
          slug: "credit-off",
          type: PROMOTION_TYPES.PERCENTAGE,
          productSlugs: ["play-card"],
          payload: { percent: 50 },
        }),
      ],
    });
    expect(result.quotes[0]?.totalCents).toBe(3000);
    expect(result.quotes[1]?.totalCents).toBe(1000);
    expect(result.applied).toHaveLength(1);
    expect(result.applied[0]?.slug).toBe("food-off");
  });
});
