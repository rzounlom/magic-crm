import { describe, expect, it } from "vitest";

import { liveAgentQueuePriority, sortLiveAgentQueue } from "@/lib/inquiries/live-agent-queue";
import { READY_FOR_HUMAN_REASONS } from "@/lib/inquiries/ready-for-human-reason";
import { INQUIRY_STATUSES } from "@/types/inquiry";
import { PLAN_AVAILABILITY_STATUSES } from "@/types/resource-schedule";

const now = new Date("2026-09-09T16:00:00.000Z");

function inquiry(
  id: string,
  overrides: Partial<Parameters<typeof liveAgentQueuePriority>[0]> = {},
): Parameters<typeof liveAgentQueuePriority>[0] {
  return {
    id,
    status: INQUIRY_STATUSES.READY_FOR_HUMAN,
    selectedEventPlanId: "plan_1",
    humanHandoffReason: READY_FOR_HUMAN_REASONS.CUSTOMER_SELECTED_PLAN,
    assignedUserProfileId: null,
    customerSelectedAt: new Date("2026-09-09T12:00:00.000Z"),
    createdAt: new Date("2026-09-09T11:00:00.000Z"),
    ...overrides,
  };
}

describe("live agent queue priority", () => {
  it("puts unassigned selected-plan inquiries first, then availability issues, then expiring holds", () => {
    const unassigned = inquiry("unassigned");
    const availability = inquiry("availability", {
      assignedUserProfileId: "agent_a",
      selectedAvailabilityStatus: PLAN_AVAILABILITY_STATUSES.AVAILABILITY_CHANGED,
    });
    const expiring = inquiry("expiring", {
      assignedUserProfileId: "agent_a",
      selectedAvailabilityStatus: PLAN_AVAILABILITY_STATUSES.AVAILABLE,
      earliestHoldExpiresAt: new Date("2026-09-09T18:00:00.000Z"),
    });
    const selectedOk = inquiry("selected-ok", {
      assignedUserProfileId: "agent_a",
      selectedAvailabilityStatus: PLAN_AVAILABILITY_STATUSES.AVAILABLE,
    });
    const otherReady = inquiry("other-ready", {
      selectedEventPlanId: null,
      humanHandoffReason: READY_FOR_HUMAN_REASONS.MANUAL_ESCALATION,
    });

    expect(liveAgentQueuePriority(unassigned, now)).toBe(0);
    expect(liveAgentQueuePriority(availability, now)).toBe(1);
    expect(liveAgentQueuePriority(expiring, now)).toBe(2);
    expect(liveAgentQueuePriority(selectedOk, now)).toBe(3);
    expect(liveAgentQueuePriority(otherReady, now)).toBe(4);
  });

  it("orders oldest waiting customer first within the same priority", () => {
    const newer = inquiry("newer", { customerSelectedAt: new Date("2026-09-09T14:00:00.000Z") });
    const older = inquiry("older", { customerSelectedAt: new Date("2026-09-09T10:00:00.000Z") });
    expect(sortLiveAgentQueue([newer, older], now).map((row) => row.id)).toEqual(["older", "newer"]);
  });
});
