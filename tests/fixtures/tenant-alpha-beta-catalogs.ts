import type { BookingCatalogDataset } from "@/server/catalog/dataset";
import {
  INQUIRY_AUDIENCES,
  PRODUCT_KINDS,
  PRODUCT_PRICE_STRATEGIES,
  PRODUCT_QUANTITY_RULES,
  type CatalogProductInput,
  type RecommendationProfilePayload,
} from "@/types/catalog";
import type { LoadedCatalogProduct, LoadedRecommendationProfile } from "@/server/services/proposal-engine";
import type { CatalogResourceRequirementRow } from "@/server/catalog/requirements";

function centsPrice(
  strategy: string,
  amountCents: number,
  extra: Partial<CatalogProductInput["prices"][number]> = {},
): CatalogProductInput["prices"][number] {
  return {
    strategy,
    amountCents,
    additionalGuestCents: null,
    includedGuests: null,
    includedHours: null,
    additionalHourCents: null,
    minGuests: null,
    weekdayAmountCents: null,
    weekendAmountCents: null,
    daysOfWeek: null,
    afterHour: null,
    afterHourAmountCents: null,
    shoeAddOnCents: null,
    unitLabel: null,
    ...extra,
  };
}

const emptyAmbiguities: BookingCatalogDataset["ambiguities"] = [];

function attractionProduct(
  slug: string,
  name: string,
  prices: CatalogProductInput["prices"],
  extras: Partial<LoadedCatalogProduct> = {},
): LoadedCatalogProduct {
  return {
    id: extras.id ?? slug,
    slug,
    name,
    kind: extras.kind ?? PRODUCT_KINDS.ATTRACTION,
    audience: extras.audience ?? "ALL",
    durationMinutes: extras.durationMinutes ?? 60,
    minGuests: extras.minGuests ?? null,
    maxGuests: extras.maxGuests ?? null,
    weekendOnly: false,
    fulfillmentGroup: extras.fulfillmentGroup ?? null,
    prices,
    serving: extras.serving ?? null,
    guestsPerUnit: extras.guestsPerUnit ?? null,
  };
}

export const TENANT_ALPHA_PROFILES: LoadedRecommendationProfile[] = [
  {
    audience: INQUIRY_AUDIENCES.KIDS_YOUTH,
    payload: {
      defaultPackageSlugs: { good: "", better: "", best: "" },
      defaultAttractionSlugs: ["laser-tag", "arcade"],
      defaultFoodSlug: "pizza-combo",
      diningPreferenceMap: { pizza_light: "pizza-combo" },
      foodFirst: false,
      goodAddOnSlugs: [],
      betterAddOnSlugs: [],
      bestAddOnSlugs: [],
    },
  },
  {
    audience: INQUIRY_AUDIENCES.ADULTS,
    payload: {
      defaultPackageSlugs: { good: "", better: "", best: "" },
      defaultAttractionSlugs: ["bowling-1h", "axe-throwing"],
      defaultFoodSlug: "pizza-combo",
      diningPreferenceMap: { pizza_light: "pizza-combo" },
      foodFirst: true,
      goodAddOnSlugs: [],
      betterAddOnSlugs: [],
      bestAddOnSlugs: [],
    },
  },
];

export const TENANT_BETA_PROFILES: LoadedRecommendationProfile[] = [
  {
    audience: INQUIRY_AUDIENCES.KIDS_YOUTH,
    payload: {
      defaultPackageSlugs: { good: "", better: "", best: "" },
      defaultAttractionSlugs: ["trampoline", "arcade"],
      defaultFoodSlug: "snack-combo",
      diningPreferenceMap: { pizza_light: "snack-combo" },
      foodFirst: false,
      goodAddOnSlugs: [],
      betterAddOnSlugs: [],
      bestAddOnSlugs: [],
    },
  },
  {
    audience: INQUIRY_AUDIENCES.ADULTS,
    payload: {
      defaultPackageSlugs: { good: "", better: "", best: "" },
      defaultAttractionSlugs: ["bowling-1h"],
      defaultFoodSlug: "snack-combo",
      diningPreferenceMap: { pizza_light: "snack-combo" },
      foodFirst: false,
      goodAddOnSlugs: [],
      betterAddOnSlugs: [],
      bestAddOnSlugs: [],
    },
  },
];

