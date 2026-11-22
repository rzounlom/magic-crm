import { describe, expect, it } from "vitest";

import { formatEmployeeInquiryQueueLabel } from "@/lib/inquiries/inquiry-workflow-labels";
import { INQUIRY_STATUSES } from "@/types/inquiry";

describe("formatEmployeeInquiryQueueLabel WP presentation", () => {
  it("distinguishes staff quote progress without READY TO BOOK", () => {
    expect(
      formatEmployeeInquiryQueueLabel({
        isWpIntake: true,
        status: INQUIRY_STATUSES.READY_FOR_HUMAN,
        aiHandlingEnabled: false,
        selectedEventPlanId: "draft-plan",
        humanHandoffReason: "PUBLIC_EVENT_REQUEST",
        hasStaffQuoteDraft: true,
      }),
    ).toBe("Staff quote in progress");

    expect(
      formatEmployeeInquiryQueueLabel({
        isWpIntake: true,
        status: INQUIRY_STATUSES.READY_FOR_HUMAN,
        aiHandlingEnabled: false,
        humanHandoffReason: "PUBLIC_EVENT_REQUEST",
        staffQuoteApproved: true,
        hasStaffQuoteDraft: true,
      }),
    ).toBe("Staff quote approved — delivery unavailable");

    expect(
      formatEmployeeInquiryQueueLabel({
        isWpIntake: true,
        status: INQUIRY_STATUSES.READY_FOR_HUMAN,
        aiHandlingEnabled: false,
        humanHandoffReason: "PUBLIC_EVENT_REQUEST",
      }),
    ).toBe("Event inquiry — staff review required");
  });
});
