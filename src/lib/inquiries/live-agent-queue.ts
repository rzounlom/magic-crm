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

export function liveAgentQueuePriority(inquiry: LiveAgentQueueInquiry, now = new Date()): number {
  const selected = isCustomerSelectedPlanReason(inquiry.humanHandoffReason, inquiry.selectedEventPlanId);
  if (selected && !inquiry.assignedUserProfileId) {
    return 0;
  }
  const availabilityIssue =
    inquiry.selectedAvailabilityStatus === PLAN_AVAILABILITY_STATUSES.NEEDS_ADJUSTMENT ||
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

export function sortLiveAgentQueue<T extends LiveAgentQueueInquiry>(inquiries: T[], now = new Date()): T[] {
  return [...inquiries].sort((left, right) => {
    const priorityDelta = liveAgentQueuePriority(left, now) - liveAgentQueuePriority(right, now);
    if (priorityDelta !== 0) {
      return priorityDelta;
    }
    const leftWait = left.customerSelectedAt ?? left.createdAt;
    const rightWait = right.customerSelectedAt ?? right.createdAt;
    return leftWait.getTime() - rightWait.getTime();
  });
}
