export const PRODUCT_SCHEDULING_BEHAVIORS = {
  SCHEDULED: "SCHEDULED",
  SPACE_WINDOW: "SPACE_WINDOW",
  NON_SCHEDULED: "NON_SCHEDULED",
} as const;

export type ProductSchedulingBehavior =
  (typeof PRODUCT_SCHEDULING_BEHAVIORS)[keyof typeof PRODUCT_SCHEDULING_BEHAVIORS];

export const PRODUCT_KINDS = {
  ATTRACTION: "ATTRACTION",
  PACKAGE: "PACKAGE",
  RENTAL: "RENTAL",
  FOOD: "FOOD",
  ADD_ON: "ADD_ON",
  FIELD_TRIP: "FIELD_TRIP",
} as const;

export type ProductKind = (typeof PRODUCT_KINDS)[keyof typeof PRODUCT_KINDS];

export const PRODUCT_AUDIENCES = {
  KIDS_YOUTH: "KIDS_YOUTH",
  ADULTS: "ADULTS",
  MIXED: "MIXED",
  ALL: "ALL",
} as const;

export type ProductAudience = (typeof PRODUCT_AUDIENCES)[keyof typeof PRODUCT_AUDIENCES];

export const INQUIRY_AUDIENCES = {
  KIDS_YOUTH: "KIDS_YOUTH",
  ADULTS: "ADULTS",
  MIXED: "MIXED",
} as const;

export type InquiryAudience = (typeof INQUIRY_AUDIENCES)[keyof typeof INQUIRY_AUDIENCES];

export const ATTRACTION_MODES = {
  KNOWN: "KNOWN",
  RECOMMEND: "RECOMMEND",
} as const;

export type AttractionMode = (typeof ATTRACTION_MODES)[keyof typeof ATTRACTION_MODES];

export const PRODUCT_PRICE_STRATEGIES = {
  PACKAGE_BASE_PLUS_ADDITIONAL: "PACKAGE_BASE_PLUS_ADDITIONAL",
  PER_PERSON: "PER_PERSON",
  PER_LANE_WEEKDAY_WEEKEND: "PER_LANE_WEEKDAY_WEEKEND",
  FIXED_RENTAL: "FIXED_RENTAL",
  DAY_SPECIFIC_RENTAL: "DAY_SPECIFIC_RENTAL",
  DURATION_BASE_PLUS_ADDITIONAL_HOUR: "DURATION_BASE_PLUS_ADDITIONAL_HOUR",
  TIME_WINDOW_RENTAL: "TIME_WINDOW_RENTAL",
  FOOD_PER_PERSON: "FOOD_PER_PERSON",
  FOOD_PER_COMBO: "FOOD_PER_COMBO",
  FOOD_PER_PLATTER: "FOOD_PER_PLATTER",
  FOOD_FIXED_SET: "FOOD_FIXED_SET",
} as const;

export type ProductPriceStrategy =
  (typeof PRODUCT_PRICE_STRATEGIES)[keyof typeof PRODUCT_PRICE_STRATEGIES];

export const PRODUCT_QUANTITY_RULES = {
  FIXED: "FIXED",
  PER_GUESTS: "PER_GUESTS",
  ALL_OF_TYPE: "ALL_OF_TYPE",
  SPECIFIC_RESOURCE: "SPECIFIC_RESOURCE",
  LOCATION_EXCLUSIVE: "LOCATION_EXCLUSIVE",
} as const;

export type ProductQuantityRule =
  (typeof PRODUCT_QUANTITY_RULES)[keyof typeof PRODUCT_QUANTITY_RULES];

export const WEEKDAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

export type WeekdayKey = (typeof WEEKDAY_KEYS)[number];

export const DEPOSIT_PREVIEW_PERCENT = 30;

export const DEPOSIT_PREVIEW_NOTE = "Payment is not collected yet.";

export function depositPreviewNoteForPercent(percent: number): string {
  return `Estimated deposit is ${percent}% of the total. Payment is not collected yet.`;
}

export type CatalogPriceInput = {
  strategy: string;
  amountCents: number;
  additionalGuestCents: number | null;
  includedGuests: number | null;
  includedHours: number | null;
  additionalHourCents: number | null;
  minGuests: number | null;
  weekdayAmountCents: number | null;
  weekendAmountCents: number | null;
  daysOfWeek: WeekdayKey[] | null;
  afterHour: number | null;
  afterHourAmountCents: number | null;
  shoeAddOnCents: number | null;
  unitLabel: string | null;
};

export type CatalogServingInput = {
  servesMin: number;
  servesMax: number;
  unitCount: number | null;
};

export type CatalogProductInput = {
  id: string;
  slug: string;
  name: string;
  kind: string;
  audience: string;
  durationMinutes: number | null;
  /** Tenant override. Null means derive from kind, duration, and resource requirements. */
  schedulingBehavior?: string | null;
  minGuests: number | null;
  maxGuests: number | null;
  weekendOnly: boolean;
  fulfillmentGroup: string | null;
  prices: CatalogPriceInput[];
  serving: CatalogServingInput | null;
  /** From tenant ProductResourceRequirement. Required for PER_* quantity pricing. */
  guestsPerUnit?: number | null;
};

