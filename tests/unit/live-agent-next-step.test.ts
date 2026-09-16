import { describe, expect, it } from "vitest";

import {
  liveAgentBookingGuide,
  liveAgentBookingSteps,
  liveAgentHoldReadiness,
} from "@/lib/inquiries/live-agent-next-step";

describe("live agent booking guide", () => {
  it("asks an unassigned agent to start working", () => {
    expect(
      liveAgentBookingGuide({
        booked: false,
        assigned: false,
        hasHold: false,
        confirmBlockers: ["Place a resource hold before confirming a booking."],
      }),
    ).toMatchObject({
      currentStepId: "review",
      nextTitle: "Start working",
    });
  });

  it("sends staff to Resources when inventory is not configured", () => {
    const guide = liveAgentBookingGuide({
      booked: false,
      assigned: true,
      needsHold: true,
      hasHold: false,
      needsInventory: true,
      canPlaceHold: false,
      confirmBlockers: ["Bowling Lane still needs resource configuration before booking."],
    });
    expect(guide.currentStepId).toBe("hold");
    expect(guide.nextTitle).toBe("Set up rooms and lanes");
    expect(guide.nextDetail).toContain("Resources");
  });

  it("asks for a hold when inventory is ready", () => {
    expect(
      liveAgentBookingGuide({
        booked: false,
        assigned: true,
        needsHold: true,
        hasHold: false,
        needsInventory: false,
        canPlaceHold: true,
        confirmBlockers: [],
      }),
    ).toMatchObject({
      currentStepId: "hold",
      nextTitle: "Hold rooms and lanes",
    });
  });

  it("moves to confirm after a hold is placed without Ready to Finalize", () => {
    expect(
      liveAgentBookingGuide({
        booked: false,
        assigned: true,
        needsHold: true,
        hasHold: true,
        confirmBlockers: [],
      }),
    ).toMatchObject({
      currentStepId: "confirm",
      nextTitle: "Confirm this booking",
      nextDetail: expect.stringContaining("Resources are currently held"),
    });
  });

  it("is ready to confirm when blockers are cleared", () => {
    expect(
      liveAgentBookingGuide({
        booked: false,
        assigned: true,
        hasHold: true,
        confirmBlockers: [],
      }),
    ).toMatchObject({
      currentStepId: "confirm",
      nextTitle: "Confirm this booking",
    });
  });

  it("labels the held path Resources Held and the no-hold path Place Hold", () => {
    expect(liveAgentBookingSteps({ needsHold: true, hasHold: true }).map((row) => row.label)).toEqual([
      "Review",
      "Resources Held",
      "Confirm Booking",
    ]);
    expect(liveAgentBookingSteps({ needsHold: true, hasHold: false }).map((row) => row.label)).toEqual([
      "Review",
      "Place Hold",
      "Confirm Booking",
    ]);
  });

  it("treats missing numbered inventory as a hold blocker", () => {
    expect(
      liveAgentHoldReadiness({
        requirements: [
          {
            quantity: 4,
            inventoryConfigured: false,
            requiresStaffConfiguration: true,
            resourceTypeId: null,
          },
        ],
        validated: false,
        available: false,
      }),
    ).toEqual({ needsHold: true, canPlaceHold: false, needsInventory: true });
  });
});
