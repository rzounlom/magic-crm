import { describe, expect, it } from "vitest";

import {
  formatInquiryEmployeeStatus,
  formatInquiryQueueLabel,
  formatInquiryStatus,
} from "@/lib/inquiries/inquiry-status-display";
import { INQUIRY_STATUSES } from "@/types/inquiry";

describe("inquiry status display", () => {
  it("presents READY_FOR_HUMAN as Ready for live agent", () => {
    expect(formatInquiryStatus(INQUIRY_STATUSES.READY_FOR_HUMAN)).toBe("Ready for live agent");
    expect(formatInquiryEmployeeStatus(INQUIRY_STATUSES.READY_FOR_HUMAN, false)).toBe(
      "Ready for live agent",
    );
  });

  it("does not expose raw enum labels", () => {
    expect(formatInquiryStatus(INQUIRY_STATUSES.READY_FOR_HUMAN)).not.toContain("READY_FOR_HUMAN");
    expect(formatInquiryStatus(INQUIRY_STATUSES.NEEDS_FOLLOW_UP)).toBe("Needs follow-up");
    expect(formatInquiryStatus(INQUIRY_STATUSES.NEEDS_FOLLOW_UP)).not.toContain("NEEDS_FOLLOW_UP");
    expect(formatInquiryStatus(INQUIRY_STATUSES.AI_ENGAGED)).toBe("AI handling");
    expect(formatInquiryEmployeeStatus(INQUIRY_STATUSES.AI_ENGAGED, true)).not.toMatch(/HUMAN/);
  });

  it("adds Live agent only when AI is off and the status is not already a handoff", () => {
    expect(formatInquiryEmployeeStatus(INQUIRY_STATUSES.AWAITING_CUSTOMER, false)).toBe(
      "Awaiting customer · Live agent",
    );
    expect(formatInquiryEmployeeStatus(INQUIRY_STATUSES.READY_FOR_HUMAN, false)).not.toContain(
      "Live agent ·",
    );
  });

  it("labels a selected plan as ready to book", () => {
    expect(
      formatInquiryQueueLabel({
        status: INQUIRY_STATUSES.READY_FOR_HUMAN,
        aiHandlingEnabled: false,
        selectedEventPlanId: "plan_1",
      }),
    ).toBe("CUSTOMER SELECTED PLAN — READY TO BOOK");
  });

  it("labels a converted inquiry with the booking reference", () => {
    expect(
      formatInquiryQueueLabel({
        status: INQUIRY_STATUSES.BOOKED,
        aiHandlingEnabled: false,
        selectedEventPlanId: "plan_1",
        bookingNumber: "FUN-2026-00421",
      }),
    ).toBe("Converted to Booking FUN-2026-00421");
  });
});
