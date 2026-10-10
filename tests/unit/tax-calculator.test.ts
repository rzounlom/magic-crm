import { describe, expect, it } from "vitest";

import { applyPromotions, PROMOTION_TYPES } from "@/server/catalog/promotions";
import { calculateTax, lineComponentKey, lookupApplicableRate, taxCentsFromBps } from "@/server/catalog/tax";
import { readEventPlanPayload } from "@/lib/event-planner/payload";
import {
  PRODUCT_TAX_CLASSES,
  PRODUCT_TAXABILITIES,
  TAX_APPROVAL_STATUSES,
  TAX_CALCULATION_STATUSES,
  TAX_PRICING_MODES,
  TAX_ROUNDING_MODES,
  TAX_TYPES,
  TAX_VERIFICATION_STATUSES,
  type TaxCalculationInput,
  type TaxRateScheduleRule,
} from "@/types/tax";

const rate = (overrides: Partial<TaxRateScheduleRule> = {}): TaxRateScheduleRule => ({
  id: "rate-1",
  locationId: "loc-1",
  taxType: TAX_TYPES.STATE_SALES,
  jurisdictionCode: "US-IN-ST-JOSEPH",
  rateBps: 700,
  effectiveFrom: "2026-01-01",
  effectiveTo: null,
  sourceUrl: "https://www.in.gov/dor/about/news-publications/our-team/tax-types/",
  sourceCitation: "IN DOR Tax Types — Sales Tax 7%",
  verificationStatus: TAX_VERIFICATION_STATUSES.VERIFIED,
  approvalStatus: TAX_APPROVAL_STATUSES.APPROVED,
  active: true,
  version: 1,
  ...overrides,
});

function baseInput(overrides: Partial<TaxCalculationInput> = {}): TaxCalculationInput {
  return {
    organizationId: "org-1",
    locationId: "loc-1",
    taxDate: "2026-10-14",
    lineItems: [
      {
        productId: "food-1",
        slug: "pizza-pitcher-combo",
        name: "Pizza & Pitcher",
        kind: "FOOD",
        quantity: 3,
        totalCents: 6000,
      },
    ],
    settings: {
      calculationEnabled: true,
      collectionEnabled: false,
      pricingMode: TAX_PRICING_MODES.TAX_EXCLUSIVE,
      roundingMode: TAX_ROUNDING_MODES.HALF_UP_LINE,
      approvedAt: "2026-10-01T00:00:00.000Z",
    },
    locationProfile: {
      locationId: "loc-1",
      streetLine1: "1018 West Edison Road",
      city: "Mishawaka",
      region: "IN",
      postalCode: "46545",
      country: "US",
      countyName: "St. Joseph",
      jurisdictionCode: "US-IN-ST-JOSEPH",
      jurisdictionResolved: true,
      taxTimeZone: "America/Indiana/Indianapolis",
      locationTimezone: "UTC",
    },
    classifications: [
      {
        id: "cls-1",
        productId: "food-1",
        componentKey: null,
        classification: PRODUCT_TAX_CLASSES.PREPARED_FOOD,
        taxability: PRODUCT_TAXABILITIES.TAXABLE,
        effectiveFrom: null,
        effectiveTo: null,
      },
    ],
    rates: [rate()],
    bundlePolicies: [],
    ...overrides,
  };
}

describe("taxCentsFromBps", () => {
  it("uses integer-cent half-up arithmetic", () => {
    expect(taxCentsFromBps(10000, 700)).toBe(700);
    expect(taxCentsFromBps(1, 700)).toBe(0);
    expect(taxCentsFromBps(8, 700)).toBe(1); // 0.56 → 1
    expect(taxCentsFromBps(7, 700)).toBe(0); // 0.49 → 0
  });
});

