import { describe, expect, it } from "vitest";

import { numberedResourceNames, resourceTypeSlugFromName } from "@/server/resources/naming";
import { applyInventoryFeasibility } from "@/server/resources/feasibility";
import { planAvailabilityStatusFromCheck } from "@/server/resources/plan-availability-status";
import { PLAN_AVAILABILITY_STATUSES, RESOURCE_QUANTITY_RULES } from "@/types/resource-schedule";

describe("resource naming", () => {
  it("builds numbered names from a pattern without using prototype counts", () => {
    expect(resourceTypeSlugFromName("Bowling Lane")).toBe("bowling-lane");
    expect(numberedResourceNames("Bowling Lane {n}", 3, 1)).toEqual([
      "Bowling Lane 1",
      "Bowling Lane 2",
      "Bowling Lane 3",
    ]);
  });
});

describe("inventory feasibility", () => {
  it("rotates when guest-based quantity exceeds configured units instead of claiming simultaneous inventory", () => {
    const next = applyInventoryFeasibility(
      [
        {
          knowledgeItemId: "bowl",
          knowledgeItemName: "Bowling",
          resourceTypeId: "type_1",
          resourceTypeSlug: "bowling-lane",
          resourceTypeName: "Bowling Lane",
          quantityRule: RESOURCE_QUANTITY_RULES.PER_GUESTS,
          quantity: 13,
          guestsPerUnit: 6,
          durationMinutes: 180,
          inventoryConfigured: true,
          requiresStaffConfiguration: false,
        },
      ],
      [{ id: "type_1", activeCount: 8 }],
    );
    expect(next[0]?.quantity).toBe(8);
    expect(next[0]?.guestBasedQuantity).toBe(13);
    expect(next[0]?.rotationWaves).toBe(2);
    expect(next[0]?.rotationNote).toContain("rotations");
  });
});

describe("plan availability status", () => {
  it("keeps missing inventory as not validated rather than unavailable", () => {
    expect(
      planAvailabilityStatusFromCheck({
        previouslyValidated: false,
        result: {
          validated: false,
          available: true,
          note: "not configured",
          types: [
            {
              resourceTypeSlug: "bowling-lane",
              resourceTypeName: "Bowling Lane",
              requestedQuantity: 2,
              availableQuantity: null,
              inventoryConfigured: false,
              conflict: false,
              requiresStaffConfiguration: true,
            },
          ],
        },
      }),
    ).toBe(PLAN_AVAILABILITY_STATUSES.NOT_VALIDATED);
  });

  it("marks a previously valid plan as availability changed after a conflict", () => {
    expect(
      planAvailabilityStatusFromCheck({
        previouslyValidated: true,
        result: {
          validated: false,
          available: false,
          note: "held",
          types: [
            {
              resourceTypeSlug: "bowling-lane",
              resourceTypeName: "Bowling Lane",
              requestedQuantity: 2,
              availableQuantity: 1,
              inventoryConfigured: true,
              conflict: true,
              requiresStaffConfiguration: false,
            },
          ],
        },
      }),
    ).toBe(PLAN_AVAILABILITY_STATUSES.AVAILABILITY_CHANGED);
  });
});
