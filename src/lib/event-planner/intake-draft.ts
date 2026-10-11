import {
  emptyPlannerAnswers,
  INTAKE_GUEST_MIX_VALUES,
  type PlannerAnswers,
} from "@/lib/event-planner/intake-contract";
import { BUDGET_BAND_VALUES, PUBLIC_EVENT_LENGTH_OPTIONS } from "@/types/event-planner";

export const INTAKE_DRAFT_VERSION = 1 as const;
/** Keep preference drafts for a week; contact fields are never stored. */
export const INTAKE_DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

type DraftV1 = {
  v: typeof INTAKE_DRAFT_VERSION;
  organizationSlug: string;
  savedAt: number;
  answers: NonSensitivePlannerAnswers;
};

/** Event preferences only — never contact PII or free-text notes. */
export type NonSensitivePlannerAnswers = Pick<
  PlannerAnswers,
  | "eventType"
  | "guestCount"
  | "guestMix"
  | "attractionInterestIds"
  | "foodPreference"
  | "beveragePreference"
  | "privateSpacePreference"
  | "budgetBand"
  | "budgetPreference"
  | "desiredDurationMinutes"
  | "eventDate"
  | "startHour"
  | "startMinute"
  | "startPeriod"
>;

export function intakeDraftStorageKey(organizationSlug: string): string {
  return `magiccrm.intake.draft.v${INTAKE_DRAFT_VERSION}:${organizationSlug}`;
}

export function toNonSensitiveAnswers(answers: PlannerAnswers): NonSensitivePlannerAnswers {
  return {
    eventType: answers.eventType,
    guestCount: answers.guestCount,
    guestMix: answers.guestMix,
    attractionInterestIds: [...answers.attractionInterestIds],
    foodPreference: answers.foodPreference,
    beveragePreference: answers.beveragePreference,
    privateSpacePreference: answers.privateSpacePreference,
    budgetBand: answers.budgetBand,
    budgetPreference: answers.budgetPreference,
    desiredDurationMinutes: answers.desiredDurationMinutes,
    eventDate: answers.eventDate,
    startHour: answers.startHour,
    startMinute: answers.startMinute,
    startPeriod: answers.startPeriod,
  };
}

export function mergeDraftAnswers(
  draft: NonSensitivePlannerAnswers,
  catalogAttractionIds: ReadonlySet<string>,
): PlannerAnswers {
  const base = emptyPlannerAnswers();
  const guestMix = (INTAKE_GUEST_MIX_VALUES as readonly string[]).includes(draft.guestMix)
    ? draft.guestMix
    : "";
  const budgetBand = (BUDGET_BAND_VALUES as readonly string[]).includes(draft.budgetBand)
    ? draft.budgetBand
    : "";
  const lengthOk = PUBLIC_EVENT_LENGTH_OPTIONS.some((row) => row.value === draft.desiredDurationMinutes);
  const attractionInterestIds = draft.attractionInterestIds.filter((id) => catalogAttractionIds.has(id));

  return {
    ...base,
    eventType: typeof draft.eventType === "string" ? draft.eventType : "",
    guestCount: /^\d{0,3}$/.test(draft.guestCount) ? draft.guestCount : "",
    guestMix: guestMix as PlannerAnswers["guestMix"],
    attractionInterestIds,
    foodPreference: draft.foodPreference === "WANTS_FOOD" || draft.foodPreference === "NO_FOOD" ? draft.foodPreference : "",
    beveragePreference: "",
    privateSpacePreference:
      draft.privateSpacePreference === "YES" || draft.privateSpacePreference === "NO_PREFERENCE"
        ? draft.privateSpacePreference
        : "",
    budgetBand: budgetBand as PlannerAnswers["budgetBand"],
    budgetPreference: draft.budgetPreference === "FLEXIBLE" ? "FLEXIBLE" : "",
    desiredDurationMinutes: lengthOk ? draft.desiredDurationMinutes : "",
    eventDate: /^\d{4}-\d{2}-\d{2}$/.test(draft.eventDate) ? draft.eventDate : "",
    startHour: draft.startHour,
    startMinute: draft.startMinute,
    startPeriod: draft.startPeriod === "AM" || draft.startPeriod === "PM" ? draft.startPeriod : "",
  };
}

export function readIntakeDraft(
  organizationSlug: string,
  catalogAttractionIds: ReadonlySet<string>,
  storage: Pick<Storage, "getItem" | "removeItem"> | null = typeof window !== "undefined" ? window.localStorage : null,
): { answers: PlannerAnswers; restored: boolean } | null {
  if (!storage) {
    return null;
  }
  try {
    const raw = storage.getItem(intakeDraftStorageKey(organizationSlug));
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as DraftV1;
    if (parsed?.v !== INTAKE_DRAFT_VERSION || parsed.organizationSlug !== organizationSlug) {
      storage.removeItem(intakeDraftStorageKey(organizationSlug));
      return null;
    }
    if (!Number.isFinite(parsed.savedAt) || Date.now() - parsed.savedAt > INTAKE_DRAFT_MAX_AGE_MS) {
      storage.removeItem(intakeDraftStorageKey(organizationSlug));
      return null;
    }
    return {
      answers: mergeDraftAnswers(parsed.answers, catalogAttractionIds),
      restored: true,
    };
  } catch {
    try {
      storage.removeItem(intakeDraftStorageKey(organizationSlug));
    } catch {
      /* ignore */
    }
    return null;
  }
}

export function writeIntakeDraft(
  organizationSlug: string,
  answers: PlannerAnswers,
  storage: Pick<Storage, "setItem"> | null = typeof window !== "undefined" ? window.localStorage : null,
): void {
  if (!storage) {
    return;
  }
  const payload: DraftV1 = {
    v: INTAKE_DRAFT_VERSION,
    organizationSlug,
    savedAt: Date.now(),
    answers: toNonSensitiveAnswers(answers),
  };
  try {
    storage.setItem(intakeDraftStorageKey(organizationSlug), JSON.stringify(payload));
  } catch {
    /* quota / private mode */
  }
}

export function clearIntakeDraft(
  organizationSlug: string,
  storage: Pick<Storage, "removeItem"> | null = typeof window !== "undefined" ? window.localStorage : null,
): void {
  if (!storage) {
    return;
  }
  try {
    storage.removeItem(intakeDraftStorageKey(organizationSlug));
  } catch {
    /* ignore */
  }
}
