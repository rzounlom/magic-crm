export const LIVE_AGENT_BOOKING_STEPS = [
  { id: "review", label: "Review" },
  { id: "hold", label: "Hold" },
  { id: "finalize", label: "Finalize" },
  { id: "confirm", label: "Confirm" },
] as const;

export type LiveAgentBookingStepId = (typeof LIVE_AGENT_BOOKING_STEPS)[number]["id"];

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
  const needsHold = input.requirements.some((row) => row.quantity == null || row.quantity > 0);
  const needsInventory = input.requirements.some(
    (row) =>
      !row.inventoryConfigured ||
      row.requiresStaffConfiguration ||
      !row.resourceTypeId ||
      row.quantity == null,
  );
  const canPlaceHold =
    needsHold &&
    !needsInventory &&
    input.validated &&
    input.available &&
    input.requirements.every((row) => row.quantity != null);
  return { needsHold, canPlaceHold, needsInventory };
}

export function liveAgentBookingGuide(input: {
  booked: boolean;
  assigned: boolean;
  needsHold?: boolean;
  hasHold: boolean;
  canPlaceHold?: boolean;
  needsInventory?: boolean;
  readyToFinalize: boolean;
  confirmBlockers: string[];
}): {
  currentStepId: LiveAgentBookingStepId;
  nextTitle: string;
  nextDetail: string;
} {
  const needsHold = input.needsHold ?? true;
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
      nextDetail: "Claim this inquiry to edit the plan and book it.",
    };
  }
  if (needsHold && !input.hasHold) {
    if (input.needsInventory) {
      return {
        currentStepId: "hold",
        nextTitle: "Set up rooms and lanes",
        nextDetail: "Add numbered inventory in Resources. Then you can hold them here and confirm.",
      };
    }
    if (input.canPlaceHold) {
      return {
        currentStepId: "hold",
        nextTitle: "Hold rooms and lanes",
        nextDetail: "Reserve them now. Next you will mark ready to finalize, then confirm.",
      };
    }
    return {
      currentStepId: "hold",
      nextTitle: "Hold rooms and lanes",
      nextDetail: "These rooms or lanes are not free at this time. Change the plan or pick another slot.",
    };
  }
  if (!input.readyToFinalize) {
    return {
      currentStepId: "finalize",
      nextTitle: "Mark ready to finalize",
      nextDetail: "Resources are set. Mark ready, then confirm the booking.",
    };
  }
  if (input.confirmBlockers.length > 0) {
    return {
      currentStepId: "confirm",
      nextTitle: "Finish these items, then confirm",
      nextDetail: input.confirmBlockers[0] ?? "",
    };
  }
  return {
    currentStepId: "confirm",
    nextTitle: "Confirm this booking",
    nextDetail: "Creates the booking and converts holds to booked. No payment or email is sent.",
  };
}
