import { describe, expect, it } from "vitest";

import {
  classifyProductKind,
  customerAvailabilityCopy,
  customerTaxNote,
  describeTierImprovements,
  formatComponentPrice,
  isUnresolvedDining,
  itemizedTotalMatchesEstimate,
  previousTierInSet,
  summarizeCustomerEvent,
} from "@/lib/event-planner/customer-package";
import { isEventPlanScheduleInfeasible } from "@/lib/event-planner/payload";
import { PRODUCT_KINDS } from "@/types/catalog";
import { CUSTOMER_OCCUPANCY_NOTE, EVENT_PLAN_TIERS, type EventPlanPayload } from "@/types/event-planner";
import { TAX_CALCULATION_STATUSES, type TaxBreakdownSnapshot } from "@/types/tax";

function payload(overrides: Partial<EventPlanPayload> = {}): EventPlanPayload {
  return {
    guestCount: 20,
    eventDate: "2026-10-15",
    startTime: "18:00",
    durationMinutes: 180,
    activities: [{ knowledgeItemId: "bowl", name: "Bowling", quantity: 1, priceCents: 0 }],
    dining: { label: "Pizza & Pitcher Combination", priceCents: 10000 },
    spaces: [],
    schedule: [],
    pricingComplete: true,
    ...overrides,
  };
}

