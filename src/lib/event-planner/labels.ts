import {
  BUDGET_BAND_CENTS,
  BUDGET_BAND_LABELS,
  type BudgetBand,
  DINING_PREFERENCE_LABELS,
  EVENT_DURATION_LABELS,
  type EventDurationMinutes,
  GUEST_MIX_LABELS,
  type GuestMix,
  SPACE_PREFERENCE_LABELS,
  type SpacePreference,
} from "@/types/event-planner";

export function formatGuestMix(value: string | null | undefined): string {
  if (value && value in GUEST_MIX_LABELS) {
    return GUEST_MIX_LABELS[value as GuestMix];
  }
  return value || "—";
}

export function formatSpacePreference(value: string | null | undefined): string {
  if (value && value in SPACE_PREFERENCE_LABELS) {
    return SPACE_PREFERENCE_LABELS[value as SpacePreference];
  }
  return value || "—";
}

export function formatDiningPreference(value: string | null | undefined): string {
  if (value && value in DINING_PREFERENCE_LABELS) {
    return DINING_PREFERENCE_LABELS[value as keyof typeof DINING_PREFERENCE_LABELS];
  }
  return value || "—";
}

export function formatEventDuration(minutes: number | null | undefined): string {
  if (minutes && minutes in EVENT_DURATION_LABELS) {
    return EVENT_DURATION_LABELS[minutes as EventDurationMinutes];
  }
  if (!minutes) {
    return "—";
  }
  return `${Math.round(minutes / 60)} hours`;
}

export function formatBudgetRange(
  budgetMin: number | null | undefined,
  budgetMax: number | null | undefined,
): string {
  const band = (Object.entries(BUDGET_BAND_CENTS) as [BudgetBand, { min: number; max: number | null }][]).find(
    ([, range]) => range.min === budgetMin && range.max === budgetMax,
  );
  if (band) {
    return BUDGET_BAND_LABELS[band[0]];
  }
  if (budgetMin != null && budgetMax != null) {
    return `$${(budgetMin / 100).toLocaleString()}–$${(budgetMax / 100).toLocaleString()}`;
  }
  if (budgetMin != null) {
    return `$${(budgetMin / 100).toLocaleString()}+`;
  }
  return "—";
}

export function personalEventPlannerTitle(organizationName: string): string {
  return `${organizationName} Personal Event Planner`;
}
