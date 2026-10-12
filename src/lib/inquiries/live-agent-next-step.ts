export const LIVE_AGENT_BOOKING_STEPS = [
  { id: "review", label: "Review" },
  { id: "availability", label: "Check Availability" },
  { id: "hold", label: "HOLD (optional)" },
  { id: "confirm", label: "Confirm booking" },
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
  hasActiveHold?: boolean;
  /** When provided by server HOLD readiness, prefer that over client-side availability alone. */
  serverHoldAttemptAllowed?: boolean | null;
}): { needsHold: boolean; canPlaceHold: boolean; needsInventory: boolean } {
  const needsInventory = input.requirements.some(
    (row) =>
      row.quantity != null &&
      row.quantity > 0 &&
      (!row.inventoryConfigured ||
        row.requiresStaffConfiguration ||
        !row.resourceTypeId),
  );
  const hasFiniteRequirements = input.requirements.some(
    (row) => row.quantity != null && row.quantity > 0,
  );
  const needsHold = hasFiniteRequirements && !input.hasActiveHold;
  const canPlaceHold =
    needsHold &&
    !needsInventory &&
    (input.serverHoldAttemptAllowed === true ||
      (input.serverHoldAttemptAllowed == null && input.validated && input.available));
  return { needsHold, canPlaceHold, needsInventory };
}

export type LiveAgentBookingGuideInput = {
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
  /** Server-derived: confirmation may be attempted (still revalidated transactionally). */
  confirmAttemptAllowed?: boolean;
};

export type LiveAgentStepStatus = "complete" | "current" | "upcoming" | "optional";

export type LiveAgentBookingStepState = {
  id: LiveAgentBookingStepId;
  label: string;
  status: LiveAgentStepStatus;
  href?: string;
};

/**
 * Presentation-only step strip for the Booking Coach.
 * Does not authorize HOLD or confirmation — readiness services remain authoritative.
 */
export function liveAgentBookingStepStates(input: LiveAgentBookingGuideInput): LiveAgentBookingStepState[] {
  const guide = liveAgentBookingGuide(input);
  const order = LIVE_AGENT_BOOKING_STEPS.map((step) => step.id);
  const currentIndex = Math.max(0, order.indexOf(guide.currentStepId));

  return LIVE_AGENT_BOOKING_STEPS.map((step, index) => {
    let status: LiveAgentStepStatus = "upcoming";
    if (step.id === guide.currentStepId) {
      status = "current";
    } else if (index < currentIndex) {
      status = "complete";
    }

    // Optional HOLD: when past the hold step without an active HOLD, mark optional — never force it.
    if (
      step.id === "hold" &&
      status === "complete" &&
      !input.hasHold &&
      (guide.currentStepId === "confirm" || input.booked || input.cancelled)
    ) {
      status = "optional";
    }

    const href =
      step.id === "hold"
        ? "#hold-readiness"
        : step.id === "confirm"
          ? "#confirmation-readiness"
          : step.id === "availability"
            ? "#availability-resources"
            : undefined;

    return { id: step.id, label: step.label, status, href };
  });
}

export function liveAgentBookingGuide(input: LiveAgentBookingGuideInput): {
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
      nextDetail: "Open the booking for the confirmed record, or view it on the Master Schedule.",
    };
  }
  if (!input.assigned) {
    return {
      currentStepId: "review",
      nextTitle: "Start working",
      nextDetail:
        input.canPlaceHold
          ? "Claim this inquiry to edit the working plan and confirm. An optional proposal HOLD can still be placed from HOLD readiness without claiming."
          : "Claim this inquiry to review the details, check availability, and finish the booking. Confirmation requires an assigned agent.",
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
      nextTitle: "Pending confirmation — availability conflict",
      nextDetail:
        "Availability changed before this booking could be confirmed. The booking stays pending. Recheck times, then try Confirm booking again. MagicCRM does not collect or recover payment.",
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
  if (input.needsHold && !input.hasHold) {
    return {
      currentStepId: "hold",
      nextTitle: "Place an optional HOLD, or confirm",
      nextDetail: input.canPlaceHold
        ? "A temporary proposal HOLD can reserve rooms and lanes for 24 hours. Confirmation does not require a HOLD — it rechecks availability and allocates resources when you confirm."
        : "Review HOLD readiness below if you need a temporary reservation. You can also confirm without a HOLD when confirmation readiness allows it.",
    };
  }
  if (input.hasHold) {
    return {
      currentStepId: "confirm",
      nextTitle: "Resources held — confirm booking",
      nextDetail:
        "An active HOLD is in place. Confirm when ready; matching HOLD rows convert to booked occupancy. MagicCRM does not process payment.",
    };
  }
  return {
    currentStepId: "confirm",
    nextTitle: input.pendingPayment ? "Confirm booking" : "Confirm booking",
    nextDetail:
      input.confirmAttemptAllowed === false
        ? "Review confirmation readiness below for blocking reasons or an authorized hours exception before confirming."
        : "Confirm when ready. Availability will be rechecked and resources allocated. MagicCRM does not process payment.",
  };
}
