import { describe, expect, it } from "vitest";

import { applyPromotions, PROMOTION_TYPES, type PricingPromotionRule } from "@/server/catalog/promotions";
import { priceProduct } from "@/server/catalog/pricing";
import { PRODUCT_KINDS, PRODUCT_PRICE_STRATEGIES, type CatalogProductInput } from "@/types/catalog";

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

const bowling = product({
  slug: "bowling-1h",
  name: "Bowling - 1 Hour",
  guestsPerUnit: 6,
  prices: [
    {
      strategy: PRODUCT_PRICE_STRATEGIES.PER_LANE_WEEKDAY_WEEKEND,
      amountCents: 3000,
      additionalGuestCents: null,
      includedGuests: null,
      includedHours: null,
      additionalHourCents: null,
      minGuests: null,
      weekdayAmountCents: 3000,
      weekendAmountCents: 4000,
      daysOfWeek: null,
      weekendDays: ["fri", "sat", "sun"],
      afterHour: null,
      afterHourAmountCents: null,
      shoeAddOnCents: 350,
      unitLabel: "lane",
    },
  ],
});

const axe30 = product({
  slug: "axe-throwing-30",
  name: "Axe Throwing - 30 Minutes",
  prices: [
    {
      strategy: PRODUCT_PRICE_STRATEGIES.PER_PERSON,
      amountCents: 1750,
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

const axe60 = product({
  slug: "axe-throwing-60",
  name: "Axe Throwing - 60 Minutes",
  prices: [
    {
      strategy: PRODUCT_PRICE_STRATEGIES.PER_PERSON,
      amountCents: 3000,
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

const laserCard = product({
  slug: "laser-plex-card",
  name: "Laser Plex Card",
  kind: PRODUCT_KINDS.ADD_ON,
  prices: [
    {
      strategy: PRODUCT_PRICE_STRATEGIES.PER_PERSON,
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
      unitLabel: "person",
    },
  ],
});

function rule(
  overrides: Partial<PricingPromotionRule> & Pick<PricingPromotionRule, "slug" | "type" | "payload" | "productSlugs" | "daysOfWeek">,
): PricingPromotionRule {
  return {
    id: overrides.id ?? overrides.slug,
    organizationId: "org-gen",
    locationId: null,
    name: overrides.name ?? overrides.slug,
    version: 1,
    active: true,
    stackable: false,
    stackingGroup: null,
    priority: 10,
    allowsFurtherDiscount: false,
    categorySlugs: null,
    localStartMinute: null,
    localEndMinute: null,
    effectiveFrom: null,
    effectiveTo: null,
    minQuantity: null,
    maxQuantity: null,
    ...overrides,
  };
}

const generationsPromos: PricingPromotionRule[] = [
  rule({
    slug: "wed-regular-bowling-50",
    type: PROMOTION_TYPES.PERCENTAGE,
    productSlugs: ["bowling-1h"],
    daysOfWeek: ["wed"],
    payload: { percent: 50 },
  }),
  rule({
    slug: "wed-regular-axe-50",
    type: PROMOTION_TYPES.PERCENTAGE,
    productSlugs: ["axe-throwing-30", "axe-throwing-60"],
    daysOfWeek: ["wed"],
    payload: { percent: 50 },
  }),
  rule({
    slug: "thu-axe-30-bogo",
    type: PROMOTION_TYPES.BUY_X_GET_Y,
    productSlugs: ["axe-throwing-30"],
    daysOfWeek: ["thu"],
    payload: { buyQuantity: 1, getQuantity: 1, rewardPercent: 100 },
  }),
];

describe("Generations day specials (verified)", () => {
  it("applies Wednesday 50% to bowling lanes only and leaves shoes full price", () => {
    const base = priceProduct(bowling, {
      guestCount: 12,
      eventDate: "2026-10-14",
      startTime: "18:00",
      durationMinutes: 60,
      organizationId: "org-gen",
    });
    const result = applyPromotions({
      quotes: [base],
      context: {
        guestCount: 12,
        eventDate: "2026-10-14",
        startTime: "18:00",
        durationMinutes: 60,
        organizationId: "org-gen",
      },
      promotions: generationsPromos,
    });
    const lanes = result.quotes[0]?.lineItems.find((row) => row.unitLabel === "lane");
    const shoes = result.quotes[0]?.lineItems.find((row) => /shoes/i.test(row.name));
    expect(lanes?.originalTotalCents ?? lanes?.totalCents).toBe(6000);
    expect(lanes?.totalCents).toBe(3000);
    expect(shoes?.totalCents).toBe(12 * 350);
    expect(result.quotes[0]?.totalCents).toBe(3000 + 12 * 350);
    expect(result.applied[0]?.slug).toBe("wed-regular-bowling-50");
  });

  it("does not apply Wednesday bowling discount on Thursday or Friday", () => {
    for (const date of ["2026-10-15", "2026-10-16"] as const) {
      const base = priceProduct(bowling, {
        guestCount: 6,
        eventDate: date,
        startTime: "18:00",
        durationMinutes: 60,
        organizationId: "org-gen",
      });
      const result = applyPromotions({
        quotes: [base],
        context: {
          guestCount: 6,
          eventDate: date,
          startTime: "18:00",
          durationMinutes: 60,
          organizationId: "org-gen",
        },
        promotions: generationsPromos,
      });
      expect(result.applied).toHaveLength(0);
    }
  });

  it("keeps Friday bowling at weekend lane rate after promotions are configured", () => {
    const base = priceProduct(bowling, {
      guestCount: 6,
      eventDate: "2026-10-16",
      startTime: "18:00",
      durationMinutes: 60,
      organizationId: "org-gen",
    });
    expect(base.totalCents).toBe(4000 + 6 * 350);
    const result = applyPromotions({
      quotes: [base],
      context: {
        guestCount: 6,
        eventDate: "2026-10-16",
        startTime: "18:00",
        durationMinutes: 60,
        organizationId: "org-gen",
      },
      promotions: generationsPromos,
    });
    expect(result.quotes[0]?.totalCents).toBe(4000 + 6 * 350);
  });

  it("applies Thursday axe 2-for-1 on per-person units 1–5 and excludes 60-minute axe", () => {
    const totals = [1, 2, 3, 4, 5].map((qty) => {
      const base = priceProduct(axe30, {
        guestCount: qty,
        eventDate: "2026-10-15",
        startTime: "18:00",
        durationMinutes: 30,
        organizationId: "org-gen",
      });
      return applyPromotions({
        quotes: [base],
        context: {
          guestCount: qty,
          eventDate: "2026-10-15",
          startTime: "18:00",
          durationMinutes: 30,
          organizationId: "org-gen",
        },
        promotions: generationsPromos,
      }).quotes[0]!.totalCents;
    });
    expect(totals).toEqual([1750, 1750, 3500, 3500, 5250]);

    const axe60Base = priceProduct(axe60, {
      guestCount: 4,
      eventDate: "2026-10-15",
      startTime: "18:00",
      durationMinutes: 60,
      organizationId: "org-gen",
    });
    const axe60Result = applyPromotions({
      quotes: [axe60Base],
      context: {
        guestCount: 4,
        eventDate: "2026-10-15",
        startTime: "18:00",
        durationMinutes: 60,
        organizationId: "org-gen",
      },
      promotions: generationsPromos,
    });
    expect(axe60Result.quotes[0]?.totalCents).toBe(12000);
    expect(axe60Result.applied).toHaveLength(0);
  });

  it("does not discount stored-value laser plex cards on Wednesday", () => {
    const base = priceProduct(laserCard, {
      guestCount: 12,
      eventDate: "2026-10-14",
      startTime: "18:00",
      durationMinutes: 60,
      organizationId: "org-gen",
    });
    const result = applyPromotions({
      quotes: [base],
      context: {
        guestCount: 12,
        eventDate: "2026-10-14",
        startTime: "18:00",
        durationMinutes: 60,
        organizationId: "org-gen",
      },
      promotions: [
        ...generationsPromos,
        rule({
          slug: "wed-laser-attempt",
          type: PROMOTION_TYPES.PERCENTAGE,
          productSlugs: ["laser-plex-card"],
          daysOfWeek: ["wed"],
          payload: { percent: 50 },
        }),
      ],
    });
    expect(result.quotes[0]?.totalCents).toBe(24000);
    expect(result.applied).toHaveLength(0);
  });

  it("keeps exclusive promotions from stacking on the same axe line", () => {
    const base = priceProduct(axe30, {
      guestCount: 4,
      eventDate: "2026-10-15",
      startTime: "18:00",
      durationMinutes: 30,
      organizationId: "org-gen",
    });
    const result = applyPromotions({
      quotes: [base],
      context: {
        guestCount: 4,
        eventDate: "2026-10-15",
        startTime: "18:00",
        durationMinutes: 30,
        organizationId: "org-gen",
      },
      promotions: [
        ...generationsPromos,
        rule({
          slug: "thu-axe-extra",
          type: PROMOTION_TYPES.PERCENTAGE,
          productSlugs: ["axe-throwing-30"],
          daysOfWeek: ["thu"],
          priority: 20,
          payload: { percent: 10 },
        }),
      ],
    });
    expect(result.quotes[0]?.totalCents).toBe(3500);
    expect(result.applied).toHaveLength(1);
    expect(result.applied[0]?.slug).toBe("thu-axe-30-bogo");
  });

  it("isolates promotions by organizationId", () => {
    const base = priceProduct(axe30, {
      guestCount: 2,
      eventDate: "2026-10-15",
      startTime: "18:00",
      durationMinutes: 30,
      organizationId: "org-other",
    });
    const result = applyPromotions({
      quotes: [base],
      context: {
        guestCount: 2,
        eventDate: "2026-10-15",
        startTime: "18:00",
        durationMinutes: 30,
        organizationId: "org-other",
      },
      promotions: generationsPromos,
    });
    expect(result.quotes[0]?.totalCents).toBe(3500);
    expect(result.applied).toHaveLength(0);
  });
});