describe("customer package presentation", () => {
  it("classifies rooms by rental kind, not by a food product name", () => {
    expect(classifyProductKind(PRODUCT_KINDS.FOOD)).toBe("food");
    expect(classifyProductKind(PRODUCT_KINDS.RENTAL)).toBe("space");
    expect(classifyProductKind(PRODUCT_KINDS.ATTRACTION)).toBe("activity");
    expect(classifyProductKind("PARTY_ROOM")).toBe("other");
  });

  it("formats catalog dining quantities from line items", () => {
    expect(
      formatComponentPrice(
        {
          name: "Pizza & Pitcher Combination",
          quantity: 5,
          unitPriceCents: 2000,
          totalCents: 10000,
        },
        "USD",
      ),
    ).toBe("5 × Pizza & Pitcher Combination at $20 = $100");
  });

  it("describes only proven dining upgrades from compositionDelta", () => {
    const good = payload();
    const recommended = payload({
      dining: { label: "Slider Bar", priceCents: 36000 },
      compositionDelta: {
        comparedWithTier: EVENT_PLAN_TIERS.BUDGET,
        addedProductNames: [],
        foodFrom: "Pizza & Pitcher Combination",
        foodTo: "Slider Bar",
        spaceAdded: null,
        fulfillmentChanges: [],
      },
    });
    expect(describeTierImprovements(good, recommended)).toEqual([
      "Upgraded from Pizza & Pitcher Combination to Slider Bar",
    ]);
  });

  it("does not treat a dining preference placeholder as a purchased upgrade", () => {
    expect(
      isUnresolvedDining({ label: "Not Sure — Recommend Something", priceCents: 0 }),
    ).toBe(true);
    expect(isUnresolvedDining({ label: "Dining to be confirmed", priceCents: 0 })).toBe(true);
    expect(
      isUnresolvedDining({ label: "Pizza & Pitcher Combination", knowledgeItemId: "pizza", priceCents: 10000 }),
    ).toBe(false);
    const recommended = payload({
      dining: { label: "Dining to be confirmed", priceCents: 0 },
    });
    expect(
      describeTierImprovements(payload({ dining: { label: "Not Sure — Recommend Something", priceCents: 0 } }), recommended),
    ).toEqual([]);
  });

  it("does not invent upgrade claims when packages match", () => {
    const good = payload();
    const recommended = payload({
      compositionDelta: {
        comparedWithTier: EVENT_PLAN_TIERS.BUDGET,
        addedProductNames: [],
        foodFrom: null,
        foodTo: null,
        spaceAdded: null,
        fulfillmentChanges: [],
      },
    });
    expect(describeTierImprovements(good, recommended)).toEqual([]);
    expect(describeTierImprovements(null, recommended)).toEqual([]);
  });

  it("uses occupancy language for AVAILABLE instead of a confirmation claim", () => {
    expect(customerAvailabilityCopy({ availabilityStatus: "AVAILABLE" })).toBe(CUSTOMER_OCCUPANCY_NOTE);
    expect(customerAvailabilityCopy({ availabilityStatus: "AVAILABLE" })).not.toMatch(
      /confirmed|guaranteed available|secured/i,
    );
    expect(customerAvailabilityCopy({ availabilityStatus: "UNAVAILABLE" })).toBe(
      "This option is not available at the requested time.",
    );
  });

  it("summarizes inquiry source data and uses a neutral label when a date is missing", () => {
    expect(
      summarizeCustomerEvent({
        eventType: "Birthday Party",
        eventGoal: "Celebration",
        desiredDate: "2026-10-15",
        desiredStartTime: "18:00",
        guestCount: 20,
        durationMinutes: 180,
        guestMix: "mostly_children",
        diningPreference: "pizza_light",
      }),
    ).toMatchObject({
      title: "Birthday Party",
      dateTime: "Oct 15, 2026 at 6:00 PM",
      guestCount: "20 guests",
      duration: "3 hours",
      audience: "Mostly Kids / Youth",
      diningPreference: "Pizza & Light Fare",
    });

    expect(
      summarizeCustomerEvent({
        guestCount: null,
        desiredDate: null,
        desiredStartTime: null,
      }),
    ).toMatchObject({
      title: "Your event",
      dateTime: "Not specified",
      guestCount: "Not specified",
      duration: null,
      audience: null,
      diningPreference: null,
    });
  });

  it("does not treat a missing itemization as a complete breakdown", () => {
    expect(itemizedTotalMatchesEstimate(payload(), 10000)).toBe(false);
    expect(
      itemizedTotalMatchesEstimate(
        payload({
          lineItems: [
            {
              productId: "pizza",
              slug: "pizza-pitcher-combo",
              name: "Pizza & Pitcher Combination",
              kind: PRODUCT_KINDS.FOOD,
              quantity: 5,
              unitPriceCents: 2000,
              totalCents: 10000,
            },
          ],
        }),
        10000,
      ),
    ).toBe(true);
  });

  it("does not invent a tax amount when the snapshot is unresolved", () => {
    const unresolved = {
      status: TAX_CALCULATION_STATUSES.UNRESOLVED_RATE,
      taxTotalCents: null,
    } as TaxBreakdownSnapshot;
    expect(customerTaxNote(undefined, "USD")).toBeNull();
    expect(customerTaxNote(unresolved, "USD")).toContain("not included");
    expect(customerTaxNote(unresolved, "USD")).not.toContain("$");
  });

  it("A: blocks booking only when timed activities overflow the requested window", () => {
    expect(
      isEventPlanScheduleInfeasible(
        payload({
          itineraryPrecise: false,
          scheduleLimitation:
            "These activities need 2 hours 30 minutes, which is longer than the requested 2 hours.",
        }),
      ),
    ).toBe(true);
  });

  it("B: does not block when clocks are a sample and no conflict is proven", () => {
    expect(isEventPlanScheduleInfeasible(payload({ itineraryPrecise: false, scheduleLimitation: null }))).toBe(false);
  });

  it("C: does not block flexible dining included without a guaranteed dining clock", () => {
    expect(
      isEventPlanScheduleInfeasible(
        payload({
          itineraryPrecise: true,
          scheduleLimitation: null,
          dining: { label: "Pizza & Pitcher Combination", priceCents: 10000 },
          includedItems: [{ knowledgeItemId: "pizza", name: "Pizza & Pitcher Combination" }],
          itinerary: [{ startTime: "14:00", endTime: "15:00", label: "Bowling", role: "ACTIVITY" }],
        }),
      ),
    ).toBe(false);
  });

  it("D: does not block when operating hours or staffing are still unconfirmed", () => {
    expect(
      isEventPlanScheduleInfeasible(
        payload({
          itineraryPrecise: true,
          scheduleLimitation: "   ",
          spaceUnconfirmed: true,
          customerAvailabilityNote:
            "Inventory occupancy looks open for this sample itinerary. Operating hours and a final check still need confirmation.",
        }),
      ),
    ).toBe(false);
  });

  it("orders comparison against the previous present tier", () => {
    expect(previousTierInSet(EVENT_PLAN_TIERS.PREMIUM, [EVENT_PLAN_TIERS.BEST_FIT, EVENT_PLAN_TIERS.PREMIUM])).toBe(
      EVENT_PLAN_TIERS.BEST_FIT,
    );
    expect(previousTierInSet(EVENT_PLAN_TIERS.BUDGET, [EVENT_PLAN_TIERS.BUDGET, EVENT_PLAN_TIERS.BEST_FIT])).toBeNull();
  });
});
