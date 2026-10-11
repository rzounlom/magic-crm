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
        confirmBlockers: [],
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
      needsInventory: true,
      confirmBlockers: [],
      hasHold: false,
    });
    expect(guide.currentStepId).toBe("availability");
    expect(guide.nextTitle).toBe("Set up rooms and lanes");
    expect(guide.nextDetail).toContain("Resources");
  });

  it("asks to check availability after assignment", () => {
    expect(
      liveAgentBookingGuide({
        booked: false,
        assigned: true,
        needsInventory: false,
        confirmBlockers: [],
        hasHold: false,
        availabilityChecked: false,
      }),
    ).toMatchObject({
      currentStepId: "availability",
      nextTitle: "Check availability",
    });
  });

  it("surfaces optional HOLD before confirm when finite resources need reservation", () => {
    expect(
      liveAgentBookingGuide({
        booked: false,
        assigned: true,
        hasHold: false,
        needsHold: true,
        canPlaceHold: true,
        confirmBlockers: [],
        availabilityChecked: true,
      }),
    ).toMatchObject({
      currentStepId: "hold",
      nextTitle: "Place an optional HOLD, or confirm",
    });
  });

  it("moves to confirm after HOLD is placed", () => {
    expect(
      liveAgentBookingGuide({
        booked: false,
        assigned: true,
        hasHold: true,
        needsHold: false,
        confirmBlockers: [],
        availabilityChecked: true,
      }),
    ).toMatchObject({
      currentStepId: "confirm",
      nextTitle: "Resources held — confirm booking",
    });
  });

  it("moves to confirm booking after availability when HOLD is not needed", () => {
    expect(
      liveAgentBookingGuide({
        booked: false,
        assigned: true,
        hasHold: false,
        needsHold: false,
        confirmBlockers: [],
        availabilityChecked: true,
      }),
    ).toMatchObject({
      currentStepId: "confirm",
      nextTitle: "Confirm booking",
    });
  });

  it("flags a pending confirmation availability conflict", () => {
    expect(
      liveAgentBookingGuide({
        booked: false,
        assigned: true,
        hasHold: false,
        confirmBlockers: [],
        paymentConflict: true,
        availabilityChecked: true,
      }),
    ).toMatchObject({
      currentStepId: "confirm",
      nextTitle: "Pending confirmation — availability conflict",
    });
  });

  it("describes a cancelled booking without asking to confirm again", () => {
    expect(
      liveAgentBookingGuide({
        booked: true,
        cancelled: true,
        assigned: true,
        hasHold: false,
        confirmBlockers: [],
      }),
    ).toMatchObject({
      currentStepId: "confirm",
      nextTitle: "This booking was cancelled",
    });
  });

  it("labels the staff journey with optional HOLD and payment-neutral confirm", () => {
    expect(liveAgentBookingSteps().map((row) => row.label)).toEqual([
      "Review",
      "Check Availability",
      "HOLD (optional)",
      "Confirm booking",
    ]);
  });

  it("flags inventory gaps and HOLD eligibility from finite requirements", () => {
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

    expect(
      liveAgentHoldReadiness({
        requirements: [
          {
            quantity: 2,
            inventoryConfigured: true,
            requiresStaffConfiguration: false,
            resourceTypeId: "type_1",
          },
        ],
        validated: true,
        available: true,
        serverHoldAttemptAllowed: true,
      }),
    ).toEqual({ needsHold: true, canPlaceHold: true, needsInventory: false });

    expect(
      liveAgentHoldReadiness({
        requirements: [
          {
            quantity: 2,
            inventoryConfigured: true,
            requiresStaffConfiguration: false,
            resourceTypeId: "type_1",
          },
        ],
        validated: true,
        available: true,
        hasActiveHold: true,
      }),
    ).toEqual({ needsHold: false, canPlaceHold: false, needsInventory: false });
  });
});