describe("calculateTax status model", () => {
  it("returns DISABLED when settings absent or calculationEnabled false", () => {
    expect(calculateTax(baseInput({ settings: null })).status).toBe(TAX_CALCULATION_STATUSES.DISABLED);
    expect(
      calculateTax(
        baseInput({
          settings: {
            calculationEnabled: false,
            collectionEnabled: false,
            pricingMode: TAX_PRICING_MODES.TAX_EXCLUSIVE,
            roundingMode: TAX_ROUNDING_MODES.HALF_UP_LINE,
            approvedAt: null,
          },
        }),
      ).taxTotalCents,
    ).toBeNull();
  });

  it("does not treat unresolved classification as zero tax", () => {
    const result = calculateTax(baseInput({ classifications: [] }));
    expect(result.status).toBe(TAX_CALCULATION_STATUSES.UNRESOLVED_CLASSIFICATION);
    expect(result.taxTotalCents).toBeNull();
    expect(result.lines[0]?.taxCents).toBeNull();
    expect(result.chargeable).toBe(false);
  });

  it("returns UNRESOLVED_JURISDICTION when jurisdiction not resolved", () => {
    const result = calculateTax(
      baseInput({
        locationProfile: {
          locationId: "loc-1",
          streetLine1: null,
          city: null,
          region: null,
          postalCode: null,
          country: null,
          countyName: null,
          jurisdictionCode: null,
          jurisdictionResolved: false,
          taxTimeZone: "America/Indiana/Indianapolis",
          locationTimezone: "UTC",
        },
      }),
    );
    expect(result.status).toBe(TAX_CALCULATION_STATUSES.UNRESOLVED_JURISDICTION);
    expect(result.taxTotalCents).toBeNull();
  });

  it("returns UNRESOLVED_TIMEZONE when location timezone is UTC and taxTimeZone unset", () => {
    const result = calculateTax(
      baseInput({
        locationProfile: {
          locationId: "loc-1",
          streetLine1: "1018 West Edison Road",
          city: "Mishawaka",
          region: "IN",
          postalCode: "46545",
          country: "US",
          countyName: "St. Joseph",
          jurisdictionCode: "US-IN-ST-JOSEPH",
          jurisdictionResolved: true,
          taxTimeZone: null,
          locationTimezone: "UTC",
        },
      }),
    );
    expect(result.status).toBe(TAX_CALCULATION_STATUSES.UNRESOLVED_TIMEZONE);
  });

  it("returns UNRESOLVED_RATE when rate missing or expired", () => {
    expect(calculateTax(baseInput({ rates: [] })).status).toBe(TAX_CALCULATION_STATUSES.UNRESOLVED_RATE);
    expect(
      calculateTax(baseInput({ rates: [rate({ effectiveTo: "2026-01-01" })] })).status,
    ).toBe(TAX_CALCULATION_STATUSES.UNRESOLVED_RATE);
  });

  it("rejects overlapping applicable rates", () => {
    const lookup = lookupApplicableRate({
      rates: [rate({ id: "a" }), rate({ id: "b" })],
      locationId: "loc-1",
      jurisdictionCode: "US-IN-ST-JOSEPH",
      taxType: TAX_TYPES.STATE_SALES,
      taxDate: "2026-10-14",
    });
    expect(lookup.ok).toBe(false);
    if (!lookup.ok) {
      expect(lookup.status).toBe(TAX_CALCULATION_STATUSES.UNRESOLVED_RATE);
      expect(lookup.reason).toMatch(/Overlapping/);
    }
  });

  it("supports explicit zero-rate and exemption", () => {
    const zero = calculateTax(baseInput({ rates: [rate({ rateBps: 0 })] }));
    expect(zero.status).toBe(TAX_CALCULATION_STATUSES.ZERO_RATE);
    expect(zero.taxTotalCents).toBe(0);

    const exempt = calculateTax(
      baseInput({
        classifications: [
          {
            id: "cls-1",
            productId: "food-1",
            componentKey: null,
            classification: PRODUCT_TAX_CLASSES.PREPARED_FOOD,
            taxability: PRODUCT_TAXABILITIES.EXEMPT,
            effectiveFrom: null,
            effectiveTo: null,
          },
        ],
      }),
    );
    expect(exempt.status).toBe(TAX_CALCULATION_STATUSES.EXEMPT);
    expect(exempt.taxTotalCents).toBe(0);
  });

  it("returns UNRESOLVED_BUNDLE for packages without approved treatment", () => {
    const result = calculateTax(
      baseInput({
        lineItems: [
          {
            productId: "pkg-1",
            slug: "have-a-ball-bowling",
            name: "Have a Ball",
            kind: "PACKAGE",
            quantity: 1,
            totalCents: 29900,
          },
        ],
        classifications: [],
        bundlePolicies: [],
      }),
    );
    expect(result.status).toBe(TAX_CALCULATION_STATUSES.UNRESOLVED_BUNDLE);
    expect(result.taxTotalCents).toBeNull();
  });

  it("keeps chargeable false when collectionEnabled is false even if calculated", () => {
    const result = calculateTax(baseInput());
    expect(result.status).toBe(TAX_CALCULATION_STATUSES.CALCULATED);
    expect(result.taxTotalCents).toBe(420);
    expect(result.chargeable).toBe(false);
  });
});

