import { isCustomerSelectedPlanReason } from "@/lib/inquiries/ready-for-human-reason";
import { holdExpiresSoon } from "@/lib/inquiries/workflow-stage";
import { INQUIRY_STATUSES } from "@/types/inquiry";
import { PLAN_AVAILABILITY_STATUSES } from "@/types/resource-schedule";

export type LiveAgentQueueInquiry = {
  id: string;
  status: string;
  selectedEventPlanId?: string | null;
  humanHandoffReason?: string | null;
  assignedUserProfileId?: string | null;
  customerSelectedAt?: Date | null;
  createdAt: Date;
  selectedAvailabilityStatus?: string | null;
  earliestHoldExpiresAt?: Date | null;
};

export function isLiveAgentQueueCandidate(inquiry: {
  status: string;
  selectedEventPlanId?: string | null;
  humanHandoffReason?: string | null;
}): boolean {
  if (inquiry.status === INQUIRY_STATUSES.BOOKED) {
    return false;
  }
  return isCustomerSelectedPlanReason(inquiry.humanHandoffReason, inquiry.selectedEventPlanId);
}

export function liveAgentQueuePriority(inquiry: LiveAgentQueueInquiry, now = new Date()): number {
  if (inquiry.status === INQUIRY_STATUSES.BOOKED) {
    return 99;
  }
  const selected = isLiveAgentQueueCandidate(inquiry);
  if (selected && !inquiry.assignedUserProfileId) {
    return 0;
  }
  const availabilityIssue =
    inquiry.selectedAvailabilityStatus === PLAN_AVAILABILITY_STATUSES.NEEDS_ADJUSTMENT ||
    inquiry.selectedAvailabilityStatus === PLAN_AVAILABILITY_STATUSES.UNAVAILABLE ||
    inquiry.selectedAvailabilityStatus === PLAN_AVAILABILITY_STATUSES.AVAILABILITY_CHANGED;
  if (selected && availabilityIssue) {
    return 1;
  }
  if (selected && holdExpiresSoon(inquiry.earliestHoldExpiresAt, now)) {
    return 2;
  }
  if (selected) {
    return 3;
  }
  if (inquiry.status === INQUIRY_STATUSES.READY_FOR_HUMAN) {
    return 4;
  }
  return 5;
}

export function sortLiveAgentQueue<T extends LiveAgentQueueInquiry>(inquiries: T[]): T[] {
  return [...inquiries].sort((left, right) => {
    const createdDelta = right.createdAt.getTime() - left.createdAt.getTime();
    if (createdDelta !== 0) {
      return createdDelta;
    }
    return right.id.localeCompare(left.id);
  });
}

export const sortInquiriesNewestFirst = sortLiveAgentQueue;

/** Fields needed to mirror LiveAgentInquiryQueue section buckets. */
export type InquiryAttentionFields = {
  status: string;
  salesStage?: string | null;
  selectedEventPlanId?: string | null;
  humanHandoffReason?: string | null;
  bookings?: Array<{ status: string }> | null;
};

export function isPendingConfirmation(inquiry: InquiryAttentionFields): boolean {
  return (
    inquiry.salesStage === "DEPOSIT_PENDING" ||
    inquiry.bookings?.[0]?.status === "PENDING_PAYMENT"
  );
}

/**
 * Queue “Ready for Live Agent” candidates that are not pending payment.
 * Matches `selected` in LiveAgentInquiryQueue.
 */
export function isLiveAgentSelectedAttention(inquiry: InquiryAttentionFields): boolean {
  return isLiveAgentQueueCandidate(inquiry) && !isPendingConfirmation(inquiry);
}

/**
 * READY_FOR_HUMAN staff-review rows that are not live-agent candidates and not pending.
 * Matches `otherReady` in LiveAgentInquiryQueue.
 */
export function isOtherReadyForHumanAttention(inquiry: InquiryAttentionFields): boolean {
  return (
    inquiry.status === INQUIRY_STATUSES.READY_FOR_HUMAN &&
    !isLiveAgentQueueCandidate(inquiry) &&
    !isPendingConfirmation(inquiry)
  );
}

/** Actionable staff work excluding pending confirmation (selected + otherReady). */
export function isAwaitingStaffReview(inquiry: InquiryAttentionFields): boolean {
  return isLiveAgentSelectedAttention(inquiry) || isOtherReadyForHumanAttention(inquiry);
}

export function countInquiryAttention(inquiries: readonly InquiryAttentionFields[]): {
  pendingConfirmation: number;
  awaitingStaffReview: number;
} {
  let pendingConfirmation = 0;
  let awaitingStaffReview = 0;
  for (const inquiry of inquiries) {
    if (isPendingConfirmation(inquiry)) {
      pendingConfirmation += 1;
      continue;
    }
    if (isAwaitingStaffReview(inquiry)) {
      awaitingStaffReview += 1;
    }
  }
  return { pendingConfirmation, awaitingStaffReview };
}
