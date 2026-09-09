import { HOLD_EXPIRING_SOON_HOURS, INQUIRY_WORKFLOW_STAGES, type InquiryWorkflowStage } from "@/types/inquiry";

export function deriveInquiryWorkflowStage(input: {
  workflowStage?: string | null;
  selectedEventPlanId?: string | null;
  assignedUserProfileId?: string | null;
  readyToFinalizeAt?: Date | null;
  hasActiveHold?: boolean;
}): InquiryWorkflowStage | null {
  if (input.readyToFinalizeAt) {
    return INQUIRY_WORKFLOW_STAGES.READY_TO_FINALIZE;
  }
  if (input.workflowStage === INQUIRY_WORKFLOW_STAGES.READY_TO_FINALIZE) {
    return INQUIRY_WORKFLOW_STAGES.READY_TO_FINALIZE;
  }
  if (input.hasActiveHold) {
    return INQUIRY_WORKFLOW_STAGES.HOLD_PLACED;
  }
  if (input.workflowStage === INQUIRY_WORKFLOW_STAGES.HOLD_PLACED) {
    return INQUIRY_WORKFLOW_STAGES.HOLD_PLACED;
  }
  if (input.assignedUserProfileId) {
    return INQUIRY_WORKFLOW_STAGES.AGENT_WORKING;
  }
  if (input.selectedEventPlanId) {
    return INQUIRY_WORKFLOW_STAGES.READY_FOR_LIVE_AGENT;
  }
  return input.workflowStage && input.workflowStage in INQUIRY_WORKFLOW_STAGES
    ? (input.workflowStage as InquiryWorkflowStage)
    : null;
}

export function holdExpiresSoon(expiresAt: Date | null | undefined, now = new Date()): boolean {
  if (!expiresAt) {
    return false;
  }
  const remaining = expiresAt.getTime() - now.getTime();
  return remaining > 0 && remaining <= HOLD_EXPIRING_SOON_HOURS * 60 * 60 * 1000;
}

export function formatHoldTimeRemaining(expiresAt: Date | null | undefined, now = new Date()): string | null {
  if (!expiresAt) {
    return null;
  }
  const remaining = expiresAt.getTime() - now.getTime();
  if (remaining <= 0) {
    return "Expired";
  }
  const hours = Math.floor(remaining / (60 * 60 * 1000));
  const minutes = Math.floor((remaining % (60 * 60 * 1000)) / 60_000);
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    return `${days} day${days === 1 ? "" : "s"} remaining`;
  }
  if (hours > 0) {
    return `${hours} hour${hours === 1 ? "" : "s"} remaining`;
  }
  return `${minutes} minute${minutes === 1 ? "" : "s"} remaining`;
}

export function employeeDisplayName(user: {
  firstName?: string | null;
  lastName?: string | null;
  displayName?: string | null;
  email?: string | null;
} | null | undefined): string {
  if (!user) {
    return "Unassigned";
  }
  if (user.displayName?.trim()) {
    return user.displayName.trim();
  }
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  return name || user.email?.trim() || "Agent";
}
