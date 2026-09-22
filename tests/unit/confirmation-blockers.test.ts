import { describe, expect, it } from "vitest";

import { bookingConfirmationBlockers } from "@/lib/bookings/confirmation-blockers";
import { INQUIRY_STATUSES, INQUIRY_WORKFLOW_STAGES } from "@/types/inquiry";
import { PLAN_AVAILABILITY_STATUSES, RESOURCE_RESERVATION_STATUSES } from "@/types/resource-schedule";
import type { EventPlanPayload } from "@/types/event-planner";

const payload: EventPlanPayload = {
  guestCount: 75,
  eventDate: "2026-10-15",
  startTime: "18:00",
  durationMinutes: 180,
  activities: [{ knowledgeItemId: "a", name: "Bowling", quantity: 1, priceCents: 1000 }],
  dining: { label: "Catered Slider Bar", priceCents: 500 },
  spaces: [],
  schedule: [],
  pricingComplete: true,
};

function input(overrides: Partial<Parameters<typeof bookingConfirmationBlockers>[0]> = {}) {
  return {
    inquiryStatus: INQUIRY_STATUSES.READY_FOR_HUMAN,
    workflowStage: INQUIRY_WORKFLOW_STAGES.AGENT_WORKING,
    readyToFinalizeAt: new Date("2026-09-09T16:00:00.000Z"),
    selectedEventPlanId: "plan_selected",
    assignedUserProfileId: "agent_1",
    workingPlan: {
      availabilityStatus: PLAN_AVAILABILITY_STATUSES.AVAILABLE,
      estimatedTotalCents: 450000,
      payload,
    },
    holds: [
      {
        status: RESOURCE_RESERVATION_STATUSES.HOLD,
        expiresAt: new Date("2026-09-10T16:00:00.000Z"),
        releasedAt: null,
        startMinute: 18 * 60,
        endMinute: 21 * 60,
        resource: { resourceType: { id: "type_lane", name: "Bowling Lane" } },
      },
    ],
    hasFiniteRequirements: true,
    ...overrides,
  };
}

describe("booking confirmation blockers", () => {
  it("returns no blockers for a complete working version without a hold", () => {
    expect(bookingConfirmationBlockers(input({ holds: [] }), new Date("2026-09-09T16:00:00.000Z"))).toEqual([]);
  });

  it("does not require a resource hold before confirmation", () => {
    const reasons = bookingConfirmationBlockers(
      input({
        workflowStage: INQUIRY_WORKFLOW_STAGES.AGENT_WORKING,
        readyToFinalizeAt: null,
        holds: [],
        hasFiniteRequirements: true,
      }),
      new Date("2026-09-09T16:00:00.000Z"),
    );
    expect(reasons).toEqual([]);
    expect(reasons.some((row) => row.includes("hold"))).toBe(false);
  });

  it("still requires date, time, and guest count", () => {
    const reasons = bookingConfirmationBlockers(
      input({
        holds: [],
        workingPlan: {
          availabilityStatus: PLAN_AVAILABILITY_STATUSES.UNAVAILABLE,
          estimatedTotalCents: 450000,
          payload: { ...payload, eventDate: "", startTime: "", guestCount: 0 },
        },
      }),
    );
    expect(reasons.some((row) => row.includes("event date"))).toBe(true);
    expect(reasons.some((row) => row.includes("start time"))).toBe(true);
    expect(reasons.some((row) => row.includes("guest count"))).toBe(true);
  });
});
