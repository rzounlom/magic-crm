import type { WpCatalog } from "@/server/event-planner/wp-parity/catalog";
import type { PackageDefinition } from "@/server/event-planner/wp-parity/packages";

/**
 * Types for the Generations Event Planner 3.3.0 engine port.
 * Field names intentionally stay snake_case to mirror the PHP arrays one-to-one.
 */

export type AttractionKey = "bowling" | "axe" | "laser" | "golf" | "climbing" | "arcade";
export type AttractionAnswer = "yes" | "no" | "open";
export type YesNo = "yes" | "no";
export type RentalKind = "bowling" | "axe" | "laser" | "mezzanine" | "full";
export type RoomKey = "lower" | "upper" | "cove";
export type MenuPath =
  | "none"
  | "pizza"
  | "pizza_wings"
  | "wings"
  | "appetizers"
  | "fajita"
  | "slider"
  | "bbq";
export type WingType = "boneless" | "traditional";
export type ExtraKey = "salad" | "pretzels" | "strips" | "brownies" | "cookies" | "traditional";

/** Raw, untrusted inquiry input (WP form POST / saved inquiry). Always revalidated. */
export type InquiryRaw = Record<string, unknown>;

export type ValidatedInquiry = {
  first_name: string;
  last_name: string;
  company: string;
  event_type: string;
  phone: string;
  email: string;
  time: string;
  duration: string;
  food: string;
  private_room: string;
  craft: string;
  has_budget: string;
  description: string;
  referral: string;
  dates: string[];
  adults: number;
  children: number;
  guests: number;
  minutes: number;
  other_hours: number | null;
  /** Integer cents, or null when no budget. */
  budget: number | null;
  attractions: Partial<Record<AttractionKey, AttractionAnswer>>;
  comments: string;
};

export type ValidationResult = {
  valid: boolean;
  errors: Record<string, string>;
  data: ValidatedInquiry;
};

/** Staff recalculation controls (`$o` in the PHP engine). Values may be strings from admin forms. */
export type RecommendOptions = {
  menu?: string;
  wing_type?: string;
  room?: string;
  rental?: string;
  bowling_hours?: number | string;
  axe_minutes?: number | string;
  laser_mode?: string;
  room_hours?: number | string;
  extras?: Partial<Record<ExtraKey, number | string>>;
};

export type LineItem = {
  label: string;
  quantity: number;
  unit_cents: number;
  subtotal_cents: number;
  tax_cents: number;
};

export type ItineraryRow = {
  start_minute: number;
  end_minute: number;
  label: string;
  group: string;
  /** Wall-clock strings (`g:i A`) in America/Indiana/Indianapolis, set after scheduling. */
  start?: string;
  end?: string;
};

export type ArcadeCard = {
  audience: "adult" | "child" | "guest";
  quantity: number;
  credit_cents: number;
  included_cents_each: number;
  additional_cents_each: number;
};

export type CustomPackageRef = {
  id: string;
  revision: string;
  definition: PackageDefinition;
};

/** `Engine::product()` shape plus the optional keys the PHP engine adds dynamically. */
export type PlanDraft = {
  name: string;
  tier: number;
  items: LineItem[];
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
  notes: string[];
  review: string[];
  included_credit_cents: number;
  included_combos: number;
  bowling_minutes: number;
  axe_minutes: number;
  access_minutes: number;
  room_included: boolean;
  private_activities: boolean;

  alternative_only?: boolean;
  bowl_mode?: "regular";
  rental_minutes?: number;
  private_bowl_window?: number;
  private_axe_window?: number;
  rental_kind?: RentalKind;
  rental_kinds?: RentalKind[];
  deferred_play?: Record<string, number>;
  access_label?: string;
  arcade_target?: number;
  covers_climbing?: boolean;
  covers_golf?: boolean;
  covers_arcade?: boolean;
  child_credit_only?: boolean;
  climb_count?: number;
  included_food?: Record<string, number>;
  separate_package_dining?: boolean;
  custom_package?: CustomPackageRef;
  unpriced?: boolean;
  arcade_cards?: ArcadeCard[];
  unallocated_minutes?: number;
  duration_review?: boolean;
  missing_leisure_time?: boolean;
  /**
   * PHP parity marker. PHP stores `$bh * 60` as a float, and `recommend()` later tests
   * `bowling_minutes === 120` with strict identity (int vs float differ). JS numbers have no
   * int/float distinction, so this flag records "bowling_minutes originated from a PHP float".
   */
  bowling_minutes_is_php_float?: boolean;
};

/** Output of `Engine::complete()` / staff quote placeholder. */
export type Plan = PlanDraft & {
  selected_attractions: AttractionKey[];
  itinerary: ItineraryRow[];
  dining_minutes: number;
  required_minutes: number;
  per_guest_cents: number;
  fits_duration: boolean;
  hard_review: boolean;
  budget_over_cents: number;
};

/** Plan after `recommend()` ranking annotations. */
export type RankedPlan = Plan & {
  suggested_attractions: AttractionKey[];
  optional_fit: number;
  why?: string;
};

export type DayRecommendation = {
  date: string;
  recommendation: RankedPlan;
  alternatives: RankedPlan[];
};

export type RecommendSuccess = {
  valid: true;
  rules_version: string;
  pricing_revision: string;
  inquiry: ValidatedInquiry;
  dates: DayRecommendation[];
  status: string;
};

export type RecommendFailure = {
  valid: false;
  errors: Record<string, string>;
};

export type RecommendResult = RecommendSuccess | RecommendFailure;

export type EngineConfig = {
  catalog: WpCatalog;
  packages: readonly PackageDefinition[];
};
