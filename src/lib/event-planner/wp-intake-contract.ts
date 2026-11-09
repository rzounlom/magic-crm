/**
 * WordPress Event Planner 3.3.0 public intake field contract.
 * Maps plugin form answers onto MagicCRM Inquiry columns + message metadata.
 * Generations attraction keys are the default tenant rule-pack labels — not a runtime tenant special-case.
 */

export const WP_INTAKE_VERSION = "wp-3.3.0" as const;

export const WP_ATTRACTION_KEYS = [
  "bowling",
  "axe",
  "laser",
  "golf",
  "climbing",
  "arcade",
] as const;

export type WpAttractionKey = (typeof WP_ATTRACTION_KEYS)[number];

export const WP_ATTRACTION_LABELS: Record<WpAttractionKey, string> = {
  bowling: "Bowling",
  axe: "Axe Throwing",
  laser: "Laser Tag",
  golf: "Mini Golf",
  climbing: "Climbing",
  arcade: "Arcade",
};

export const WP_ATTRACTION_ANSWERS = ["yes", "no", "open"] as const;
export type WpAttractionAnswer = (typeof WP_ATTRACTION_ANSWERS)[number];

export const WP_ATTRACTION_ANSWER_LABELS: Record<WpAttractionAnswer, string> = {
  yes: "Yes",
  no: "No",
  open: "Open to recommendations",
};

export const WP_EVENT_TYPES = [
  "Birthday",
  "Corporate or Team Event",
  "Sports Team",
  "School or Youth Group",
  "Family or Social Gathering",
  "Other",
] as const;

export type WpEventType = (typeof WP_EVENT_TYPES)[number];

export const WP_DURATION_OPTIONS = ["2 hours", "3 hours", "Other"] as const;
export type WpDurationOption = (typeof WP_DURATION_OPTIONS)[number];

export const WP_YES_NO = ["yes", "no"] as const;
export type WpYesNo = (typeof WP_YES_NO)[number];

export const WP_INTAKE_LIMITS = {
  name: 200,
  company: 200,
  phone: 32,
  email: 254,
  dates: 5,
  adults: 999,
  children: 999,
  guestsCombinedMin: 1,
  guestsCombinedMax: 999,
  otherHoursMax: 24,
  budgetMaxDollars: 10_000_000,
  description: 4000,
  comments: 8000,
  referral: 200,
  /** Inquiry.customerNotes / occasion column caps in MagicCRM. */
  notesColumn: 2000,
  occasionColumn: 120,
} as const;

export type WpAttractionAnswers = Record<WpAttractionKey, WpAttractionAnswer>;

export type WpIntakeAnswers = {
  firstName: string;
  lastName: string;
  company: string;
  phone: string;
  email: string;
  eventType: WpEventType;
  dates: string[];
  time: string;
  adults: number;
  children: number;
  duration: WpDurationOption;
  otherHours: number | null;
  minutes: number;
  attractions: WpAttractionAnswers;
  food: WpYesNo;
  privateRoom: WpYesNo;
  craft: WpYesNo;
  hasBudget: WpYesNo;
  budgetCents: number | null;
  description: string;
  comments: string | null;
  referral: string;
};

export type WpPrivateCalculationMeta = {
  status: "deferred" | "ready" | "failed" | "incomplete";
  rulesVersion: string | null;
  pricingRevision: string | null;
  /** `plugin_defaults` = testing baseline; `tenant_live` = verified tenant pack; `incomplete` = blocked. */
  pricingSource: "plugin_defaults" | "tenant_live" | "incomplete" | null;
  /** Organization the calculation was resolved for (tenant pricing precedence input). */
  organizationId?: string | null;
  /** Missing/invalid tenant pricing keys when `pricingSource`/`status` is `incomplete`. */
  missingKeys?: string[];
  summary: string | null;
  /** Staff-only WP-parity snapshot. Never exposed on public /plan routes. */
  snapshot: unknown | null;
  errorMessage: string | null;
};

export type WpIntakeMessageMetadata = {
  intakeVersion: typeof WP_INTAKE_VERSION;
  intakeKind: "wordpress_event_planner";
  answers: WpIntakeAnswers;
  privateCalculation: WpPrivateCalculationMeta;
};

export const WP_APPROVED_RULES_VERSION = "2026-11-02";

/** Staff-facing banner for unverified plugin-default WP private estimates. */
export const WP_PLUGIN_DEFAULT_ESTIMATE_LABEL =
  "ESTIMATE — Plugin-default pricing. Verify before sending to customer.";