export type PricingContext = {
  guestCount: number;
  eventDate: string | null;
  startTime: string | null;
  durationMinutes: number;
};

export type PricedLineItem = {
  productId: string;
  slug: string;
  name: string;
  kind: string;
  quantity: number;
  unitLabel: string | null;
  unitPriceCents: number;
  totalCents: number;
};

export type PriceQuote = {
  productId: string;
  slug: string;
  name: string;
  totalCents: number;
  lineItems: PricedLineItem[];
  pricingComplete: boolean;
};

export const FOOD_TIER_STRATEGIES = {
  VALUE: "value",
  STANDARD: "standard",
  PREMIUM: "premium",
} as const;

export type FoodTierStrategy = (typeof FOOD_TIER_STRATEGIES)[keyof typeof FOOD_TIER_STRATEGIES];

export const SPACE_FIT_STRATEGIES = {
  TIGHTEST: "tightest",
  LARGEST: "largest",
} as const;

export type SpaceFitStrategy = (typeof SPACE_FIT_STRATEGIES)[keyof typeof SPACE_FIT_STRATEGIES];

export const BUDGET_FITS = {
  WITHIN_RANGE: "WITHIN_RANGE",
  BELOW_RANGE: "BELOW_RANGE",
  ABOVE_RANGE: "ABOVE_RANGE",
  FLEXIBLE: "FLEXIBLE",
  UNSPECIFIED: "UNSPECIFIED",
} as const;

export type BudgetFit = (typeof BUDGET_FITS)[keyof typeof BUDGET_FITS];

/** Customer-facing budget classification. Advisory only; catalog prices stay unchanged. */
export const BUDGET_EXPLANATION_CODES = {
  WITHIN_BUDGET: "WITHIN_BUDGET",
  ABOVE_BUDGET: "ABOVE_BUDGET",
  BELOW_BUDGET: "BELOW_BUDGET",
  NO_BUDGET: "NO_BUDGET",
  UNSPECIFIED: "UNSPECIFIED",
} as const;

export type BudgetExplanationCode = (typeof BUDGET_EXPLANATION_CODES)[keyof typeof BUDGET_EXPLANATION_CODES];

export type BudgetAssessment = {
  budgetFit: BudgetFit;
  budgetExplanationCode: BudgetExplanationCode;
  /** Signed cents versus the relevant bound. Positive is above the ceiling. Negative is below the floor. */
  budgetDifferenceCents: number | null;
};

/** One independently composed tier. Not "the previous tier plus an add-on". */
export type TierCompositionConfig = {
  foodStrategy: FoodTierStrategy;
  /** Used only when the customer did not select attraction interests. */
  coreAttractionSlugs: string[];
  /** Products that belong to this tier alone. */
  upgradeSlugs: string[];
  /**
   * Upgrade slugs this tier may omit when the priced total is above budgetMax.
   * Explicit attractions, dining, and space are never removed to hit a budget.
   * Beverage slugs listed here may also be omitted.
   */
  budgetOptionalUpgradeSlugs?: string[];
  /**
   * Separate beverage products for this tier. Omitted when the customer declines food.
   * A drink bundled inside a food product stays on that product and is not listed here.
   */
  beverageSlugs?: string[];
  /** Attraction-interest slug → preferred fulfillment product slug for this tier. */
  fulfillmentByInterest: Record<string, string>;
  includeSpace: boolean;
  spaceFit: SpaceFitStrategy;
  /**
   * Room product slugs in preference order. The first product that fits guest count and date wins.
   * When omitted, spaceSlugs plus spaceFit still apply.
   */
  spaceSlugOrder?: string[];
};

export type RecommendationCompositionConfig = {
  foodStrategies: Record<FoodTierStrategy, string[]>;
  /** Party-space product slugs. Capacity is each product's maxGuests, not a runtime constant. */
  spaceSlugs: string[];
  tiers: {
    good: TierCompositionConfig;
    better: TierCompositionConfig;
    best: TierCompositionConfig;
  };
};

export type RecommendationProfilePayload = {
  defaultPackageSlugs: {
    good: string;
    better: string;
    best: string;
  };
  defaultAttractionSlugs: string[];
  fulfillmentGroups?: Record<string, { default: string; options: Record<string, string> }>;
  defaultFoodSlug: string | null;
  /** Intake diningPreference key → tenant product slug. Tenant data, not a global menu. */
  diningPreferenceMap?: Record<string, string>;
  /** Tenant itinerary preference: food before attractions when true. */
  foodFirst: boolean;
  goodAddOnSlugs: string[];
  betterAddOnSlugs: string[];
  bestAddOnSlugs: string[];
  premiumSpaceSlug?: string | null;
  /** When present, each tier is composed from this strategy instead of stacking add-ons. */
  composition?: RecommendationCompositionConfig;
};

export type ItinerarySegment = {
  id?: string;
  startTime: string;
  endTime: string;
  label: string;
  productId?: string;
  startOffsetMinutes?: number;
  durationMinutes?: number;
  consumesInventory?: boolean;
  /** DINING and ACTIVITY are the sample itinerary. SPACE overlaps that span. */
  role?: "DINING" | "ACTIVITY" | "SPACE";
};
