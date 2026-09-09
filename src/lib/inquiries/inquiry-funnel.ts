import { INQUIRY_STATUSES } from "@/types/inquiry";
import { EVENT_PLAN_TIER_TITLES, EVENT_PLAN_TIERS, type EventPlanTier } from "@/types/event-planner";

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
}): InquiryFunnelStage[] {
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

function selectedPlanFunnelLabel(tier?: string | null, title?: string | null): string {
  if (tier === EVENT_PLAN_TIERS.BEST_FIT) {
    return "Best Fit selected";
  }
  if (tier && tier in EVENT_PLAN_TIER_TITLES) {
    return `${EVENT_PLAN_TIER_TITLES[tier as EventPlanTier]} selected`;
  }
  if (title) {
    return `${title} selected`;
  }
  return "Customer selected plan";
}
