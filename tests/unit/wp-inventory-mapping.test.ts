import { describe, expect, it } from "vitest";

import {
  WP_ATTRACTION_INVENTORY_MAPPINGS,
  WP_PRICING_COMPONENT_CLASSES,
  buildWpDraftResourceRequirements,
  wpAttractionsRequiringInventoryForBooking,
} from "@/server/event-planner/wp-parity/inventory-mapping";
import { wpApprovedQuoteInventoryBlockers } from "@/lib/bookings/confirmation-blockers";
import type { EventPlanPayload } from "@/types/event-planner";

describe("WP inventory mapping", () => {
  it("classifies attractions and pricing components", () => {
    expect(WP_ATTRACTION_INVENTORY_MAPPINGS.map((row) => row.attraction)).toEqual([
      "bowling",
      "axe",
      "laser",
      "golf",
      "climbing",
      "arcade",
    ]);
    expect(WP_PRICING_COMPONENT_CLASSES.some((row) => row.inventoryClass === "food")).toBe(true);
    expect(WP_PRICING_COMPONENT_CLASSES.some((row) => row.inventoryClass === "pricing_only")).toBe(
      true,
    );
  });

  it("builds soft requirements without holds when resource types exist", () => {
    const result = buildWpDraftResourceRequirements({
      selectedAttractions: ["bowling", "arcade"],
      guestCount: 12,
      durationMinutes: 120,
      resourceTypes: [
        {
          id: "rt_bowl",
          slug: "bowling-lane",
          name: "Bowling Lane",
          inventoryConfigured: true,
          active: true,
        },
      ],
    });
    expect(result.mappedAttractions).toContain("bowling");
    expect(result.requirements).toHaveLength(1);
    expect(result.requirements[0]?.quantity).toBe(2);
    expect(result.unmappedReservableAttractions).toEqual([]);
    // Arcade is soft capacity and unmapped here — not a hard booking hold requirement.
    expect(wpAttractionsRequiringInventoryForBooking(["bowling", "arcade"])).toEqual(["bowling"]);
  });

  it("blocks booking confirmation when reservable WP attractions are unmapped", () => {
    const payload = {
      version: 1,
      guestCount: 8,
      durationMinutes: 120,
      eventDate: "2099-06-01",
      startTime: "13:00",
      activities: [{ name: "bowling", durationMinutes: 60, priceCents: 1000 }],
      spaces: [],
      dining: null,
      lineItems: [
        {
          slug: "bowling",
          name: "Bowling",
          quantity: 1,
          unitPriceCents: 1000,
          totalCents: 1000,
          kind: "WP_LINE",
        },
      ],
      resourceRequirements: [],
      wpQuoteDraft: {
        source: "wordpress_parity_private_calculation",
        pricingSource: "approved_plugin_baseline",
        selectedAttractions: ["bowling"],
        planName: "Test",
        planDate: "2099-06-01",
        subtotalCents: 1000,
        taxCents: 0,
        totalCents: 1000,
        warnings: [],
        catalogPriceDiscrepancies: [],
      },
      employeeApprovedQuote: {
        marker: "employee_approved_wordpress_quote",
        approvedAt: "2099-01-01T00:00:00.000Z",
        availabilityConfirmed: false,
        availabilityNote: "test",
      },
    } as unknown as EventPlanPayload;

    const blockers = wpApprovedQuoteInventoryBlockers(payload);
    expect(blockers.length).toBe(1);
    expect(blockers[0]).toContain("bowling");
  });
});