export const TENANT_ALPHA_PRODUCTS: LoadedCatalogProduct[] = [
  attractionProduct("bowling-1h", "Bowling 1 Hour", [
    centsPrice(PRODUCT_PRICE_STRATEGIES.PER_LANE_WEEKDAY_WEEKEND, 3000, {
      weekdayAmountCents: 3000,
      weekendAmountCents: 4000,
      unitLabel: "lane",
    }),
  ], { guestsPerUnit: 6 }),
  attractionProduct("axe-throwing", "Axe Throwing", [
    centsPrice(PRODUCT_PRICE_STRATEGIES.PER_PERSON, 2500, { unitLabel: "person" }),
  ]),
  attractionProduct("laser-tag", "Laser Tag", [
    centsPrice(PRODUCT_PRICE_STRATEGIES.PER_PERSON, 1800, { unitLabel: "person" }),
  ]),
  attractionProduct("arcade", "Arcade", [
    centsPrice(PRODUCT_PRICE_STRATEGIES.PER_PERSON, 1200, { unitLabel: "person" }),
  ]),
  attractionProduct(
    "pizza-combo",
    "Pizza Combo",
    [centsPrice(PRODUCT_PRICE_STRATEGIES.FOOD_PER_COMBO, 2000, { unitLabel: "combo" })],
    { kind: PRODUCT_KINDS.FOOD, serving: { servesMin: 4, servesMax: 5, unitCount: null } },
  ),
];

export const TENANT_BETA_PRODUCTS: LoadedCatalogProduct[] = [
  attractionProduct("bowling-1h", "Bowling 1 Hour", [
    centsPrice(PRODUCT_PRICE_STRATEGIES.PER_LANE_WEEKDAY_WEEKEND, 5500, {
      weekdayAmountCents: 5500,
      weekendAmountCents: 6500,
      unitLabel: "lane",
    }),
  ], { guestsPerUnit: 5 }),
  attractionProduct("trampoline", "Trampoline Park", [
    centsPrice(PRODUCT_PRICE_STRATEGIES.PER_PERSON, 2200, { unitLabel: "person" }),
  ]),
  attractionProduct("arcade", "Arcade", [
    centsPrice(PRODUCT_PRICE_STRATEGIES.PER_PERSON, 900, { unitLabel: "person" }),
  ]),
  attractionProduct(
    "snack-combo",
    "Snack Combo",
    [centsPrice(PRODUCT_PRICE_STRATEGIES.FOOD_PER_COMBO, 1500, { unitLabel: "combo" })],
    { kind: PRODUCT_KINDS.FOOD, serving: { servesMin: 6, servesMax: 8, unitCount: null } },
  ),
];

export function tenantAlphaRequirements(): CatalogResourceRequirementRow[] {
  return [
    {
      productId: "bowling-1h",
      productName: "Bowling 1 Hour",
      resourceTypeId: "alpha-bowling",
      resourceTypeSlug: "bowling-lane",
      resourceTypeName: "Bowling Lane",
      inventoryConfigured: true,
      activeCount: 8,
      quantityRule: PRODUCT_QUANTITY_RULES.PER_GUESTS,
      quantity: null,
      guestsPerUnit: 6,
      durationMinutes: 60,
      exclusive: false,
    },
    {
      productId: "axe-throwing",
      productName: "Axe Throwing",
      resourceTypeId: "alpha-axe",
      resourceTypeSlug: "axe-bay",
      resourceTypeName: "Axe Bay",
      inventoryConfigured: true,
      activeCount: 8,
      quantityRule: PRODUCT_QUANTITY_RULES.PER_GUESTS,
      quantity: null,
      guestsPerUnit: 8,
      durationMinutes: 60,
      exclusive: false,
    },
  ];
}

export function tenantBetaRequirements(): CatalogResourceRequirementRow[] {
  return [
    {
      productId: "bowling-1h",
      productName: "Bowling 1 Hour",
      resourceTypeId: "beta-bowling",
      resourceTypeSlug: "bowling-lane",
      resourceTypeName: "Bowling Lane",
      inventoryConfigured: true,
      activeCount: 2,
      quantityRule: PRODUCT_QUANTITY_RULES.PER_GUESTS,
      quantity: null,
      guestsPerUnit: 5,
      durationMinutes: 60,
      exclusive: false,
    },
  ];
}

export const TENANT_ALPHA_KIDS_PROFILE = TENANT_ALPHA_PROFILES[0]!.payload;
export const TENANT_BETA_KIDS_PROFILE = TENANT_BETA_PROFILES[0]!.payload;
export const TENANT_ALPHA_ADULT_PROFILE = TENANT_ALPHA_PROFILES[1]!.payload;
export const TENANT_BETA_ADULT_PROFILE = TENANT_BETA_PROFILES[1]!.payload;

