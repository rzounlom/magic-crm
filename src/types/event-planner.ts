import type { PlanResourceRequirement } from "@/types/resource-schedule";

export const EVENT_PLAN_TIERS = {
  BUDGET: "budget",
  BEST_FIT: "best_fit",
  PREMIUM: "premium",
} as const;

export type EventPlanTier = (typeof EVENT_PLAN_TIERS)[keyof typeof EVENT_PLAN_TIERS];

export const EVENT_PLAN_TIER_TITLES: Record<EventPlanTier, string> = {
  [EVENT_PLAN_TIERS.BUDGET]: "Budget Friendly",
  [EVENT_PLAN_TIERS.BEST_FIT]: "Best Fit",
  [EVENT_PLAN_TIERS.PREMIUM]: "Premium Experience",
};

export const GUEST_MIX_VALUES = [
  "mostly_adults",
  "mostly_children",
  "teens",
  "mixed_ages",
] as const;

export type GuestMix = (typeof GUEST_MIX_VALUES)[number];

export const GUEST_MIX_LABELS: Record<GuestMix, string> = {
  mostly_adults: "Mostly Adults",
  mostly_children: "Mostly Children",
  teens: "Teens",
  mixed_ages: "Mixed Ages",
};

export const EVENT_DURATION_MINUTES = [120, 180, 240, 300] as const;

export type EventDurationMinutes = (typeof EVENT_DURATION_MINUTES)[number];

export const EVENT_DURATION_LABELS: Record<EventDurationMinutes, string> = {
  120: "2 hours",
  180: "3 hours",
  240: "4 hours",
  300: "5+ hours",
};

export const EVENT_TYPE_OPTIONS = [
  "Corporate Event",
  "School / Church",
  "Birthday Party",
  "Nonprofit / Community",
  "Private Group",
  "Sports Team",
  "Other",
] as const;

export const EVENT_GOAL_OPTIONS = [
  "Team Building",
  "Employee Appreciation",
  "Celebration",
  "Youth Outing",
  "Meeting + Entertainment",
  "Family Fun",
  "Fundraiser",
  "Competition",
  "Social Event",
] as const;

export const SPACE_PREFERENCE_VALUES = ["private", "semi_private", "no_preference"] as const;

export type SpacePreference = (typeof SPACE_PREFERENCE_VALUES)[number];

export const SPACE_PREFERENCE_LABELS: Record<SpacePreference, string> = {
  private: "Private Space Preferred",
  semi_private: "Semi-Private Is Fine",
  no_preference: "No Preference",
};

export const DINING_PREFERENCE_VALUES = [
  "pizza_light",
  "catered_slider",
  "catered_fajita",
  "catered_help",
  "not_sure",
  "none",
] as const;

export type DiningPreference = (typeof DINING_PREFERENCE_VALUES)[number];

export const DINING_PREFERENCE_LABELS: Record<DiningPreference, string> = {
  pizza_light: "Pizza & Light Fare",
  catered_slider: "Catered Slider Bar",
  catered_fajita: "Catered Fajita Bar",
  catered_help: "Catered Food Bar — Help Me Choose",
  not_sure: "Not Sure — Recommend Something",
  none: "No Food Needed",
};

export const BUDGET_BAND_VALUES = [
  "under_1500",
  "1500_3000",
  "3000_5000",
  "5000_7500",
  "7500_plus",
] as const;

export type BudgetBand = (typeof BUDGET_BAND_VALUES)[number];

export const BUDGET_BAND_LABELS: Record<BudgetBand, string> = {
  under_1500: "Under $1,500",
  "1500_3000": "$1,500–$3,000",
  "3000_5000": "$3,000–$5,000",
  "5000_7500": "$5,000–$7,500",
  "7500_plus": "$7,500+",
};

/** Integer minor units (cents). */
export const BUDGET_BAND_CENTS: Record<BudgetBand, { min: number; max: number | null }> = {
  under_1500: { min: 0, max: 150_000 },
  "1500_3000": { min: 150_000, max: 300_000 },
  "3000_5000": { min: 300_000, max: 500_000 },
  "5000_7500": { min: 500_000, max: 750_000 },
  "7500_plus": { min: 750_000, max: null },
};

export const AVAILABILITY_UNVALIDATED_NOTE =
  "Known published limits were applied. Live inventory still needs confirmation before booking.";

export const CUSTOMER_AVAILABILITY_NOTE =
  "Final availability will be confirmed by our event team.";

export const CUSTOMER_SELECTED_HANDOFF_REASON = "Customer selected plan — ready to book";

export const NO_FEASIBLE_PLAN_REASON =
  "No feasible event plan could be generated from current sales knowledge. A team member should follow up.";

export type EventPlanActivity = {
  knowledgeItemId: string;
  name: string;
  quantity: number;
  unitLabel?: string;
  priceCents: number;
  priceText?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  rotationNote?: string | null;
};

export type EventPlanDining = {
  knowledgeItemId?: string;
  label: string;
  quantity?: number;
  priceCents: number;
  priceText?: string | null;
};

export type EventPlanRotationAssignment = {
  groupLabel: string;
  activityName: string;
  knowledgeItemId?: string;
  guestCount?: number;
};

export type EventPlanRotation = {
  startTime: string;
  endTime: string;
  assignments: EventPlanRotationAssignment[];
};

export type EventPlanSpace = {
  knowledgeItemId: string;
  name: string;
  priceCents: number;
  priceText?: string | null;
};

export type EventPlanRanking = {
  score: number;
  reasons: string[];
};

export type EventPlanPayload = {
  guestCount: number;
  eventDate: string | null;
  startTime: string | null;
  durationMinutes: number;
  activities: EventPlanActivity[];
  dining: EventPlanDining;
  spaces: EventPlanSpace[];
  schedule: string[];
  pricingComplete: boolean;
  historicalInfluence?: string | null;
  customerAvailabilityNote?: string;
  ranking?: EventPlanRanking;
  rotations?: EventPlanRotation[];
  resourceRequirements?: PlanResourceRequirement[];
  selectionAvailability?: {
    status: string;
    checkedAt: string;
    types: import("@/types/resource-schedule").ResourceTypeAvailability[];
    note: string;
  };
};

export type EventPlanDraft = {
  tier: EventPlanTier;
  title: string;
  sortOrder: number;
  estimatedTotalCents: number;
  currency: string;
  guestCount: number;
  durationMinutes: number;
  customerFacingReason: string;
  availabilityValidated: boolean;
  availabilityNote: string;
  availabilityStatus?: import("@/types/resource-schedule").PlanAvailabilityStatus;
  payload: EventPlanPayload;
};
