import { describe, expect, it } from "vitest";

import { liveAgentBookingGuide, liveAgentHoldReadiness } from "@/lib/inquiries/live-agent-next-step";

describe("live agent booking guide", () => {
  it("asks an unassigned agent to start working", () => {
    expect(
      liveAgentBookingGuide({
        booked: false,
        assigned: false,
        hasHold: false,
        readyToFinalize: false,
        confirmBlockers: ["Mark this inquiry Ready to Finalize before confirming a booking."],
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
      readyToFinalize: false,
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
        readyToFinalize: false,
        confirmBlockers: [],
      }),
    ).toMatchObject({
      currentStepId: "hold",
      nextTitle: "Hold rooms and lanes",
    });
  });

  it("moves to finalize after a hold is placed", () => {
    expect(
      liveAgentBookingGuide({
        booked: false,
        assigned: true,
        needsHold: true,
        hasHold: true,
        readyToFinalize: false,
        confirmBlockers: ["Mark this inquiry Ready to Finalize before confirming a booking."],
      }),
    ).toMatchObject({
      currentStepId: "finalize",
      nextTitle: "Mark ready to finalize",
    });
  });

  it("is ready to confirm when blockers are cleared", () => {
    expect(
      liveAgentBookingGuide({
        booked: false,
        assigned: true,
        hasHold: true,
        readyToFinalize: true,
        confirmBlockers: [],
      }),
    ).toMatchObject({
      currentStepId: "confirm",
      nextTitle: "Confirm this booking",
    });
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
