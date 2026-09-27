import { usPhoneDigits } from "@/lib/inquiries/public-phone";
import { PUBLIC_INTAKE_LIMITS } from "@/types/inquiry";
import { BUDGET_BAND_LABELS, EVENT_TYPE_OPTIONS, type BudgetBand } from "@/types/event-planner";

export const PLANNER_STEPS = [
  "event",
  "guests",
  "mix",
  "attractions",
  "food",
  "space",
  "budget",
  "when",
  "contact",
  "review",
] as const;

export type PlannerStep = (typeof PLANNER_STEPS)[number];

export const PLANNER_STEP_TITLES: Record<PlannerStep, string> = {
  event: "What are you planning?",
  guests: "How many guests are you planning for?",
  mix: "Who's coming?",
  attractions: "What would your group like to do?",
  food: "Would you like food included?",
  space: "Would you like a private event space?",
  budget: "What budget should we plan around?",
  when: "When would you like to start?",
  contact: "How can we reach you?",
  review: "Review your event",
};

export const FOOD_PREFERENCE_VALUES = ["WANTS_FOOD", "NO_FOOD"] as const;
export type FoodPreference = (typeof FOOD_PREFERENCE_VALUES)[number];

export const FOOD_PREFERENCE_LABELS: Record<FoodPreference, string> = {
  WANTS_FOOD: "Yes",
  NO_FOOD: "No",
};

export const BEVERAGE_PREFERENCE_VALUES = ["YES", "NO", "NOT_SURE"] as const;
export type BeveragePreference = (typeof BEVERAGE_PREFERENCE_VALUES)[number];

export const BEVERAGE_PREFERENCE_LABELS: Record<BeveragePreference, string> = {
  YES: "Yes",
  NO: "No",
  NOT_SURE: "Not sure",
};

export const PRIVATE_SPACE_PREFERENCE_VALUES = ["YES", "NO_PREFERENCE"] as const;
export type PrivateSpacePreference = (typeof PRIVATE_SPACE_PREFERENCE_VALUES)[number];

export const PRIVATE_SPACE_PREFERENCE_LABELS: Record<PrivateSpacePreference, string> = {
  YES: "Yes",
  NO_PREFERENCE: "No preference",
};

export const BUDGET_PREFERENCE_VALUES = [
  "VALUE",
  "PER_GUEST_25_35",
  "PER_GUEST_45_55",
  "PER_GUEST_55_PLUS",
  "FLEXIBLE",
] as const;
export type BudgetPreference = (typeof BUDGET_PREFERENCE_VALUES)[number];

export const BUDGET_PREFERENCE_LABELS: Record<BudgetPreference, string> = {
  VALUE: "Value focused",
  PER_GUEST_25_35: "Around $25–$35 per guest",
  PER_GUEST_45_55: "Around $45–$55 per guest",
  PER_GUEST_55_PLUS: "$55+ per guest",
  FLEXIBLE: "Flexible / show me options",
};

/** Per-guest cents used only so the current proposal engine still has a budget signal. */
const PER_GUEST_CENTS: Record<Exclude<BudgetPreference, "FLEXIBLE">, { min: number; max: number | null }> = {
  VALUE: { min: 1_500, max: 2_500 },
  PER_GUEST_25_35: { min: 2_500, max: 3_500 },
  PER_GUEST_45_55: { min: 4_500, max: 5_500 },
  PER_GUEST_55_PLUS: { min: 5_500, max: null },
};

export const INTAKE_GUEST_MIX_VALUES = ["mostly_children", "mostly_adults", "mixed_ages"] as const;
export type IntakeGuestMix = (typeof INTAKE_GUEST_MIX_VALUES)[number];

export const INTAKE_GUEST_MIX_LABELS: Record<IntakeGuestMix, string> = {
  mostly_children: "Mostly Kids / Youth",
  mostly_adults: "Mostly Adults",
  mixed_ages: "Mix of Kids & Adults",
};

export type PlannerAnswers = {
  eventType: string;
  guestCount: string;
  guestMix: IntakeGuestMix | "";
  attractionInterestIds: string[];
  foodPreference: FoodPreference | "";
  /** Retained so older in-progress state and legacy rows still parse. Not a planner step. */
  beveragePreference: BeveragePreference | "";
  privateSpacePreference: PrivateSpacePreference | "";
  budgetBand: BudgetBand | "";
  budgetPreference: BudgetPreference | "";
  eventDate: string;
  startHour: string;
  startMinute: string;
  startPeriod: "AM" | "PM" | "";
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  customerGroupName: string;
  notes: string;
};

