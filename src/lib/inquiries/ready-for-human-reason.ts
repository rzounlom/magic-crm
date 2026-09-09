export const READY_FOR_HUMAN_REASONS = {
  CUSTOMER_SELECTED_PLAN: "CUSTOMER_SELECTED_PLAN",
  AVAILABILITY_NEEDS_ADJUSTMENT: "AVAILABILITY_NEEDS_ADJUSTMENT",
  NO_FEASIBLE_PLAN: "NO_FEASIBLE_PLAN",
  GENERATION_FAILED: "GENERATION_FAILED",
  STAFF_ASSISTANCE: "STAFF_ASSISTANCE",
  MANUAL_ESCALATION: "MANUAL_ESCALATION",
} as const;

export type ReadyForHumanReason =
  (typeof READY_FOR_HUMAN_REASONS)[keyof typeof READY_FOR_HUMAN_REASONS];

export const CUSTOMER_SELECTED_PLAN_BANNER = "CUSTOMER SELECTED PLAN — READY TO BOOK";

const READY_FOR_HUMAN_LABELS: Record<ReadyForHumanReason, string> = {
  [READY_FOR_HUMAN_REASONS.CUSTOMER_SELECTED_PLAN]: "Customer selected plan — ready to book",
  [READY_FOR_HUMAN_REASONS.AVAILABILITY_NEEDS_ADJUSTMENT]:
    "Customer selected a plan, but availability needs adjustment before booking.",
  [READY_FOR_HUMAN_REASONS.NO_FEASIBLE_PLAN]:
    "No feasible event plan could be generated from current sales knowledge. A team member should follow up.",
  [READY_FOR_HUMAN_REASONS.GENERATION_FAILED]:
    "Personal Event Planner could not finish recommendations. A team member should follow up.",
  [READY_FOR_HUMAN_REASONS.STAFF_ASSISTANCE]: "Customer needs staff assistance.",
  [READY_FOR_HUMAN_REASONS.MANUAL_ESCALATION]: "Employee took over.",
};

export function formatReadyForHumanReason(
  reason: string | null | undefined,
  selectedEventPlanId?: string | null,
): string {
  if (selectedEventPlanId) {
    return READY_FOR_HUMAN_LABELS[READY_FOR_HUMAN_REASONS.CUSTOMER_SELECTED_PLAN];
  }
  if (reason && reason in READY_FOR_HUMAN_LABELS) {
    return READY_FOR_HUMAN_LABELS[reason as ReadyForHumanReason];
  }
  return reason || "";
}

export function isCustomerSelectedPlanReason(
  reason: string | null | undefined,
  selectedEventPlanId?: string | null,
): boolean {
  return Boolean(selectedEventPlanId) || reason === READY_FOR_HUMAN_REASONS.CUSTOMER_SELECTED_PLAN;
}
