import { describe, expect, it } from "vitest";

import { wpApprovedQuoteInventoryBlockers } from "@/lib/bookings/confirmation-blockers";
import {
  buildWpDraftResourceRequirements,
  buildWpExclusiveRoomRequirements,
  resolveWpExclusiveRooms,
} from "@/server/event-planner/wp-parity/inventory-mapping";
import type { EventPlanPayload } from "@/types/event-planner";
import { RESOURCE_QUANTITY_RULES } from "@/types/resource-schedule";

const GENERATIONS_TYPES = [
  { id: "rt_bowl", slug: "bowling-lane", name: "Bowling Lane", inventoryConfigured: true, active: true },
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

describe("WP exclusive room mapping", () => {
  it("maps lower, skybox, mezzanine, and full-facility from structured plan signals", () => {
    expect(
      resolveWpExclusiveRooms({
        roomIncluded: false,
        itemLabels: ["Lower Event Room — 3 hours", "Bowling — 1 hour"],
      }).exclusiveRooms,
    ).toEqual(["lower"]);

    expect(
      resolveWpExclusiveRooms({
        roomIncluded: false,
        itemLabels: ["Skybox / Upper Event Room — 3 hours"],
      }).exclusiveRooms,
    ).toEqual(["upper"]);

    expect(
      resolveWpExclusiveRooms({
        roomIncluded: true,
        rentalKind: "mezzanine",
        rentalKinds: ["mezzanine"],
        itemLabels: ["Mezzanine buyout — 3 hours"],
      }).exclusiveRooms,
    ).toEqual(["mezzanine"]);

    expect(
      resolveWpExclusiveRooms({
        roomIncluded: true,
        rentalKind: "full",
        rentalKinds: ["full"],
        itemLabels: ["Full Facility rental — food and drinks extra"],
      }).exclusiveRooms,
    ).toEqual(["full"]);
  });

  it("treats additional room hours as pricing-only and does not invent a second unit", () => {
    const resolved = resolveWpExclusiveRooms({
      roomIncluded: false,
      itemLabels: [
        "Lower Event Room — 3 hours",
        "Explicitly requested extra room hour",
      ],
    });
    expect(resolved.exclusiveRooms).toEqual(["lower"]);
    expect(resolved.pricingOnlyRoomAdjustments).toHaveLength(1);
    const built = buildWpExclusiveRoomRequirements({
      exclusiveRooms: resolved.exclusiveRooms,
      durationMinutes: 240,
      resourceTypes: [...GENERATIONS_TYPES],
    });
    expect(built.requirements).toHaveLength(1);
    expect(built.requirements[0]?.resourceTypeSlug).toBe("lower-event-room");
  });

  it("does not reserve from private-room preference alone", () => {
    expect(
      resolveWpExclusiveRooms({
        roomIncluded: false,
        itemLabels: ["Bowling — 1 hour"],
      }).exclusiveRooms,
    ).toEqual([]);
  });

  it("dedupes cove room against climbing attraction resource type", () => {
    const attractions = buildWpDraftResourceRequirements({
      selectedAttractions: ["climbing"],
      guestCount: 10,
      durationMinutes: 120,
      resourceTypes: [...GENERATIONS_TYPES],
    });
    const rooms = buildWpExclusiveRoomRequirements({
      exclusiveRooms: ["cove"],
      durationMinutes: 180,
      resourceTypes: [...GENERATIONS_TYPES],
      existingRequirements: attractions.requirements,
    });
    expect(rooms.mappedExclusiveRooms).toEqual(["cove"]);
    expect(rooms.requirements).toHaveLength(0);
  });

  it("marks full-facility as location-exclusive and blocks missing room mapping", () => {
    const rooms = buildWpExclusiveRoomRequirements({
      exclusiveRooms: ["full"],
      durationMinutes: 180,
      resourceTypes: [...GENERATIONS_TYPES],
    });
    expect(rooms.requirements[0]?.quantityRule).toBe(RESOURCE_QUANTITY_RULES.LOCATION_EXCLUSIVE);
    expect(rooms.requirements[0]?.locationExclusive).toBe(true);

    const payload = {
      version: 1,
      guestCount: 20,
      durationMinutes: 180,
      eventDate: "2099-06-01",
      startTime: "13:00",
      activities: [],
      spaces: [],
      dining: null,
      lineItems: [],
      resourceRequirements: [],
      wpQuoteDraft: {
        source: "wordpress_parity_private_calculation",
        pricingSource: "approved_plugin_baseline",
        selectedAttractions: [],
        exclusiveRooms: ["lower"],
        pricingOnlyRoomAdjustments: [],
        planName: "Test",
        planDate: "2099-06-01",
        subtotalCents: 0,
        taxCents: 0,
        totalCents: 0,
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
    expect(blockers.some((row) => row.includes("lower"))).toBe(true);
  });

  it("preserves known WP lower-room extra hour discrepancy documentation at 7500 cents", async () => {
    const { WP_KNOWN_CATALOG_DISCREPANCIES } = await import(
      "@/server/event-planner/wp-parity/quote-draft"
    );
    const lowerExtra = WP_KNOWN_CATALOG_DISCREPANCIES.find(
      (row) => row.wpKey === "rooms.lower_extra",
    );
    expect(lowerExtra?.wpCents).toBe(7500);
    expect(lowerExtra?.magicCatalogCents).toBe(5000);
  });
});
