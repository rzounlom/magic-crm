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