export function emptyPlannerAnswers(): PlannerAnswers {
  return {
    eventType: "",
    guestCount: "",
    guestMix: "",
    attractionInterestIds: [],
    foodPreference: "",
    beveragePreference: "",
    privateSpacePreference: "",
    budgetBand: "",
    budgetPreference: "",
    eventDate: "",
    startHour: "",
    startMinute: "",
    startPeriod: "",
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    customerGroupName: "",
    notes: "",
  };
}

export type PlannerState = {
  step: PlannerStep;
  answers: PlannerAnswers;
};

export function initialPlannerState(): PlannerState {
  return { step: "event", answers: emptyPlannerAnswers() };
}

export type PlannerAction =
  | { type: "edit"; patch: Partial<PlannerAnswers> }
  | { type: "toggleAttraction"; id: string }
  | { type: "next" }
  | { type: "back" }
  | { type: "go"; step: PlannerStep }
  | { type: "startOver" };

export function plannerStepError(step: PlannerStep, answers: PlannerAnswers): string | null {
  switch (step) {
    case "event":
      return answers.eventType ? null : "Choose an event type.";
    case "guests": {
      const raw = answers.guestCount.trim();
      if (!/^\d+$/.test(raw)) {
        return "Enter a whole number of guests.";
      }
      const count = Number(raw);
      if (!Number.isInteger(count) || count < 1) {
        return "Enter a guest count greater than 0.";
      }
      if (count > PUBLIC_INTAKE_LIMITS.guestCount) {
        return "Guest count is too large.";
      }
      return null;
    }
    case "mix":
      return answers.guestMix ? null : "Choose who's coming.";
    case "attractions":
      return null;
    case "food":
      return answers.foodPreference ? null : "Choose whether to include food.";
    case "space":
      return answers.privateSpacePreference ? null : "Choose a space preference.";
    case "budget":
      return answers.budgetBand || answers.budgetPreference === "FLEXIBLE"
        ? null
        : "Choose a total event budget.";
    case "when":
      if (!/^\d{4}-\d{2}-\d{2}$/.test(answers.eventDate)) {
        return "Choose a valid date.";
      }
      if (!to24HourTime(answers.startHour, answers.startMinute, answers.startPeriod)) {
        return "Choose a start time.";
      }
      return null;
    case "contact":
      return Object.values(contactFieldErrors(answers))[0] ?? null;
    case "review":
      return null;
    default:
      return null;
  }
}

export function contactFieldErrors(answers: PlannerAnswers): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!answers.firstName.trim()) {
    errors.firstName = "Enter a first name.";
  }
  if (!answers.lastName.trim()) {
    errors.lastName = "Enter a last name.";
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(answers.email.trim())) {
    errors.email = "Enter a valid email address.";
  }
  const phone = optionalPhoneError(answers.phone);
  if (phone) {
    errors.phone = phone;
  }
  return errors;
}

function optionalPhoneError(phone: string): string | null {
  const trimmed = phone.trim();
  if (!trimmed) {
    return null;
  }
  const withoutFormatting = trimmed.replace(/[\s().+-]/g, "");
  if (!/^\d+$/.test(withoutFormatting) || usPhoneDigits(trimmed).length !== 10) {
    return "Enter a 10-digit phone number.";
  }
  return null;
}

export function reducePlanner(state: PlannerState, action: PlannerAction): PlannerState {
  switch (action.type) {
    case "edit":
      return { ...state, answers: { ...state.answers, ...action.patch } };
    case "toggleAttraction": {
      const selected = state.answers.attractionInterestIds.includes(action.id);
      return {
        ...state,
        answers: {
          ...state.answers,
          attractionInterestIds: selected
            ? state.answers.attractionInterestIds.filter((id) => id !== action.id)
            : [...state.answers.attractionInterestIds, action.id],
        },
      };
    }
    case "next": {
      if (plannerStepError(state.step, state.answers)) {
        return state;
      }
      const index = PLANNER_STEPS.indexOf(state.step);
      const next = PLANNER_STEPS[Math.min(index + 1, PLANNER_STEPS.length - 1)] ?? state.step;
      return { ...state, step: next };
    }
    case "back": {
      const index = PLANNER_STEPS.indexOf(state.step);
      const previous = PLANNER_STEPS[Math.max(index - 1, 0)] ?? state.step;
      return { ...state, step: previous };
    }
    case "go":
      return { ...state, step: action.step };
    case "startOver":
      return initialPlannerState();
    default:
      return state;
  }
}

