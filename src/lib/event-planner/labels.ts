import {
  BEVERAGE_PREFERENCE_LABELS,
  BUDGET_PREFERENCE_LABELS,
  type BeveragePreference,
  type BudgetPreference,
  FOOD_PREFERENCE_LABELS,
  type FoodPreference,
} from "@/lib/event-planner/intake-contract";
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
  if (value && value in FOOD_PREFERENCE_LABELS) {
    return FOOD_PREFERENCE_LABELS[value as FoodPreference];
  }
  if (value && value in DINING_PREFERENCE_LABELS) {
    return DINING_PREFERENCE_LABELS[value as keyof typeof DINING_PREFERENCE_LABELS];
  }
  return value || "—";
}

export function formatBeveragePreference(value: string | null | undefined): string {
  if (value && value in BEVERAGE_PREFERENCE_LABELS) {
    return BEVERAGE_PREFERENCE_LABELS[value as BeveragePreference];
  }
  return value || "—";
}

const CUSTOMER_DURATION_PHRASE = /\b(\d+)\s*(minutes?|mins?|hours?|hrs?)\b/gi;

/** Customer-facing length. Exact hours become "1 hour" / "2 hours". Other lengths stay in minutes, including 90. */
export function formatCustomerDurationMinutes(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return "";
  }
  const whole = Math.round(minutes);
  if (whole % 60 === 0) {
    const hours = whole / 60;
    return hours === 1 ? "1 hour" : `${hours} hours`;
  }
  return whole === 1 ? "1 minute" : `${whole} minutes`;
}

/** Presentation-only. Does not change stored product names, durations, or prices. */
export function formatCustomerDurationText(value: string): string {
  return value.replace(CUSTOMER_DURATION_PHRASE, (match, amount: string, unit: string) => {
    const count = Number(amount);
    if (!Number.isFinite(count)) {
      return match;
    }
    const minutes = /^h/i.test(unit) ? count * 60 : count;
    return formatCustomerDurationMinutes(minutes) || match;
  });
}

export function formatDurationMinutes(minutes: number): string {
  if (!minutes || minutes <= 0) {
    return "Duration to be confirmed";
  }
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours === 0) {
    return minutes === 1 ? "1 minute" : `${minutes} minutes`;
  }
  const hourLabel = hours === 1 ? "1 hour" : `${hours} hours`;
  if (remainder === 0) {
    return hourLabel;
  }
  const minuteLabel = remainder === 1 ? "1 minute" : `${remainder} minutes`;
  return `${hourLabel} ${minuteLabel}`;
}

/** Exact event span. A 5-hour itinerary is "5 hours", not the intake band "5+ hours". */
export function formatEventDuration(minutes: number | null | undefined): string {
  if (!minutes) {
    return "—";
  }
  return formatDurationMinutes(minutes);
}

/** Intake desired-duration bands, including "5+ hours". */
export function formatDesiredDuration(minutes: number | null | undefined): string {
  if (!minutes) {
    return "—";
  }
  if (minutes in EVENT_DURATION_LABELS) {
    return EVENT_DURATION_LABELS[minutes as EventDurationMinutes];
  }
  return formatDurationMinutes(minutes);
}

export function formatIntakeBudget(input: {
  budgetPreference?: string | null;
  budgetMin?: number | null;
  budgetMax?: number | null;
}): string {
  if (input.budgetPreference && input.budgetPreference in BUDGET_PREFERENCE_LABELS) {
    return BUDGET_PREFERENCE_LABELS[input.budgetPreference as BudgetPreference];
  }
  return formatBudgetRange(input.budgetMin, input.budgetMax);
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