export function guestMixFromAdultsChildren(adults: number, children: number): "mostly_adults" | "mostly_children" | "mixed_ages" {
  if (adults > 0 && children === 0) {
    return "mostly_adults";
  }
  if (children > 0 && adults === 0) {
    return "mostly_children";
  }
  return "mixed_ages";
}

export function durationMinutesFromWp(duration: WpDurationOption, otherHours: number | null): number {
  if (duration === "2 hours") {
    return 120;
  }
  if (duration === "3 hours") {
    return 180;
  }
  return Math.max(1, Math.round((otherHours ?? 0) * 60));
}

export function diningPreferenceFromWp(food: WpYesNo): "WANTS_FOOD" | "NO_FOOD" {
  return food === "yes" ? "WANTS_FOOD" : "NO_FOOD";
}

export function spacePreferenceFromWp(privateRoom: WpYesNo): "private" | "no_preference" {
  return privateRoom === "yes" ? "private" : "no_preference";
}

export function beveragePreferenceFromWp(craft: WpYesNo): "YES" | "NO" {
  return craft === "yes" ? "YES" : "NO";
}

export function yesAttractionKeys(attractions: WpAttractionAnswers): WpAttractionKey[] {
  return WP_ATTRACTION_KEYS.filter((key) => attractions[key] === "yes");
}

export function openAttractionKeys(attractions: WpAttractionAnswers): WpAttractionKey[] {
  return WP_ATTRACTION_KEYS.filter((key) => attractions[key] === "open");
}

export function attractionModeFromWpAnswers(attractions: WpAttractionAnswers): "KNOWN" | "RECOMMEND" {
  return yesAttractionKeys(attractions).length > 0 ? "KNOWN" : "RECOMMEND";
}

export function truncateForColumn(value: string, max: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= max) {
    return trimmed;
  }
  return trimmed.slice(0, max);
}

export function buildWpIntakeMessageMetadata(
  answers: WpIntakeAnswers,
  privateCalculation?: Partial<WpPrivateCalculationMeta>,
): WpIntakeMessageMetadata {
  return {
    intakeVersion: WP_INTAKE_VERSION,
    intakeKind: "wordpress_event_planner",
    answers,
    privateCalculation: {
      status: privateCalculation?.status ?? "deferred",
      rulesVersion: privateCalculation?.rulesVersion ?? WP_APPROVED_RULES_VERSION,
      pricingRevision: privateCalculation?.pricingRevision ?? null,
      pricingSource: privateCalculation?.pricingSource ?? null,
      organizationId: privateCalculation?.organizationId ?? null,
      missingKeys: privateCalculation?.missingKeys ?? [],
      summary: privateCalculation?.summary ?? null,
      snapshot: privateCalculation?.snapshot ?? null,
      errorMessage: privateCalculation?.errorMessage ?? null,
    },
  };
}

export function parseWpIntakeMessageMetadata(value: unknown): WpIntakeMessageMetadata | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (record.intakeKind !== "wordpress_event_planner" || record.intakeVersion !== WP_INTAKE_VERSION) {
    return null;
  }
  if (!record.answers || typeof record.answers !== "object") {
    return null;
  }
  return value as WpIntakeMessageMetadata;
}

export function formatWpIntakeMessage(answers: WpIntakeAnswers): string {
  const attractionLines = WP_ATTRACTION_KEYS.map(
    (key) => `${WP_ATTRACTION_LABELS[key]}: ${WP_ATTRACTION_ANSWER_LABELS[answers.attractions[key]]}`,
  );
  const lines = [
    `${answers.firstName} ${answers.lastName} submitted a WordPress-parity event request.`,
    `Email: ${answers.email}`,
    `Company: ${answers.company}`,
    `Phone: ${answers.phone}`,
    `Event type: ${answers.eventType}`,
    `Preferred dates: ${answers.dates.join(", ")}`,
    `Preferred start: ${answers.time}`,
    `Adults: ${answers.adults}`,
    `Children: ${answers.children}`,
    `Guests: ${answers.adults + answers.children}`,
    `Duration: ${answers.duration}${answers.otherHours != null ? ` (${answers.otherHours} hours)` : ""} → ${answers.minutes} minutes`,
    ...attractionLines,
    `Food: ${answers.food}`,
    `Private room: ${answers.privateRoom}`,
    `Craft beverages: ${answers.craft}`,
    answers.hasBudget === "yes" && answers.budgetCents != null
      ? `Budget: $${(answers.budgetCents / 100).toFixed(2)}`
      : "Budget: flexible",
    `Occasion: ${answers.description}`,
    `Referral: ${answers.referral}`,
  ];
  if (answers.comments) {
    lines.push(`Comments: ${answers.comments}`);
  }
  return lines.join("\n");
}
