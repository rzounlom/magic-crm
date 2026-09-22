import { INQUIRY_STATUSES } from "@/types/inquiry";
import type { EventPlanPayload } from "@/types/event-planner";

export type BookingHoldSnapshot = {
  status: string;
  expiresAt: Date | null;
  releasedAt: Date | null;
  startMinute: number;
  endMinute: number;
  resource: {
    resourceType: { id: string; name: string };
  };
};

export function bookingConfirmationBlockers(
  input: {
    inquiryStatus: string;
    workflowStage: string | null;
    readyToFinalizeAt: Date | null;
    selectedEventPlanId: string | null;
    assignedUserProfileId: string | null;
    workingPlan: {
      availabilityStatus: string | null;
      estimatedTotalCents: number | null;
      payload: EventPlanPayload;
    } | null;
    holds: BookingHoldSnapshot[];
    hasFiniteRequirements: boolean;
  },
  now = new Date(),
): string[] {
  const blockers: string[] = [];
  if (input.inquiryStatus === INQUIRY_STATUSES.BOOKED) {
    return blockers;
  }
  if (!input.selectedEventPlanId) {
    blockers.push("This inquiry does not have a customer-selected plan.");
  }
  if (!input.workingPlan && !input.selectedEventPlanId) {
    blockers.push("Select or save a proposal before confirming.");
  }
  const payload = input.workingPlan?.payload;
  if (payload && !payload.eventDate) {
    blockers.push("Choose an event date on the Current Agent Version.");
  }
  if (payload && !payload.startTime) {
    blockers.push("Choose a start time on the Current Agent Version.");
  }
  if (payload && (!payload.guestCount || payload.guestCount < 1)) {
    blockers.push("Enter a valid guest count.");
  }
  if (payload && payload.durationMinutes < 30) {
    blockers.push("Event duration must be at least 30 minutes.");
  }
  if (input.workingPlan && (input.workingPlan.estimatedTotalCents == null || input.workingPlan.estimatedTotalCents < 0)) {
    blockers.push("Pricing could not be calculated from sales knowledge.");
  }
  void input.hasFiniteRequirements;
  void input.holds;
  void now;
  return blockers;
}