function datasetProduct(
  product: LoadedCatalogProduct,
  categorySlug: string,
  requirements: Array<{
    resourceTypeSlug: string;
    quantityRule: string;
    guestsPerUnit?: number | null;
  }> = [],
): BookingCatalogDataset["products"][number] {
  return {
    slug: product.slug,
    name: product.name,
    kind: product.kind,
    audience: product.audience,
    categorySlug,
    durationMinutes: product.durationMinutes,
    minGuests: product.minGuests,
    maxGuests: product.maxGuests,
    weekendOnly: product.weekendOnly,
    fulfillmentGroup: product.fulfillmentGroup,
    shortDescription: null,
    prices: product.prices,
    requirements: requirements.map((row) => ({
      resourceTypeSlug: row.resourceTypeSlug,
      quantityRule: row.quantityRule,
      quantity: null,
      guestsPerUnit: row.guestsPerUnit ?? null,
      durationMinutes: 60,
      exclusive: false,
    })),
    serving: product.serving,
  };
}

function profileRow(audience: string, payload: RecommendationProfilePayload): BookingCatalogDataset["recommendationProfiles"][number] {
  return { audience, payload };
}

export const TENANT_ALPHA_DATASET: BookingCatalogDataset = {
  version: 1,
  sourceFiles: ["tests/fixtures/tenant-alpha-beta-catalogs.ts"],
  ambiguities: emptyAmbiguities,
  categories: [
    { slug: "attractions", name: "Attractions", sortOrder: 1 },
    { slug: "food", name: "Food", sortOrder: 2 },
  ],
  resourceTypes: [
    { slug: "bowling-lane", name: "Bowling Lane", count: 8, capacity: 6, schedulingMode: "SLOTTED" },
    { slug: "axe-bay", name: "Axe Bay", count: 8, capacity: 8, schedulingMode: "SLOTTED" },
  ],
  products: [
    datasetProduct(TENANT_ALPHA_PRODUCTS[0]!, "attractions", [
      { resourceTypeSlug: "bowling-lane", quantityRule: PRODUCT_QUANTITY_RULES.PER_GUESTS, guestsPerUnit: 6 },
    ]),
    datasetProduct(TENANT_ALPHA_PRODUCTS[1]!, "attractions", [
      { resourceTypeSlug: "axe-bay", quantityRule: PRODUCT_QUANTITY_RULES.PER_GUESTS, guestsPerUnit: 8 },
    ]),
    datasetProduct(TENANT_ALPHA_PRODUCTS[2]!, "attractions"),
    datasetProduct(TENANT_ALPHA_PRODUCTS[3]!, "attractions"),
    datasetProduct(TENANT_ALPHA_PRODUCTS[4]!, "food"),
  ],
  recommendationProfiles: [
    profileRow(INQUIRY_AUDIENCES.KIDS_YOUTH, TENANT_ALPHA_KIDS_PROFILE),
    profileRow(INQUIRY_AUDIENCES.ADULTS, TENANT_ALPHA_ADULT_PROFILE),
    profileRow(INQUIRY_AUDIENCES.MIXED, TENANT_ALPHA_ADULT_PROFILE),
  ],
};

export const TENANT_BETA_DATASET: BookingCatalogDataset = {
  version: 1,
  sourceFiles: ["tests/fixtures/tenant-alpha-beta-catalogs.ts"],
  ambiguities: emptyAmbiguities,
  categories: [
    { slug: "attractions", name: "Attractions", sortOrder: 1 },
    { slug: "food", name: "Food", sortOrder: 2 },
  ],
  resourceTypes: [
    { slug: "bowling-lane", name: "Bowling Lane", count: 2, capacity: 5, schedulingMode: "SLOTTED" },
    { slug: "trampoline-court", name: "Trampoline Court", count: 1, capacity: 20, schedulingMode: "SLOTTED" },
  ],
  products: [
    datasetProduct(TENANT_BETA_PRODUCTS[0]!, "attractions", [
      { resourceTypeSlug: "bowling-lane", quantityRule: PRODUCT_QUANTITY_RULES.PER_GUESTS, guestsPerUnit: 5 },
    ]),
    datasetProduct(TENANT_BETA_PRODUCTS[1]!, "attractions", [
      { resourceTypeSlug: "trampoline-court", quantityRule: PRODUCT_QUANTITY_RULES.FIXED, guestsPerUnit: null },
    ]),
    datasetProduct(TENANT_BETA_PRODUCTS[2]!, "attractions"),
    datasetProduct(TENANT_BETA_PRODUCTS[3]!, "food"),
  ],
  recommendationProfiles: [
    profileRow(INQUIRY_AUDIENCES.KIDS_YOUTH, TENANT_BETA_KIDS_PROFILE),
    profileRow(INQUIRY_AUDIENCES.ADULTS, TENANT_BETA_ADULT_PROFILE),
    profileRow(INQUIRY_AUDIENCES.MIXED, TENANT_BETA_ADULT_PROFILE),
  ],
};
