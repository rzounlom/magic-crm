import {
  CUSTOMER_SELECTED_PLAN_BANNER,
  formatReadyForHumanReason,
} from "@/lib/inquiries/ready-for-human-reason";

/**
 * Presentation-only workflow labels for the employee inquiry workspace.
 * Does not rewrite stored handoff reasons or selected-plan records.
 */
export function employeeInquiryStatusBanner(input: {
  isWpIntake: boolean;
  selectedEventPlanId: string | null | undefined;
  bookingNumber?: string | null;
}): { tone: "info" | "success" | "neutral"; title: string; detail?: string } | null {
  if (input.bookingNumber) {
    return null;
  }
  if (input.isWpIntake) {
    return {
      tone: "info",
      title: "Event inquiry — staff review required",
      detail:
        "Submitted through the public event request form. No public package, booking, or payment was created.",
    };
  }
  if (input.selectedEventPlanId) {
    return {
      tone: "success",
      title: CUSTOMER_SELECTED_PLAN_BANNER,
      detail: "Customer selected a plan in the legacy planner flow.",
    };
  }
  return null;
}

export function employeeReadyForHumanCopy(input: {
  isWpIntake: boolean;
  reason: string | null | undefined;
  selectedEventPlanId?: string | null;
}): string {
  if (input.isWpIntake) {
    // Avoid implying a customer already selected a bookable plan for WP intake.
    if (input.reason === "PUBLIC_EVENT_REQUEST" || !input.selectedEventPlanId) {
      return formatReadyForHumanReason(input.reason ?? "PUBLIC_EVENT_REQUEST", null);
    }
  }
  return formatReadyForHumanReason(input.reason, input.selectedEventPlanId);
}