describe("calculateTax promotions and components", () => {
  it("taxes post-promotion discounted base and separates shoes from bowling", () => {
    const bowlingQuote = {
      productId: "bowl-1",
      slug: "bowling-1h",
      name: "Bowling - 1 Hour",
      totalCents: 10200,
      pricingComplete: true,
      lineItems: [
        {
          productId: "bowl-1",
          slug: "bowling-1h",
          name: "Bowling - 1 Hour",
          kind: "ATTRACTION",
          quantity: 2,
          unitLabel: "lane",
          unitPriceCents: 3000,
          totalCents: 6000,
          originalTotalCents: 6000,
        },
        {
          productId: "bowl-1",
          slug: "bowling-1h",
          name: "Bowling shoes",
          kind: "ATTRACTION",
          quantity: 12,
          unitLabel: "pair",
          unitPriceCents: 350,
          totalCents: 4200,
          originalTotalCents: 4200,
        },
      ],
    };
    const promoted = applyPromotions({
      quotes: [bowlingQuote],
      context: {
        guestCount: 12,
        eventDate: "2026-10-14",
        startTime: "18:00",
        durationMinutes: 60,
        timeZone: "America/Indiana/Indianapolis",
        organizationId: "org-1",
      },
      promotions: [
        {
          id: "promo-1",
          organizationId: "org-1",
          locationId: null,
          slug: "wed-bowling-50",
          name: "Wed Bowling 50",
          type: PROMOTION_TYPES.PERCENTAGE,
          version: 1,
          active: true,
          stackable: false,
          stackingGroup: null,
          priority: 10,
          allowsFurtherDiscount: false,
          productSlugs: ["bowling-1h"],
          categorySlugs: null,
          daysOfWeek: ["wed"],
          localStartMinute: null,
          localEndMinute: null,
          effectiveFrom: null,
          effectiveTo: null,
          minQuantity: null,
          maxQuantity: null,
          payload: { percent: 50 },
        },
      ],
    });
    const lines = promoted.quotes[0]!.lineItems;
    expect(lines.find((row) => row.unitLabel === "lane")?.totalCents).toBe(3000);
    expect(lines.find((row) => /shoe/i.test(row.name))?.totalCents).toBe(4200);
    expect(lineComponentKey(lines.find((row) => /shoe/i.test(row.name))!)).toBe("shoes");

    const result = calculateTax(
      baseInput({
        lineItems: lines,
        classifications: [
          {
            id: "c1",
            productId: "bowl-1",
            componentKey: null,
            classification: PRODUCT_TAX_CLASSES.ADMISSION_ACTIVITY,
            taxability: PRODUCT_TAXABILITIES.EXEMPT,
            effectiveFrom: null,
            effectiveTo: null,
          },
          {
            id: "c2",
            productId: "bowl-1",
            componentKey: "shoes",
            classification: PRODUCT_TAX_CLASSES.TPP_RENTAL,
            taxability: PRODUCT_TAXABILITIES.TAXABLE,
            effectiveFrom: null,
            effectiveTo: null,
          },
        ],
      }),
    );
    expect(result.status).toBe(TAX_CALCULATION_STATUSES.CALCULATED);
    const shoe = result.lines.find((row) => row.componentKey === "shoes");
    const lane = result.lines.find((row) => row.componentKey == null);
    expect(lane?.taxCents).toBe(0);
    expect(shoe?.taxableBaseCents).toBe(4200);
    expect(shoe?.taxCents).toBe(294);
    expect(result.taxTotalCents).toBe(294);
  });

  it("applies BOGO discounted base for taxable lines", () => {
    const promoted = applyPromotions({
      quotes: [
        {
          productId: "axe-1",
          slug: "axe-throwing-30",
          name: "Axe 30",
          totalCents: 8750,
          pricingComplete: true,
          lineItems: [
            {
              productId: "axe-1",
              slug: "axe-throwing-30",
              name: "Axe 30",
              kind: "ATTRACTION",
              quantity: 5,
              unitLabel: "person",
              unitPriceCents: 1750,
              totalCents: 8750,
            },
          ],
        },
      ],
      context: {
        guestCount: 5,
        eventDate: "2026-10-15",
        startTime: "18:00",
        durationMinutes: 30,
        timeZone: "America/Indiana/Indianapolis",
        organizationId: "org-1",
      },
      promotions: [
        {
          id: "bogo",
          organizationId: "org-1",
          locationId: null,
          slug: "thu-axe-bogo",
          name: "BOGO",
          type: PROMOTION_TYPES.BUY_X_GET_Y,
          version: 1,
          active: true,
          stackable: false,
          stackingGroup: null,
          priority: 10,
          allowsFurtherDiscount: false,
          productSlugs: ["axe-throwing-30"],
          categorySlugs: null,
          daysOfWeek: ["thu"],
          localStartMinute: null,
          localEndMinute: null,
          effectiveFrom: null,
          effectiveTo: null,
          minQuantity: null,
          maxQuantity: null,
          payload: { buyQuantity: 1, getQuantity: 1, rewardPercent: 100 },
        },
      ],
    });
    const base = promoted.quotes[0]!.totalCents;
    expect(base).toBe(5250);
    const result = calculateTax(
      baseInput({
        taxDate: "2026-10-15",
        lineItems: promoted.quotes[0]!.lineItems,
        classifications: [
          {
            id: "c1",
            productId: "axe-1",
            componentKey: null,
            classification: PRODUCT_TAX_CLASSES.ADMISSION_ACTIVITY,
            taxability: PRODUCT_TAXABILITIES.TAXABLE,
            effectiveFrom: null,
            effectiveTo: null,
          },
        ],
      }),
    );
    expect(result.taxTotalCents).toBe(taxCentsFromBps(5250, 700));
  });

  it("mixes taxable food with exempt activity without inventing totals when any line unresolved", () => {
    const mixed = calculateTax(
      baseInput({
        lineItems: [
          {
            productId: "food-1",
            slug: "pizza-pitcher-combo",
            name: "Pizza",
            kind: "FOOD",
            quantity: 1,
            totalCents: 2000,
          },
          {
            productId: "bowl-1",
            slug: "bowling-1h",
            name: "Bowling",
            kind: "ATTRACTION",
            quantity: 2,
            unitLabel: "lane",
            totalCents: 6000,
          },
        ],
        classifications: [
          {
            id: "c1",
            productId: "food-1",
            componentKey: null,
            classification: PRODUCT_TAX_CLASSES.PREPARED_FOOD,
            taxability: PRODUCT_TAXABILITIES.TAXABLE,
            effectiveFrom: null,
            effectiveTo: null,
          },
        ],
      }),
    );
    expect(mixed.status).toBe(TAX_CALCULATION_STATUSES.UNRESOLVED_CLASSIFICATION);
    expect(mixed.taxTotalCents).toBeNull();
  });
});

