/**
 * Phase 9B classification of WordPress pricing components vs MagiCRM booking catalog.
 * Documentation / reporting only — does not invent SKU mappings or change prices.
 */

export const WP_COMPONENT_CLASSIFICATIONS = {
  DIRECT_CATALOG_EQUIVALENT: "direct_catalog_equivalent",
  CATALOG_COMPOSITE_OR_PACKAGE: "catalog_composite_or_package",
  WORDPRESS_ONLY_CALCULATION: "wordpress_only_calculation",
  PRICING_ONLY_ADJUSTMENT: "pricing_only_adjustment",
  INVENTORY_RESOURCE_REQUIREMENT: "inventory_resource_requirement",
  FOOD_CATERING: "food_catering",
  TAX_FEE: "tax_fee",
  UNMAPPED_REQUIRES_INVESTIGATION: "unmapped_requires_investigation",
} as const;

export type WpComponentClassification =
  (typeof WP_COMPONENT_CLASSIFICATIONS)[keyof typeof WP_COMPONENT_CLASSIFICATIONS];

export type WpComponentTreatment = {
  classification: WpComponentClassification;
  inventoryRequired: boolean;
  appearsInCustomerQuote: boolean;
  mustAppearAsBookingLineItem: boolean;
  recommendedTreatment: string;
};

/**
 * Unmapped WP catalog keys (not in WP_TO_MAGICCRM_PRICE_MAPPINGS).
 * These remain calculation components unless an owner-approved mapping is added later.
 */
export const WP_UNMAPPED_COMPONENT_TREATMENTS: Readonly<
  Record<string, WpComponentTreatment>
