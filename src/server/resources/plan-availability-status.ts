import {
  PLAN_AVAILABILITY_STATUSES,
  type PlanAvailabilityStatus,
  type ResourceAvailabilityResult,
} from "@/types/resource-schedule";

export function planAvailabilityStatusFromCheck(input: {
  previouslyValidated: boolean;
  result: ResourceAvailabilityResult;
}): PlanAvailabilityStatus {
  if (input.result.validated && input.result.available) {
    return PLAN_AVAILABILITY_STATUSES.AVAILABLE;
  }

  const incomplete =
    input.result.types.length === 0 ||
    input.result.types.some(
      (row) =>
        !row.inventoryConfigured || row.requiresStaffConfiguration || row.requestedQuantity == null,
    );
  const configuredConflict = input.result.types.some(
    (row) => row.inventoryConfigured && row.conflict,
  );

  if (incomplete && !configuredConflict) {
    return PLAN_AVAILABILITY_STATUSES.NOT_VALIDATED;
  }
  if (input.previouslyValidated) {
    return PLAN_AVAILABILITY_STATUSES.AVAILABILITY_CHANGED;
  }
  return PLAN_AVAILABILITY_STATUSES.NEEDS_ADJUSTMENT;
}

export function formatRequirementRule(input: {
  quantityRule: string;
  quantity: number | null;
  guestsPerUnit: number | null;
  requiresStaffConfiguration: boolean;
}): string {
  if (input.requiresStaffConfiguration && input.quantityRule === "UNKNOWN") {
    return "Resource configuration required";
  }
  if (input.quantityRule === "PER_GUESTS" && input.guestsPerUnit) {
    return `1 per ${input.guestsPerUnit} guests`;
  }
  if (input.quantityRule === "FIXED") {
    return `${input.quantity ?? 1} required`;
  }
  return "Resource configuration required";
}
