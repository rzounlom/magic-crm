import { describe, expect, it } from "vitest";

import {
  summarizePlanChanges,
  workingPlanAffectsExistingHolds,
  workingPlanAffectsHold,
} from "@/lib/inquiries/plan-diff";
import type { EventPlanPayload } from "@/types/event-planner";

function payload(overrides: Partial<EventPlanPayload> = {}): EventPlanPayload {
  return {
    guestCount: 75,
    eventDate: "2026-10-15",
    startTime: "17:00",
    durationMinutes: 180,
    activities: [
      { knowledgeItemId: "kart", name: "Go-Karts", quantity: 1, priceCents: 135000 },
      { knowledgeItemId: "axe", name: "Axe Throwing", quantity: 1, priceCents: 150000 },
    ],
    dining: { label: "Catered Slider Bar", priceCents: 120000 },
    spaces: [{ knowledgeItemId: "room", name: "Party Room", priceCents: 40000 }],
    schedule: [],
    pricingComplete: true,
    resourceRequirements: [
      {
        knowledgeItemId: "kart",
        knowledgeItemName: "Go-Karts",
        resourceTypeId: "type_kart",
        resourceTypeSlug: "go-kart",
        resourceTypeName: "Go-Kart",
        quantityRule: "FIXED",
        quantity: 1,
        guestsPerUnit: null,
        durationMinutes: 60,
        inventoryConfigured: true,
        requiresStaffConfiguration: false,
      },
    ],
    ...overrides,
  };
}

describe("plan diff", () => {
  it("summarizes guest, activity, duration, and estimate changes", () => {
    const changes = summarizePlanChanges(
      payload(),
      payload({
        guestCount: 80,
        durationMinutes: 210,
        activities: [
          { knowledgeItemId: "kart", name: "Go-Karts", quantity: 1, priceCents: 144000 },
          { knowledgeItemId: "bowl", name: "Bowling", quantity: 1, priceCents: 160000 },
        ],
        dining: { label: "Catered Slider Bar", priceCents: 128000 },
      }),
    );
    expect(changes.map((row) => `${row.label}: ${row.detail}`)).toEqual(
      expect.arrayContaining([
        "Guest count: +5",
        "Duration: +30 minutes",
        "Activity added: Bowling",
        "Activity removed: Axe Throwing",
      ]),
    );
    expect(changes.some((row) => row.label === "Estimate")).toBe(true);
  });

  it("flags resource-impacting edits against the previous version and current holds", () => {
    const selected = payload();
    const laterStart = payload({ startTime: "18:00" });
    expect(workingPlanAffectsHold(selected, laterStart)).toBe(true);
    expect(workingPlanAffectsHold(selected, selected)).toBe(false);
    expect(
      workingPlanAffectsExistingHolds(selected, [{ startMinute: 17 * 60, endMinute: 20 * 60 }]),
    ).toBe(false);
    expect(
      workingPlanAffectsExistingHolds(laterStart, [{ startMinute: 17 * 60, endMinute: 20 * 60 }]),
    ).toBe(true);
  });
});
