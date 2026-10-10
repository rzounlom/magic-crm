/**
 * Tenant-configurable tax engine types (R2C.2).
 * Unresolved tax must never masquerade as a verified zero-dollar amount.
 */

export const TAX_CALCULATION_STATUSES = {
  CALCULATED: "CALCULATED",
  EXEMPT: "EXEMPT",
  ZERO_RATE: "ZERO_RATE",
  UNRESOLVED_CLASSIFICATION: "UNRESOLVED_CLASSIFICATION",
  UNRESOLVED_JURISDICTION: "UNRESOLVED_JURISDICTION",
  UNRESOLVED_RATE: "UNRESOLVED_RATE",
  UNRESOLVED_BUNDLE: "UNRESOLVED_BUNDLE",
  UNRESOLVED_TIMEZONE: "UNRESOLVED_TIMEZONE",
  DISABLED: "DISABLED",
} as const;

export type TaxCalculationStatus =
  (typeof TAX_CALCULATION_STATUSES)[keyof typeof TAX_CALCULATION_STATUSES];

/** Conceptual product tax classes — not universal legal taxability. */
export const PRODUCT_TAX_CLASSES = {
  ADMISSION_ACTIVITY: "ADMISSION_ACTIVITY",
  PREPARED_FOOD: "PREPARED_FOOD",
  BEVERAGE: "BEVERAGE",
  TPP_RENTAL: "TPP_RENTAL",
  ROOM_FACILITY: "ROOM_FACILITY",
  STORED_VALUE: "STORED_VALUE",
  GIFT_CARD: "GIFT_CARD",
  MIXED_PACKAGE: "MIXED_PACKAGE",
  OTHER: "OTHER",
  UNCLASSIFIED: "UNCLASSIFIED",
} as const;

export type ProductTaxClass = (typeof PRODUCT_TAX_CLASSES)[keyof typeof PRODUCT_TAX_CLASSES];

/** Tenant/jurisdiction policy binding for a classified product component. */
export const PRODUCT_TAXABILITIES = {
  TAXABLE: "TAXABLE",
  EXEMPT: "EXEMPT",
  UNRESOLVED: "UNRESOLVED",
} as const;

export type ProductTaxability = (typeof PRODUCT_TAXABILITIES)[keyof typeof PRODUCT_TAXABILITIES];

export const TAX_TYPES = {
  STATE_SALES: "STATE_SALES",
  COUNTY_FAB: "COUNTY_FAB",
  MUNICIPAL_FAB: "MUNICIPAL_FAB",
  OTHER: "OTHER",
} as const;

export type TaxType = (typeof TAX_TYPES)[keyof typeof TAX_TYPES];

export const TAX_VERIFICATION_STATUSES = {
  UNVERIFIED: "UNVERIFIED",
  VERIFIED: "VERIFIED",
} as const;

export const TAX_APPROVAL_STATUSES = {
  DRAFT: "DRAFT",
  APPROVED: "APPROVED",
  REVOKED: "REVOKED",
} as const;

export const BUNDLE_TAX_TREATMENTS = {
  FULLY_TAXABLE: "FULLY_TAXABLE",
  FULLY_EXEMPT: "FULLY_EXEMPT",
  SEPARATELY_STATED: "SEPARATELY_STATED",
  UNRESOLVED: "UNRESOLVED",
} as const;

export type BundleTaxTreatment =
  (typeof BUNDLE_TAX_TREATMENTS)[keyof typeof BUNDLE_TAX_TREATMENTS];

export const TAX_PRICING_MODES = {
  TAX_EXCLUSIVE: "TAX_EXCLUSIVE",
  TAX_INCLUSIVE: "TAX_INCLUSIVE",
} as const;

export type TaxPricingMode = (typeof TAX_PRICING_MODES)[keyof typeof TAX_PRICING_MODES];

export const TAX_ROUNDING_MODES = {
  /** Half-up per line in integer cents (matches deposit percentOfCents style). */
  HALF_UP_LINE: "HALF_UP_LINE",
} as const;

/**
 * Rate precision: basis points where 10_000 bps = 100%.
 * 7% = 700 bps. Rates needing finer than 0.01% are unsupported in this foundation.
 */
export const TAX_RATE_BPS_SCALE = 10_000;

export const TAX_ENGINE_VERSION = "r2c2.1";

export type TaxLineInput = {
  productId: string;
  slug: string;
  name: string;
  kind: string;
  quantity: number;
  unitLabel?: string | null;
  totalCents: number;
  discountCents?: number;
  originalTotalCents?: number;
};

export type ProductTaxClassificationRule = {
  id: string;
  productId: string;
  /** Null = primary activity line; e.g. "shoes" for shoe add-on lines. */
  componentKey: string | null;
  classification: ProductTaxClass;
  taxability: ProductTaxability;
  effectiveFrom: string | null;
  effectiveTo: string | null;
};

export type TaxRateScheduleRule = {
  id: string;
  locationId: string;
  taxType: TaxType;
  jurisdictionCode: string;
  /** Basis points: 700 = 7.00%. */
  rateBps: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  sourceUrl: string | null;
  sourceCitation: string | null;
  verificationStatus: string;
  approvalStatus: string;
  active: boolean;
  version: number;
};

export type BundleTaxPolicyRule = {
  id: string;
  productId: string;
  treatment: BundleTaxTreatment;
  version: number;
};

export type LocationTaxProfileInput = {
  locationId: string;
  streetLine1: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  country: string | null;
  countyName: string | null;
  jurisdictionCode: string | null;
  jurisdictionResolved: boolean;
  /**
   * Explicit IANA zone for tax effective dates.
   * When null, engine may use locationTimezone only if it is not a known-unsafe sentinel.
   */
  taxTimeZone: string | null;
  locationTimezone: string;
};

export type OrganizationTaxSettingsInput = {
  calculationEnabled: boolean;
  collectionEnabled: boolean;
  pricingMode: TaxPricingMode;
  roundingMode: string;
  approvedAt: string | null;
};

export type TaxCalculationInput = {
  organizationId: string;
  locationId: string | null;
  /** Venue-local civil date YYYY-MM-DD used as tax point. */
  taxDate: string | null;
  lineItems: TaxLineInput[];
  settings: OrganizationTaxSettingsInput | null;
  locationProfile: LocationTaxProfileInput | null;
  classifications: ProductTaxClassificationRule[];
  rates: TaxRateScheduleRule[];
  bundlePolicies: BundleTaxPolicyRule[];
};

export type TaxLineResult = {
  productId: string;
  slug: string;
  componentKey: string | null;
  classification: ProductTaxClass | null;
  taxability: ProductTaxability | null;
  taxableBaseCents: number | null;
  taxCents: number | null;
  rateScheduleId: string | null;
  rateBps: number | null;
  jurisdictionCode: string | null;
  taxType: string | null;
  status: TaxCalculationStatus;
  unresolvedReason: string | null;
};

export type TaxCalculationResult = {
  engineVersion: string;
  status: TaxCalculationStatus;
  chargeable: boolean;
  organizationId: string;
  locationId: string | null;
  taxDate: string | null;
  timeZoneUsed: string | null;
  pricingMode: TaxPricingMode | null;
  roundingMode: string;
  jurisdictionCode: string | null;
  lines: TaxLineResult[];
  /** Present only when status is CALCULATED, EXEMPT, or ZERO_RATE. */
  taxTotalCents: number | null;
  unresolvedReasons: string[];
};

export type TaxBreakdownSnapshot = TaxCalculationResult;
