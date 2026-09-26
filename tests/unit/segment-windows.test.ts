import { describe, expect, it } from "vitest";

import { formatCustomerFacingClocks } from "@/lib/inquiries/tenant-datetime";
import { buildItinerary } from "@/server/catalog/itinerary";
import { searchViableStructuredItinerary } from "@/server/resources/itinerary-search";
import {
  applyItineraryWindows,
  customerAdjustmentNote,
  shiftItineraryToStart,
  stampPlanResourceWindows,
} from "@/server/resources/segment-windows";
import { RESOURCE_QUANTITY_RULES, type PlanResourceRequirement } from "@/types/resource-schedule";

function requirement(name: string, productId: string, slug: string): PlanResourceRequirement {
  return {
    knowledgeItemId: productId,
    knowledgeItemName: name,
    productId,
    resourceTypeId: slug,
    resourceTypeSlug: slug,
    resourceTypeName: name,
    quantityRule: RESOURCE_QUANTITY_RULES.FIXED,
    quantity: 1,
    guestsPerUnit: null,
    durationMinutes: 180,
    inventoryConfigured: true,
    requiresStaffConfiguration: false,
  };
}

describe("segment resource windows", () => {
  it("builds structured itinerary offsets from product durations", () => {
    const itinerary = buildItinerary({
      startTime: "17:30",
      durationMinutes: 180,
      foodFirst: true,
      products: [
        { id: "food", name: "Food", kind: "FOOD", durationMinutes: 60 },
        { id: "axe", name: "Axe Throwing", kind: "ATTRACTION", durationMinutes: 30 },
        { id: "bowl", name: "Bowling", kind: "ATTRACTION", durationMinutes: 60 },
        { id: "arcade", name: "Arcade", kind: "ATTRACTION", durationMinutes: 30 },
      ],
    });
    expect(itinerary.map((row) => [row.label, row.startTime, row.endTime, row.startOffsetMinutes])).toEqual([
      ["Food", "17:30", "18:30", 0],
      ["Axe Throwing", "18:30", "19:00", 60],
      ["Bowling", "19:00", "20:00", 90],
      ["Arcade", "20:00", "20:30", 150],
    ]);
  });

  it("stamps axe and bowling onto their itinerary segments instead of the full event", () => {
    const itinerary = buildItinerary({
      startTime: "17:30",
      durationMinutes: 180,
      foodFirst: true,
      products: [
        { id: "food", name: "Food", kind: "FOOD", durationMinutes: 60 },
        { id: "axe", name: "Axe Throwing", kind: "ATTRACTION", durationMinutes: 30 },
        { id: "bowl", name: "Bowling", kind: "ATTRACTION", durationMinutes: 60 },
      ],
    });
    const stamped = applyItineraryWindows(
      [requirement("Axe Throwing", "axe", "axe"), requirement("Bowling", "bowl", "bowling")],
      { itinerary, startTime: "17:30" },
    );
    expect(stamped[0]?.windowStartTime).toBe("18:30");
    expect(stamped[0]?.windowEndTime).toBe("19:00");
    expect(stamped[1]?.windowStartTime).toBe("19:00");
    expect(stamped[1]?.windowEndTime).toBe("20:00");
  });

  it("keeps legacy snapshots without itinerary on the full event window", () => {
    const stamped = stampPlanResourceWindows({
      startTime: "17:30",
      itinerary: [],
      resourceRequirements: [requirement("Bowling", "bowl", "bowling")],
    });
    expect(stamped[0]?.windowStartTime).toBeUndefined();
  });

  it("shifts itinerary clocks from stored offsets", () => {
    const original = buildItinerary({
      startTime: "17:30",
      durationMinutes: 90,
      foodFirst: true,
      products: [
        { id: "food", name: "Food", kind: "FOOD", durationMinutes: 60 },
        { id: "axe", name: "Axe Throwing", kind: "ATTRACTION", durationMinutes: 30 },
      ],
    });
    const shifted = shiftItineraryToStart(original, "18:00");
    expect(shifted.map((row) => `${row.startTime}–${row.endTime}`)).toEqual(["18:00–19:00", "19:00–19:30"]);
  });

  it("writes a customer-facing adjustment note without resource ids", () => {
    const note = customerAdjustmentNote({
      conflictLabels: ["Axe Throwing"],
      requestedStartTime: "19:00",
      viableStartTime: "19:30",
      orderChanged: false,
    });
    expect(note).toContain("Axe Throwing");
    expect(note).toContain("19:30");
    expect(note).not.toContain("7:30");
    expect(note).not.toContain("res_");
    const rendered = formatCustomerFacingClocks(note);
    expect(rendered).toContain("7:30 PM");
    expect(rendered).not.toMatch(/AM PM|PM AM|\b19:30\b/);
  });

  it("searches closest start first and does not call a later offset after a hit", async () => {
    const checked: string[] = [];
    const result = await searchViableStructuredItinerary({
      requestedStartTime: "18:00",
      durationMinutes: 90,
      foodFirst: true,
      products: [
        { id: "food", name: "Food", kind: "FOOD", durationMinutes: 30 },
        { id: "bowl", name: "Bowling", kind: "ATTRACTION", durationMinutes: 60 },
      ],
      baseRequirements: [requirement("Bowling", "bowl", "bowling")],
      check: async ({ startTime }) => {
        checked.push(startTime);
        return {
          validated: true,
          available: startTime === "18:30",
          note: "",
          types: startTime === "18:30" ? [] : [{ resourceTypeSlug: "bowling", resourceTypeName: "Bowling", requestedQuantity: 1, availableQuantity: 0, inventoryConfigured: true, conflict: true, requiresStaffConfiguration: false }],
        };
      },
    });
    expect(result?.startTime).toBe("18:30");
    expect(checked[0]).toBe("18:00");
    expect(checked).toContain("18:30");
    expect(checked.some((time) => time === "19:00")).toBe(false);
  });
});
