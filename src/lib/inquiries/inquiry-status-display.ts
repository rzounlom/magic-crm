import { INQUIRY_STATUSES, type InquiryStatus } from "@/types/inquiry";

const INQUIRY_STATUS_LABELS: Record<InquiryStatus, string> = {
  [INQUIRY_STATUSES.NEW]: "New",
  [INQUIRY_STATUSES.AI_ENGAGED]: "AI handling",
  [INQUIRY_STATUSES.AWAITING_CUSTOMER]: "Awaiting customer",
  [INQUIRY_STATUSES.NEEDS_FOLLOW_UP]: "Needs follow-up",
  [INQUIRY_STATUSES.READY_FOR_HUMAN]: "Ready for live agent",
  [INQUIRY_STATUSES.DECLINED]: "Declined",
  [INQUIRY_STATUSES.BOOKED]: "Booked",
};

export function formatInquiryStatus(status: string): string {
  if (status in INQUIRY_STATUS_LABELS) {
    return INQUIRY_STATUS_LABELS[status as InquiryStatus];
  }
  return status
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function formatInquiryEmployeeStatus(status: string, aiHandlingEnabled: boolean): string {
  const label = formatInquiryStatus(status);
  if (status === INQUIRY_STATUSES.READY_FOR_HUMAN && !aiHandlingEnabled) {
    return label;
  }
  if (!aiHandlingEnabled) {
    return `${label} · Live agent`;
  }
  return label;
}
