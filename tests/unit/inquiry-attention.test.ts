import { describe, expect, it } from "vitest";

import {
  countInquiryAttention,
  isAwaitingStaffReview,
  isPendingConfirmation,
} from "@/lib/inquiries/live-agent-queue";
import { READY_FOR_HUMAN_REASONS } from "@/lib/inquiries/ready-for-human-reason";
import { INQUIRY_STATUSES } from "@/types/inquiry";

describe("inquiry attention classifiers", () => {
  it("matches pending confirmation with deposit or pending booking", () => {
    expect(
      isPendingConfirmation({
        status: INQUIRY_STATUSES.READY_FOR_HUMAN,
        salesStage: "DEPOSIT_PENDING",
      }),
    ).toBe(true);
    expect(
      isPendingConfirmation({
        status: INQUIRY_STATUSES.READY_FOR_HUMAN,
        bookings: [{ status: "PENDING_PAYMENT" }],
      }),
    ).toBe(true);
  });

  it("counts awaiting staff review for live-agent selected and other READY_FOR_HUMAN", () => {
    const selected = {
      status: INQUIRY_STATUSES.READY_FOR_HUMAN,
      selectedEventPlanId: "plan-1",
      humanHandoffReason: READY_FOR_HUMAN_REASONS.CUSTOMER_SELECTED_PLAN,
    };
    const wpReview = {
      status: INQUIRY_STATUSES.READY_FOR_HUMAN,
      selectedEventPlanId: "plan-2",
      humanHandoffReason: READY_FOR_HUMAN_REASONS.PUBLIC_EVENT_REQUEST,
    };
    expect(isAwaitingStaffReview(selected)).toBe(true);
    expect(isAwaitingStaffReview(wpReview)).toBe(true);
    expect(isPendingConfirmation(selected)).toBe(false);
  });

  it("aggregates dashboard counts without double-counting pending rows", () => {
    const counts = countInquiryAttention([
      {
        status: INQUIRY_STATUSES.READY_FOR_HUMAN,
        salesStage: "DEPOSIT_PENDING",
      },
      {
        status: INQUIRY_STATUSES.READY_FOR_HUMAN,
        selectedEventPlanId: "plan-1",
        humanHandoffReason: READY_FOR_HUMAN_REASONS.CUSTOMER_SELECTED_PLAN,
      },
      {
        status: INQUIRY_STATUSES.READY_FOR_HUMAN,
        humanHandoffReason: READY_FOR_HUMAN_REASONS.PUBLIC_EVENT_REQUEST,
      },
      {
        status: INQUIRY_STATUSES.AI_ENGAGED,
      },
    ]);
    expect(counts).toEqual({ pendingConfirmation: 1, awaitingStaffReview: 2 });
  });
});
