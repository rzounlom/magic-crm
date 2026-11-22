import { INQUIRY_STATUSES } from "@/types/inquiry";
import { EVENT_PLAN_TIER_TITLES, type EventPlanTier } from "@/types/event-planner";

export type InquiryFunnelStage = {
  id: string;
  label: string;
  complete: boolean;
  at: Date | null;
};

export function inquiryFunnelStages(inquiry: {
  createdAt: Date;
  recommendationsGeneratedAt: Date | null;
  recommendationsViewedAt: Date | null;
  customerSelectedAt: Date | null;
  humanHandoffRequestedAt?: Date | null;
  status: string;
  selectedPlanTitle?: string | null;
  selectedPlanTier?: string | null;
  /** When true, use WordPress public-event funnel labels (no customer-selected / Live Agent stages). */
  isWpIntake?: boolean;
  /** Staff quote draft exists for this WP inquiry (presentation only). */
  hasStaffQuoteDraft?: boolean;
  staffQuoteApproved?: boolean;
}): InquiryFunnelStage[] {
  if (inquiry.isWpIntake) {
    return wpInquiryFunnelStages(inquiry);
  }
  const selected = Boolean(inquiry.customerSelectedAt);
  const selectedLabel = selectedPlanFunnelLabel(inquiry.selectedPlanTier, inquiry.selectedPlanTitle);
  return [
    { id: "submitted", label: "Inquiry submitted", complete: true, at: inquiry.createdAt },
    {
      id: "generated",
      label: "Recommendations generated",
      complete: Boolean(inquiry.recommendationsGeneratedAt),
      at: inquiry.recommendationsGeneratedAt,
    },
    {
      id: "viewed",
      label: "Personal Event Plan viewed",
      complete: Boolean(inquiry.recommendationsViewedAt),
      at: inquiry.recommendationsViewedAt,
    },
    { id: "selected", label: selectedLabel, complete: selected, at: inquiry.customerSelectedAt },
    {
      id: "ready",
      label: "Ready for Live Agent",
      complete: selected && inquiry.status === INQUIRY_STATUSES.READY_FOR_HUMAN,
      at: selected ? inquiry.humanHandoffRequestedAt ?? inquiry.customerSelectedAt : null,
    },
  ];
}

function wpInquiryFunnelStages(inquiry: {
  createdAt: Date;
  recommendationsGeneratedAt: Date | null;
  humanHandoffRequestedAt?: Date | null;
  status: string;
  hasStaffQuoteDraft?: boolean;
  staffQuoteApproved?: boolean;
}): InquiryFunnelStage[] {
  const estimateReady = Boolean(inquiry.recommendationsGeneratedAt);
  const reviewComplete =
    inquiry.status === INQUIRY_STATUSES.READY_FOR_HUMAN ||
    Boolean(inquiry.hasStaffQuoteDraft) ||
    Boolean(inquiry.staffQuoteApproved);
  const reviewLabel = inquiry.staffQuoteApproved
    ? "Staff quote approved (not emailed)"
    : inquiry.hasStaffQuoteDraft
      ? "Staff quote in progress"
      : "Awaiting staff review";
  return [
    { id: "submitted", label: "Inquiry submitted", complete: true, at: inquiry.createdAt },
    {
      id: "estimate",
      label: "Private estimate ready",
      complete: estimateReady,
      at: inquiry.recommendationsGeneratedAt,
    },
    {
      id: "review",
      label: reviewLabel,
      complete: reviewComplete,
      at: inquiry.humanHandoffRequestedAt ?? inquiry.recommendationsGeneratedAt,
    },
  ];
}

function selectedPlanFunnelLabel(tier?: string | null, title?: string | null): string {
  if (tier && tier in EVENT_PLAN_TIER_TITLES) {
    return `${EVENT_PLAN_TIER_TITLES[tier as EventPlanTier]} selected`;
  }
  if (title) {
    return `${title} selected`;
  }
  return "Customer selected plan";
}
