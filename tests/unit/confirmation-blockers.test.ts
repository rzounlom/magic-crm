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
    workflowStage: INQUIRY_WORKFLOW_STAGES.READY_TO_FINALIZE,
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
  it("returns no blockers for a ready-to-finalize working version with active holds", () => {
    expect(bookingConfirmationBlockers(input(), new Date("2026-09-09T16:00:00.000Z"))).toEqual([]);
  });

  it("blocks confirmation when Ready to Finalize is missing", () => {
    const reasons = bookingConfirmationBlockers(
      input({
        workflowStage: INQUIRY_WORKFLOW_STAGES.HOLD_PLACED,
        readyToFinalizeAt: null,
      }),
      new Date("2026-09-09T16:00:00.000Z"),
    );
    expect(reasons[0]).toMatch(/Ready to Finalize/i);
  });

  it("names an expired hold so the agent can recheck", () => {
    const reasons = bookingConfirmationBlockers(
      input({
        holds: [
          {
            status: RESOURCE_RESERVATION_STATUSES.HOLD,
            expiresAt: new Date("2026-09-09T12:00:00.000Z"),
            releasedAt: null,
            startMinute: 18 * 60,
            endMinute: 21 * 60,
            resource: { resourceType: { id: "type_lane", name: "Party Room" } },
          },
        ],
      }),
      new Date("2026-09-09T16:00:00.000Z"),
    );
    expect(reasons.some((row) => row.includes("Party Room hold has expired"))).toBe(true);
  });
});
