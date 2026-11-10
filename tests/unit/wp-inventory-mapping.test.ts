import { describe, expect, it } from "vitest";

import {
  WP_ATTRACTION_INVENTORY_MAPPINGS,
  WP_PRICING_COMPONENT_CLASSES,
  buildWpDraftResourceRequirements,
  summarizeWpInventoryCoverage,
  wpAttractionsRequiringInventoryForBooking,
} from "@/server/event-planner/wp-parity/inventory-mapping";
import { wpApprovedQuoteInventoryBlockers } from "@/lib/bookings/confirmation-blockers";
import type { EventPlanPayload } from "@/types/event-planner";

/** Snapshot of Generations CRM Test resource type slugs from Phase 8A read-only audit. */
const GENERATIONS_RESOURCE_TYPES = [
  { id: "rt_bowl", slug: "bowling-lane", name: "Bowling Lane", inventoryConfigured: true, active: true },
  {
    id: "rt_axe",
    slug: "axe-throwing-lane",
    name: "Axe Throwing Lane",
    inventoryConfigured: true,
    active: true,
  },
  {
    id: "rt_laser",
    slug: "laser-tag-arena",
    name: "Laser Tag Arena",
    inventoryConfigured: true,
    active: true,
  },
  {
    id: "rt_golf",
    slug: "mini-golf-course",
    name: "Mini Golf Course",
    inventoryConfigured: true,
    active: true,
  },
  {
    id: "rt_climb",
    slug: "climbing-area",
    name: "Climbing Area",
    inventoryConfigured: true,
    active: true,
  },
  {
    id: "rt_lower",
    slug: "lower-event-room",
    name: "Lower Event Room",
    inventoryConfigured: true,
    active: true,
  },
  { id: "rt_sky", slug: "skybox", name: "Skybox", inventoryConfigured: true, active: true },
  { id: "rt_mez", slug: "mezzanine", name: "Mezzanine", inventoryConfigured: true, active: true },
  {
    id: "rt_full",
    slug: "full-facility",
    name: "Full Facility",
    inventoryConfigured: true,
    active: true,
  },
] as const;

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

  it("maps Generations catalog slugs for reservable attractions (no arcade type)", () => {
    const coverage = summarizeWpInventoryCoverage({ resourceTypes: [...GENERATIONS_RESOURCE_TYPES] });
    expect(
      coverage.attractions
        .filter((row) => row.requiresHoldForBooking)
        .every((row) => row.covered),
    ).toBe(true);
    expect(coverage.attractions.find((row) => row.attraction === "arcade")?.covered).toBe(false);
    expect(coverage.attractions.find((row) => row.attraction === "axe")?.matchedSlug).toBe(
      "axe-throwing-lane",
    );
    expect(coverage.attractions.find((row) => row.attraction === "laser")?.matchedSlug).toBe(
      "laser-tag-arena",
    );
    expect(coverage.attractions.find((row) => row.attraction === "climbing")?.matchedSlug).toBe(
      "climbing-area",
    );
  });

  it("builds soft requirements for Generations attraction slugs without creating holds", () => {
    const result = buildWpDraftResourceRequirements({
      selectedAttractions: ["bowling", "axe", "laser", "golf", "climbing", "arcade"],
      guestCount: 16,
      durationMinutes: 120,
      resourceTypes: [...GENERATIONS_RESOURCE_TYPES],
    });
    expect(result.mappedAttractions).toEqual(["bowling", "axe", "laser", "golf", "climbing"]);
    expect(result.unmappedReservableAttractions).toEqual([]);
    expect(result.requirements.find((row) => row.resourceTypeSlug === "bowling-lane")?.quantity).toBe(
      3,
    );
    expect(
      result.requirements.find((row) => row.resourceTypeSlug === "axe-throwing-lane")?.quantity,
    ).toBe(2);
    expect(result.requirements.find((row) => row.resourceTypeSlug === "laser-tag-arena")?.quantity).toBe(
      1,
    );
    // Arcade remains soft — no Generations arcade resource type.
    expect(wpAttractionsRequiringInventoryForBooking(["bowling", "arcade"])).toEqual(["bowling"]);
  });

  it("uses WordPress bowling lane curve above 48 guests", () => {
    const result = buildWpDraftResourceRequirements({
      selectedAttractions: ["bowling"],
      guestCount: 50,
      durationMinutes: 60,
      resourceTypes: [...GENERATIONS_RESOURCE_TYPES],
    });
    expect(result.requirements[0]?.quantity).toBe(8);
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