> = {
  "bowling.half_weekday": {
    classification: WP_COMPONENT_CLASSIFICATIONS.WORDPRESS_ONLY_CALCULATION,
    inventoryRequired: false,
    appearsInCustomerQuote: true,
    mustAppearAsBookingLineItem: true,
    recommendedTreatment:
      "Keep as WP engine lane-duration pricing. MagiCRM bowling-1h is duration SKU, not a half-hour catalog twin. Do not invent a SKU.",
  },
  "bowling.half_weekend": {
    classification: WP_COMPONENT_CLASSIFICATIONS.WORDPRESS_ONLY_CALCULATION,
    inventoryRequired: false,
    appearsInCustomerQuote: true,
    mustAppearAsBookingLineItem: true,
    recommendedTreatment:
      "Keep as WP engine weekend half-hour pricing. Do not invent a MagiCRM SKU.",
  },
  "bowling.game_weekday": {
    classification: WP_COMPONENT_CLASSIFICATIONS.WORDPRESS_ONLY_CALCULATION,
    inventoryRequired: false,
    appearsInCustomerQuote: true,
    mustAppearAsBookingLineItem: true,
    recommendedTreatment: "WP per-game weekday rate used by calculator; calculation-only.",
  },
  "bowling.game_weekend": {
    classification: WP_COMPONENT_CLASSIFICATIONS.WORDPRESS_ONLY_CALCULATION,
    inventoryRequired: false,
    appearsInCustomerQuote: true,
    mustAppearAsBookingLineItem: true,
    recommendedTreatment: "WP per-game weekend rate used by calculator; calculation-only.",
  },
  "bowling.exclusive_peak": {
    classification: WP_COMPONENT_CLASSIFICATIONS.WORDPRESS_ONLY_CALCULATION,
    inventoryRequired: true,
    appearsInCustomerQuote: true,
    mustAppearAsBookingLineItem: true,
    recommendedTreatment:
      "Peak exclusive bowling buyout rate in WP calculator. Inventory via bowling lanes; no separate MagiCRM price SKU required.",
  },
  "bowling.pins": {
    classification: WP_COMPONENT_CLASSIFICATIONS.WORDPRESS_ONLY_CALCULATION,
    inventoryRequired: false,
    appearsInCustomerQuote: true,
    mustAppearAsBookingLineItem: true,
    recommendedTreatment: "WP add-on (glow pins / specialty). Calculation-only until owner maps a SKU.",
  },
  "axe.private_sat": {
    classification: WP_COMPONENT_CLASSIFICATIONS.WORDPRESS_ONLY_CALCULATION,
    inventoryRequired: true,
    appearsInCustomerQuote: true,
    mustAppearAsBookingLineItem: true,
    recommendedTreatment:
      "Saturday private axe rate in WP calculator. MagiCRM axe-den-2h covers non-Sat private; leave unmapped.",
  },
  "laser.game": {
    classification: WP_COMPONENT_CLASSIFICATIONS.WORDPRESS_ONLY_CALCULATION,
    inventoryRequired: false,
    appearsInCustomerQuote: true,
    mustAppearAsBookingLineItem: true,
    recommendedTreatment: "Single laser game rate — WP calculation component.",
  },
  "laser.thursday": {
    classification: WP_COMPONENT_CLASSIFICATIONS.WORDPRESS_ONLY_CALCULATION,
    inventoryRequired: false,
    appearsInCustomerQuote: true,
    mustAppearAsBookingLineItem: true,
    recommendedTreatment: "Thursday laser special — WP weekday special rule, not a MagiCRM SKU.",
  },
  "laser.games": {
    classification: WP_COMPONENT_CLASSIFICATIONS.WORDPRESS_ONLY_CALCULATION,
    inventoryRequired: false,
    appearsInCustomerQuote: true,
    mustAppearAsBookingLineItem: true,
    recommendedTreatment: "Multi-game laser bundle pricing in WP calculator.",
  },
  "laser.blast": {
    classification: WP_COMPONENT_CLASSIFICATIONS.CATALOG_COMPOSITE_OR_PACKAGE,
    inventoryRequired: false,
    appearsInCustomerQuote: true,
    mustAppearAsBookingLineItem: true,
    recommendedTreatment:
      "WP package-style laser/arcade combo. MagiCRM has separate package SKUs (have-a-blast, etc.) — do not silently merge.",
  },
  "golf.adult": {
    classification: WP_COMPONENT_CLASSIFICATIONS.WORDPRESS_ONLY_CALCULATION,
    inventoryRequired: true,
    appearsInCustomerQuote: true,
    mustAppearAsBookingLineItem: true,
    recommendedTreatment:
      "WP mini-golf adult rate. MagiCRM may use package SKUs (have-a-ball-mini-golf); keep WP cents on quote lines.",
  },
  "golf.child": {
    classification: WP_COMPONENT_CLASSIFICATIONS.WORDPRESS_ONLY_CALCULATION,
    inventoryRequired: true,
    appearsInCustomerQuote: true,
    mustAppearAsBookingLineItem: true,
    recommendedTreatment: "WP mini-golf child rate — calculation-only.",
  },
  climb: {
    classification: WP_COMPONENT_CLASSIFICATIONS.WORDPRESS_ONLY_CALCULATION,
    inventoryRequired: true,
    appearsInCustomerQuote: true,
    mustAppearAsBookingLineItem: true,
    recommendedTreatment:
      "WP per-climb rate. MagiCRM climbers-cove-90 is a package SKU — different commercial shape; do not substitute.",
  },
  pitcher: {
    classification: WP_COMPONENT_CLASSIFICATIONS.FOOD_CATERING,
    inventoryRequired: false,
    appearsInCustomerQuote: true,
    mustAppearAsBookingLineItem: true,
    recommendedTreatment: "Beverage add-on in WP calculator / combos. Pricing-only; no inventory hold.",
  },
  drink_card: {
    classification: WP_COMPONENT_CLASSIFICATIONS.FOOD_CATERING,
    inventoryRequired: false,
    appearsInCustomerQuote: true,
    mustAppearAsBookingLineItem: true,
    recommendedTreatment: "Drink card add-on — WP calculation / F&B, not inventory.",
  },
  "rooms.cove": {
    classification: WP_COMPONENT_CLASSIFICATIONS.INVENTORY_RESOURCE_REQUIREMENT,
    inventoryRequired: true,
    appearsInCustomerQuote: true,
    mustAppearAsBookingLineItem: true,
    recommendedTreatment:
      "Cove rental priced in WP; inventory soft-mapped to climbing-area when configured. No MagiCRM price SKU twin required.",
  },
  "mezzanine.sat_after": {
    classification: WP_COMPONENT_CLASSIFICATIONS.WORDPRESS_ONLY_CALCULATION,
    inventoryRequired: true,
    appearsInCustomerQuote: true,
    mustAppearAsBookingLineItem: true,
    recommendedTreatment:
      "Saturday-after mezzanine window in WP. MagiCRM mezzanine-saturday differs by window — leave calculation-only.",
  },
  "facility.sat_before": {
    classification: WP_COMPONENT_CLASSIFICATIONS.WORDPRESS_ONLY_CALCULATION,
    inventoryRequired: true,
    appearsInCustomerQuote: true,
    mustAppearAsBookingLineItem: true,
    recommendedTreatment:
      "WP full-facility Saturday-before rate. MagiCRM has related full-facility-* SKUs with different windows — do not invent mapping.",
  },
  "facility.sun_thu_after": {
    classification: WP_COMPONENT_CLASSIFICATIONS.WORDPRESS_ONLY_CALCULATION,
    inventoryRequired: true,
    appearsInCustomerQuote: true,
    mustAppearAsBookingLineItem: true,
    recommendedTreatment: "WP facility after-hours Sun–Thu. Calculation + inventory exclusive; no forced SKU.",
  },
  "facility.fri_after": {
    classification: WP_COMPONENT_CLASSIFICATIONS.WORDPRESS_ONLY_CALCULATION,
    inventoryRequired: true,
    appearsInCustomerQuote: true,
    mustAppearAsBookingLineItem: true,
    recommendedTreatment: "WP facility after-hours Friday. Calculation + inventory exclusive.",
  },
  "facility.sat_after": {
    classification: WP_COMPONENT_CLASSIFICATIONS.WORDPRESS_ONLY_CALCULATION,
    inventoryRequired: true,
    appearsInCustomerQuote: true,
    mustAppearAsBookingLineItem: true,
    recommendedTreatment:
      "WP facility Saturday-after. MagiCRM full-facility-sat-after-4 is related but not auto-mapped.",
  },
};

