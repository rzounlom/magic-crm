import { deriveInquiryWorkflowStage } from "@/lib/inquiries/workflow-stage";
import { INQUIRY_STATUSES, INQUIRY_WORKFLOW_STAGES } from "@/types/inquiry";
import { PLAN_AVAILABILITY_STATUSES } from "@/types/resource-schedule";
import type { EventPlanPayload } from "@/types/event-planner";
import { RESOURCE_RESERVATION_STATUSES } from "@/types/resource-schedule";

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
  if (!input.workingPlan) {
    blockers.push("Start working to create a Current Agent Version before confirming.");
  }
  const stage = deriveInquiryWorkflowStage({
    workflowStage: input.workflowStage,
    selectedEventPlanId: input.selectedEventPlanId,
    assignedUserProfileId: input.assignedUserProfileId,
    readyToFinalizeAt: input.readyToFinalizeAt,
    hasActiveHold: input.holds.length > 0,
  });
  if (stage !== INQUIRY_WORKFLOW_STAGES.READY_TO_FINALIZE && !input.readyToFinalizeAt) {
    blockers.push("Mark this inquiry Ready to Finalize before confirming a booking.");
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
  if (
    input.workingPlan &&
    input.workingPlan.availabilityStatus !== PLAN_AVAILABILITY_STATUSES.AVAILABLE
  ) {
    blockers.push("Recheck resource availability. The working version is not currently available.");
  }
  const expired = input.holds.filter(
    (row) => row.expiresAt && row.expiresAt.getTime() <= now.getTime(),
  );
  if (expired.length > 0) {
    const name = expired[0]?.resource.resourceType.name ?? "A resource";
    blockers.push(`Cannot confirm booking: ${name} hold has expired. Recheck availability and place a new hold.`);
  }
  const activeHolds = input.holds.filter(
    (row) =>
      row.status === RESOURCE_RESERVATION_STATUSES.HOLD &&
      !row.releasedAt &&
      (!row.expiresAt || row.expiresAt.getTime() > now.getTime()),
  );
  if (input.hasFiniteRequirements && activeHolds.length === 0) {
    blockers.push("Place a resource hold for every required finite resource before confirming.");
  }
  return blockers;
}
