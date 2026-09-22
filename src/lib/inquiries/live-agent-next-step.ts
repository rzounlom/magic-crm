export const LIVE_AGENT_BOOKING_STEPS = [
  { id: "review", label: "Review" },
  { id: "availability", label: "Check Availability" },
  { id: "confirm", label: "Confirm Payment & Book" },
] as const;

export type LiveAgentBookingStepId = (typeof LIVE_AGENT_BOOKING_STEPS)[number]["id"];

export function liveAgentBookingSteps(): Array<{
  id: LiveAgentBookingStepId;
  label: string;
}> {
  return [...LIVE_AGENT_BOOKING_STEPS];
}

export function liveAgentHoldReadiness(input: {
  requirements: Array<{
    quantity: number | null;
    inventoryConfigured?: boolean;
    requiresStaffConfiguration?: boolean;
    resourceTypeId?: string | null;
  }>;
  validated: boolean;
  available: boolean;
}): { needsHold: boolean; canPlaceHold: boolean; needsInventory: boolean } {
  const needsInventory = input.requirements.some(
    (row) =>
      !row.inventoryConfigured ||
      row.requiresStaffConfiguration ||
      !row.resourceTypeId ||
      row.quantity == null,
  );
  return { needsHold: false, canPlaceHold: false, needsInventory };
}

export function liveAgentBookingGuide(input: {
  booked: boolean;
  assigned: boolean;
  needsHold?: boolean;
  hasHold: boolean;
  canPlaceHold?: boolean;
  needsInventory?: boolean;
  confirmBlockers: string[];
  pendingPayment?: boolean;
  paymentConflict?: boolean;
  availabilityChecked?: boolean;
  cancelled?: boolean;
}): {
  currentStepId: LiveAgentBookingStepId;
  nextTitle: string;
  nextDetail: string;
} {
  if (input.cancelled) {
    return {
      currentStepId: "confirm",
      nextTitle: "This booking was cancelled",
      nextDetail:
        "Historical booking information is kept. Archive the inquiry to remove it from the active queue.",
    };
  }
  if (input.booked) {
    return {
      currentStepId: "confirm",
      nextTitle: "This event is booked",
      nextDetail: "Open the booking for the confirmed record.",
    };
  }
  if (!input.assigned) {
    return {
      currentStepId: "review",
      nextTitle: "Start working",
      nextDetail: "Claim this inquiry to review the details and finish the booking.",
    };
  }
  if (input.needsInventory) {
    return {
      currentStepId: "availability",
      nextTitle: "Set up rooms and lanes",
      nextDetail: "Add numbered inventory in Resources before you can check availability or confirm.",
    };
  }
  if (input.paymentConflict) {
    return {
      currentStepId: "confirm",
      nextTitle: "Payment received — availability conflict",
      nextDetail:
        "Availability changed before this booking could be confirmed. The booking stays pending. Recheck times, then try Confirm Payment & Book again. Payment recovery is not handled in this phase.",
    };
  }
  if (input.confirmBlockers.length > 0) {
    return {
      currentStepId: "review",
      nextTitle: "Finish these items, then confirm",
      nextDetail: input.confirmBlockers[0] ?? "",
    };
  }
  if (!input.availabilityChecked) {
    return {
      currentStepId: "availability",
      nextTitle: "Check availability",
      nextDetail:
        "Check whether the required resources are free. Availability is not a guarantee — it will be rechecked when the booking is confirmed.",
    };
  }
  return {
    currentStepId: "confirm",
    nextTitle: input.pendingPayment ? "Confirm payment and booking" : "Confirm payment and booking",
    nextDetail:
      "Use this only after the required payment has been received outside MagicCRM. Availability will be rechecked when the booking is confirmed.",
  };
}
