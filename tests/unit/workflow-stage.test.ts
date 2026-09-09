import { describe, expect, it } from "vitest";

import { deriveInquiryWorkflowStage, holdExpiresSoon } from "@/lib/inquiries/workflow-stage";
import { INQUIRY_WORKFLOW_STAGES } from "@/types/inquiry";

describe("inquiry workflow stage", () => {
  it("derives live-agent stages without changing Inquiry.status", () => {
    expect(
      deriveInquiryWorkflowStage({ selectedEventPlanId: "plan_1" }),
    ).toBe(INQUIRY_WORKFLOW_STAGES.READY_FOR_LIVE_AGENT);
    expect(
      deriveInquiryWorkflowStage({
        selectedEventPlanId: "plan_1",
        assignedUserProfileId: "agent_a",
      }),
    ).toBe(INQUIRY_WORKFLOW_STAGES.AGENT_WORKING);
    expect(
      deriveInquiryWorkflowStage({
        selectedEventPlanId: "plan_1",
        assignedUserProfileId: "agent_a",
        hasActiveHold: true,
      }),
    ).toBe(INQUIRY_WORKFLOW_STAGES.HOLD_PLACED);
    expect(
      deriveInquiryWorkflowStage({
        selectedEventPlanId: "plan_1",
        assignedUserProfileId: "agent_a",
        hasActiveHold: true,
        readyToFinalizeAt: new Date("2026-09-09T16:00:00.000Z"),
      }),
    ).toBe(INQUIRY_WORKFLOW_STAGES.READY_TO_FINALIZE);
  });

  it("treats holds inside the warning window as expiring soon", () => {
    const now = new Date("2026-09-09T16:00:00.000Z");
    expect(holdExpiresSoon(new Date("2026-09-09T18:00:00.000Z"), now)).toBe(true);
    expect(holdExpiresSoon(new Date("2026-09-10T16:00:00.000Z"), now)).toBe(false);
  });
});