describe("tax snapshot compatibility", () => {
  it("keeps legacy payloads readable without taxBreakdown", () => {
    const payload = readEventPlanPayload({
      guestCount: 12,
      eventDate: "2026-10-14",
      startTime: "18:00",
      durationMinutes: 120,
      activities: [],
      dining: { label: "None", priceCents: 0 },
      spaces: [],
      schedule: [],
      pricingComplete: true,
      lineItems: [{ productId: "a", slug: "a", name: "A", kind: "FOOD", quantity: 1, unitPriceCents: 100, totalCents: 100 }],
    });
    expect(payload.taxBreakdown).toBeUndefined();
    expect(payload.lineItems?.[0]?.totalCents).toBe(100);
  });

  it("preserves taxBreakdown diagnostics when present", () => {
    const breakdown = calculateTax(baseInput());
    const payload = readEventPlanPayload({
      guestCount: 12,
      eventDate: "2026-10-14",
      startTime: "18:00",
      durationMinutes: 120,
      activities: [],
      dining: { label: "Pizza", priceCents: 6000 },
      spaces: [],
      schedule: [],
      pricingComplete: true,
      taxBreakdown: breakdown,
    });
    expect(payload.taxBreakdown?.status).toBe(TAX_CALCULATION_STATUSES.CALCULATED);
    expect(payload.taxBreakdown?.taxTotalCents).toBe(420);
    expect(payload.taxBreakdown?.chargeable).toBe(false);
  });
});