/** Known mapped discrepancies — WP wins for quote/booking money; catalog stays unchanged. */
export const WP_KNOWN_PRICE_DISCREPANCY_TREATMENTS: Readonly<
  Record<string, WpComponentTreatment & { wpCents: number; magicCatalogCents: number; productSlug: string }>
> = {
  "food.salad": {
    classification: WP_COMPONENT_CLASSIFICATIONS.FOOD_CATERING,
    inventoryRequired: false,
    appearsInCustomerQuote: true,
    mustAppearAsBookingLineItem: true,
    wpCents: 2499,
    magicCatalogCents: 1999,
    productSlug: "salad-pan",
    recommendedTreatment:
      "Keep MagiCRM salad-pan at 1999¢. WP quote lines must retain 2499¢. Owner may later align catalog or accept permanent WP-wins documentation.",
  },
  "rooms.lower_extra": {
    classification: WP_COMPONENT_CLASSIFICATIONS.PRICING_ONLY_ADJUSTMENT,
    inventoryRequired: false,
    appearsInCustomerQuote: true,
    mustAppearAsBookingLineItem: true,
    wpCents: 7500,
    magicCatalogCents: 5000,
    productSlug: "lower-event-room",
    recommendedTreatment:
      "Additional lower-room hour is pricing-only (no extra inventory unit). WP 7500¢ must survive on quote lines; MagiCRM additionalHourCents 5000¢ stays as catalog seed.",
  },
};

export function treatmentForWpKey(wpKey: string): WpComponentTreatment | null {
  if (WP_KNOWN_PRICE_DISCREPANCY_TREATMENTS[wpKey]) {
    return WP_KNOWN_PRICE_DISCREPANCY_TREATMENTS[wpKey]!;
  }
  if (WP_UNMAPPED_COMPONENT_TREATMENTS[wpKey]) {
    return WP_UNMAPPED_COMPONENT_TREATMENTS[wpKey]!;
  }
  if (wpKey.startsWith("food.")) {
    return {
      classification: WP_COMPONENT_CLASSIFICATIONS.FOOD_CATERING,
      inventoryRequired: false,
      appearsInCustomerQuote: true,
      mustAppearAsBookingLineItem: true,
      recommendedTreatment: "Mapped or WP food line — quote cents authority; no inventory hold.",
    };
  }
  if (wpKey.includes("_extra") || wpKey.endsWith(".shoes")) {
    return {
      classification: WP_COMPONENT_CLASSIFICATIONS.PRICING_ONLY_ADJUSTMENT,
      inventoryRequired: false,
      appearsInCustomerQuote: true,
      mustAppearAsBookingLineItem: true,
      recommendedTreatment: "Pricing-only adjustment — do not create an extra inventory unit.",
    };
  }
  return null;
}
