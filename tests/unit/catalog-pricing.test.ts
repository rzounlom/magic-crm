import { describe, expect, it } from "vitest";

import { percentOfCents, priceProduct, depositRequiredCents, depositPercentFromTenant } from "@/server/catalog/pricing";
import { PRODUCT_KINDS, PRODUCT_PRICE_STRATEGIES, type CatalogProductInput } from "@/types/catalog";

function product(overrides: Partial<CatalogProductInput> & Pick<CatalogProductInput, "slug" | "name" | "prices">): CatalogProductInput {
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

describe("catalog pricing", () => {
  it("prices birthday packages as base plus extra guests in cents", () => {
    const quote = priceProduct(
      product({
        slug: "have-a-ball-bowling",
        name: "Have a Ball",
        kind: PRODUCT_KINDS.PACKAGE,
        prices: [
          {
            strategy: PRODUCT_PRICE_STRATEGIES.PACKAGE_BASE_PLUS_ADDITIONAL,
            amountCents: 27599,
            additionalGuestCents: 2749,
            includedGuests: 10,
            includedHours: null,
            additionalHourCents: null,
            minGuests: null,
            weekdayAmountCents: null,
            weekendAmountCents: null,
            daysOfWeek: null,
            afterHour: null,
            afterHourAmountCents: null,
            shoeAddOnCents: null,
            unitLabel: "package",
          },
        ],
      }),
      { guestCount: 12, eventDate: "2026-10-15", startTime: "14:00", durationMinutes: 60 },
    );
    expect(quote.totalCents).toBe(27599 + 2 * 2749);
    expect(quote.pricingComplete).toBe(true);
  });

  it("prices weekday bowling lanes plus shoe add-on", () => {
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
          afterHour: null,
          afterHourAmountCents: null,
          shoeAddOnCents: 350,
          unitLabel: "lane",
        },
      ],
    });
    const weekday = priceProduct(bowling, {
      guestCount: 12,
      eventDate: "2026-10-15",
      startTime: "18:00",
      durationMinutes: 60,
    });
    expect(weekday.totalCents).toBe(2 * 3000 + 12 * 350);
    const weekend = priceProduct(bowling, {
      guestCount: 12,
      eventDate: "2026-10-17",
      startTime: "18:00",
      durationMinutes: 60,
    });
    expect(weekend.totalCents).toBe(2 * 4000 + 12 * 350);
  });

  it("uses pizza combo ceil(guestCount / 4)", () => {
    const quote = priceProduct(
      product({
        slug: "pizza-pitcher-combo",
        name: "Pizza & Pitcher Combination",
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
      }),
      { guestCount: 12, eventDate: "2026-10-15", startTime: "18:00", durationMinutes: 60 },
    );
    expect(quote.lineItems[0]?.quantity).toBe(3);
    expect(quote.totalCents).toBe(6000);
  });

  it("bills arcade at the 20-person minimum", () => {
    const quote = priceProduct(
      product({
        slug: "unlimited-arcade-1h",
        name: "1 Hour Unlimited Arcade Play",
        minGuests: 20,
        prices: [
          {
            strategy: PRODUCT_PRICE_STRATEGIES.PER_PERSON,
            amountCents: 2500,
            additionalGuestCents: null,
            includedGuests: null,
            includedHours: null,
            additionalHourCents: null,
            minGuests: 20,
            weekdayAmountCents: null,
            weekendAmountCents: null,
            daysOfWeek: null,
            afterHour: null,
            afterHourAmountCents: null,
            shoeAddOnCents: null,
            unitLabel: "person",
          },
        ],
      }),
      { guestCount: 12, eventDate: "2026-10-15", startTime: "18:00", durationMinutes: 60 },
    );
    expect(quote.totalCents).toBe(50_000);
  });

  it("stores food cents exactly, including fractional-dollar source prices", () => {
    expect(percentOfCents(33097, 30)).toBe(9929);
  });

  it("applies tenant deposit percent in integer cents", () => {
    expect(depositRequiredCents(100_000, 30)).toBe(30_000);
    expect(depositRequiredCents(100_000, 20)).toBe(20_000);
    expect(depositPercentFromTenant(50)).toBe(50);
    expect(depositPercentFromTenant(101)).toBe(30);
  });

  it("does not invent guests-per-unit or combo size when tenant config is missing", () => {
    const lanes = priceProduct(
      product({
        slug: "bowling-1h",
        name: "Bowling",
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
            afterHour: null,
            afterHourAmountCents: null,
            shoeAddOnCents: null,
            unitLabel: "lane",
          },
        ],
      }),
      { guestCount: 12, eventDate: "2026-10-15", startTime: "18:00", durationMinutes: 60 },
    );
    expect(lanes.pricingComplete).toBe(false);

    const combo = priceProduct(
      product({
        slug: "mystery-combo",
        name: "Mystery Combo",
        kind: PRODUCT_KINDS.FOOD,
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
      }),
      { guestCount: 12, eventDate: "2026-10-15", startTime: "18:00", durationMinutes: 60 },
    );
    expect(combo.pricingComplete).toBe(false);
  });
});