export function to24HourTime(hour: string, minute: string, period: string): string | null {
  const hourNumber = Number(hour);
  const minuteNumber = Number(minute);
  if (!Number.isInteger(hourNumber) || hourNumber < 1 || hourNumber > 12) {
    return null;
  }
  if (!Number.isInteger(minuteNumber) || minuteNumber < 0 || minuteNumber > 59) {
    return null;
  }
  if (period !== "AM" && period !== "PM") {
    return null;
  }
  let hours = hourNumber % 12;
  if (period === "PM") {
    hours += 12;
  }
  return `${String(hours).padStart(2, "0")}:${String(minuteNumber).padStart(2, "0")}`;
}

export function formatPreferredDate(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) {
    return isoDate;
  }
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function formatPreferredDateTime(answers: Pick<PlannerAnswers, "eventDate" | "startHour" | "startMinute" | "startPeriod">): string {
  const clock = to24HourTime(answers.startHour, answers.startMinute, answers.startPeriod);
  const timeLabel =
    answers.startHour && answers.startMinute && answers.startPeriod
      ? `${Number(answers.startHour)}:${answers.startMinute.padStart(2, "0")} ${answers.startPeriod}`
      : format12HourClock(clock);
  const dateLabel = formatPreferredDate(answers.eventDate);
  if (dateLabel && timeLabel) {
    return `${dateLabel} at ${timeLabel}`;
  }
  return dateLabel || timeLabel;
}

export function plannerAnswersToIntakeRecord(answers: PlannerAnswers, submissionId: string) {
  return {
    firstName: answers.firstName.trim(),
    lastName: answers.lastName.trim(),
    customerGroupName: answers.customerGroupName.trim(),
    email: answers.email.trim(),
    phone: answers.phone.trim(),
    eventType: answers.eventType,
    preferredDate: answers.eventDate,
    startTime: to24HourTime(answers.startHour, answers.startMinute, answers.startPeriod) ?? "",
    guestCount: answers.guestCount,
    guestMix: answers.guestMix,
    foodPreference: answers.foodPreference,
    privateSpacePreference: answers.privateSpacePreference,
    budgetBand: answers.budgetBand,
    budgetPreference: answers.budgetPreference === "FLEXIBLE" ? "FLEXIBLE" : "",
    attractionInterestIds: answers.attractionInterestIds,
    notes: answers.notes.trim(),
    submissionId,
  };
}

export function format12HourClock(value: string | null | undefined): string {
  const match = /^([01]\d|2[0-3]):([0-5]\d)/.exec(value ?? "");
  if (!match) {
    return "";
  }
  const hours = Number(match[1]);
  const minutes = match[2];
  const period = hours >= 12 ? "PM" : "AM";
  const hour12 = hours % 12 || 12;
  return `${hour12}:${minutes} ${period}`;
}

export function intakeBudgetLabel(answers: Pick<PlannerAnswers, "budgetBand" | "budgetPreference">): string {
  if (answers.budgetBand) {
    return BUDGET_BAND_LABELS[answers.budgetBand];
  }
  if (answers.budgetPreference === "FLEXIBLE") {
    return BUDGET_PREFERENCE_LABELS.FLEXIBLE;
  }
  return "";
}

export function budgetCentsForPreference(
  preference: BudgetPreference,
  guestCount: number,
): { min: number | null; max: number | null } {
  if (preference === "FLEXIBLE") {
    return { min: null, max: null };
  }
  const band = PER_GUEST_CENTS[preference];
  return {
    min: band.min * guestCount,
    max: band.max == null ? null : band.max * guestCount,
  };
}

export function spacePreferenceFromIntake(preference: PrivateSpacePreference): "private" | "no_preference" {
  return preference === "YES" ? "private" : "no_preference";
}

/** Maps stored food preferences onto the values the current proposal engine already understands. */
export function engineDiningPreference(stored: string | null | undefined): string | null {
  if (stored === "NO_FOOD") {
    return "none";
  }
  if (stored === "WANTS_FOOD") {
    return "not_sure";
  }
  return stored ?? null;
}

export function publicEventTypeOptions(): readonly string[] {
  return EVENT_TYPE_OPTIONS;
}
