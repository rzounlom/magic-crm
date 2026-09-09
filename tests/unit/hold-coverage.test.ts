import { describe, expect, it } from "vitest";

import { holdCoverageErrors } from "@/lib/bookings/hold-coverage";
import type { EventPlanPayload } from "@/types/event-planner";
import { RESOURCE_QUANTITY_RULES, RESOURCE_RESERVATION_STATUSES } from "@/types/resource-schedule";

const payload: EventPlanPayload = {
  guestCount: 12,
  eventDate: "2026-10-15",
  startTime: "18:00",
  durationMinutes: 180,
  activities: [{ knowledgeItemId: "bowl", name: "Bowling", quantity: 2, priceCents: 0 }],
  dining: { label: "Pizza", priceCents: 0 },
  spaces: [],
  schedule: [],
  pricingComplete: true,
};

describe("hold coverage", () => {
  it("allows confirmation when there are no finite requirements", () => {
    expect(holdCoverageErrors(payload, [], [])).toEqual([]);
  });

  it("blocks when a required finite resource has no matching unexpired hold", () => {
    const errors = holdCoverageErrors(
      payload,
      [
        {
          knowledgeItemId: "bowl",
          knowledgeItemName: "Bowling",
          resourceTypeId: "type_lane",
          resourceTypeSlug: "bowling-lane",
          resourceTypeName: "Bowling Lane",
          quantityRule: RESOURCE_QUANTITY_RULES.FIXED,
          quantity: 2,
          guestsPerUnit: null,
          durationMinutes: 180,
          inventoryConfigured: true,
          requiresStaffConfiguration: false,
        },
      ],
      [
        {
          id: "hold_1",
          status: RESOURCE_RESERVATION_STATUSES.HOLD,
          expiresAt: new Date("2026-09-10T16:00:00.000Z"),
          releasedAt: null,
          startMinute: 18 * 60,
          endMinute: 21 * 60,
          resource: { resourceType: { id: "type_lane", name: "Bowling Lane" } },
        },
      ],
    );
    expect(errors[0]).toMatch(/Bowling Lane requires 2 held unit/i);
  });
});
