import { wpBowlingLanes } from "@/server/event-planner/wp-parity/lanes";
import type { AttractionKey } from "@/server/event-planner/wp-parity/types";
import type { PlanResourceRequirement } from "@/types/resource-schedule";
import { RESOURCE_QUANTITY_RULES } from "@/types/resource-schedule";

/**
 * WordPress attraction → MagiCRM inventory classification.
 * Pricing-only components never appear here.
 */
export type WpInventoryClass =
  | "reservable"
  | "capacity"
  | "pricing_only"
  | "food"
  | "room"
  | "optional_add_on";

export type WpAttractionInventoryMapping = {
  attraction: AttractionKey;
  inventoryClass: Extract<WpInventoryClass, "reservable" | "capacity">;
  /**
   * Candidate MagiCRM resourceType.slug values (first active match wins per org).
   * Prefer tenant catalog slugs (e.g. Generations booking import) then short aliases.
   */
  resourceTypeSlugs: readonly string[];
  productSlugHint: string;
  /**
   * Guests per reservable unit when MagiCRM catalog uses PER_GUESTS.
   * Null → FIXED quantity 1 (arena / shared course / capacity area).
   */
  guestsPerUnit: number | null;
  /** Soft capacity attractions (arcade) need validation but may not hard-hold lanes. */
  requiresHoldForBooking: boolean;
  note: string;
};

export const WP_ATTRACTION_INVENTORY_MAPPINGS: readonly WpAttractionInventoryMapping[] = [
  {
    attraction: "bowling",
    inventoryClass: "reservable",
    resourceTypeSlugs: ["bowling-lane", "bowling"],
    productSlugHint: "bowling-1h",
    guestsPerUnit: 6,
    requiresHoldForBooking: true,
    note: "Finite lanes; booking confirmation requires mapped bowling inventory.",
  },
  {
    attraction: "axe",
    inventoryClass: "reservable",
    // Generations catalog uses axe-throwing-lane (8 guests/bay). Keep short aliases for other tenants.
    resourceTypeSlugs: ["axe-throwing-lane", "axe-bay", "axe-lane", "axe-throwing"],
    productSlugHint: "axe-throwing-30",
    guestsPerUnit: 8,
    requiresHoldForBooking: true,
    note: "Finite axe bays/lanes (MagiCRM catalog default 8 guests per bay).",
  },
  {
    attraction: "laser",
    inventoryClass: "reservable",
    resourceTypeSlugs: ["laser-tag-arena", "laser-arena", "laser-tag", "laser"],
    productSlugHint: "unlimited-laser-tag-90",
    guestsPerUnit: null,
    requiresHoldForBooking: true,
    note: "Arena / laser capacity resources (typically ALL_OF_TYPE / FIXED 1).",
  },
  {
    attraction: "golf",
    inventoryClass: "reservable",
    resourceTypeSlugs: ["mini-golf-course", "mini-golf", "golf"],
    productSlugHint: "wp-mini-golf",
    guestsPerUnit: null,
    requiresHoldForBooking: true,
    note: "Shared course inventory when configured.",
  },
  {
    attraction: "climbing",
    inventoryClass: "capacity",
    resourceTypeSlugs: ["climbing-area", "climbing", "climbers-cove", "climb"],
    productSlugHint: "climbers-cove-90",
    guestsPerUnit: null,
    requiresHoldForBooking: true,
    note: "Climbing area capacity.",
  },
  {
    attraction: "arcade",
    inventoryClass: "capacity",
    resourceTypeSlugs: ["arcade", "arcade-floor"],
    productSlugHint: "unlimited-arcade-1h",
    guestsPerUnit: null,
    requiresHoldForBooking: false,
    note: "Soft capacity — validate when resource type exists; Generations has no arcade resource type today.",
  },
];

export type WpPricingComponentClass = {
  keyPrefix: string;
  inventoryClass: WpInventoryClass;
  /** Optional MagiCRM resourceType.slug candidates when rooms are reservable. */
  resourceTypeSlugs?: readonly string[];
  note: string;
};

/** Non-attraction WP pricing keys by class (documentation + guard helpers). */
export const WP_PRICING_COMPONENT_CLASSES: readonly WpPricingComponentClass[] = [
  { keyPrefix: "food.", inventoryClass: "food", note: "Catering line items — not lane holds." },
  {
    keyPrefix: "rooms.lower",
    inventoryClass: "room",
    resourceTypeSlugs: ["lower-event-room"],
    note: "Lower event room — map to lower-event-room when present.",
  },
  {
    keyPrefix: "rooms.upper",
    inventoryClass: "room",
    resourceTypeSlugs: ["skybox"],
    note: "Upper / skybox party space.",
  },
  {
    keyPrefix: "rooms.cove",
    inventoryClass: "room",
    resourceTypeSlugs: ["climbing-area"],
    note: "Cove party space often tied to climbing area capacity at Generations.",
  },
  {
    keyPrefix: "rooms.",
    inventoryClass: "room",
    resourceTypeSlugs: ["lower-event-room", "skybox", "mezzanine"],
    note: "Generic private room rentals.",
  },
  {
    keyPrefix: "mezzanine.",
    inventoryClass: "room",
    resourceTypeSlugs: ["mezzanine", "skybox"],
    note: "Mezzanine rental windows (Generations catalog may also reserve skybox).",
  },
  {
    keyPrefix: "facility.",
    inventoryClass: "optional_add_on",
    resourceTypeSlugs: ["full-facility"],
    note: "Facility buyouts / location-exclusive add-ons.",
  },
  {
    keyPrefix: "bowling.shoes",
    inventoryClass: "pricing_only",
    note: "Shoe rental is pricing-only bundled with bowling.",
  },
];

export type OrgResourceTypeRow = {
  id: string;
  slug: string;
  name: string;
  inventoryConfigured: boolean;
  active: boolean;
};

/**
 * Build soft PlanResourceRequirement rows for selected WP attractions when the org
 * has matching resource types. Does not create holds.
 */
export function buildWpDraftResourceRequirements(input: {
  selectedAttractions: readonly AttractionKey[];
  guestCount: number;
  durationMinutes: number;
  resourceTypes: readonly OrgResourceTypeRow[];
}): {
  requirements: PlanResourceRequirement[];
  unmappedReservableAttractions: AttractionKey[];
  mappedAttractions: AttractionKey[];
} {
  const bySlug = new Map(
    input.resourceTypes.filter((row) => row.active).map((row) => [row.slug, row]),
  );
  const requirements: PlanResourceRequirement[] = [];
  const unmappedReservableAttractions: AttractionKey[] = [];
  const mappedAttractions: AttractionKey[] = [];

  for (const attraction of input.selectedAttractions) {
    const mapping = WP_ATTRACTION_INVENTORY_MAPPINGS.find((row) => row.attraction === attraction);
    if (!mapping) {
      continue;
    }
    const matched = mapping.resourceTypeSlugs
      .map((slug) => bySlug.get(slug))
      .find((row): row is OrgResourceTypeRow => Boolean(row));
    if (!matched) {
      if (mapping.requiresHoldForBooking) {
        unmappedReservableAttractions.push(attraction);
      }
      continue;
    }
    mappedAttractions.push(attraction);
    const guestsPerUnit = mapping.guestsPerUnit;
    const quantity =
      mapping.attraction === "bowling"
        ? Math.max(1, wpBowlingLanes(input.guestCount))
        : guestsPerUnit && guestsPerUnit > 0
          ? Math.max(1, Math.ceil(input.guestCount / guestsPerUnit))
          : 1;
    requirements.push({
      knowledgeItemId: `wp:${attraction}`,
      knowledgeItemName: attraction,
      productId: mapping.productSlugHint,
      resourceTypeId: matched.id,
      resourceTypeSlug: matched.slug,
      resourceTypeName: matched.name,
      quantityRule: guestsPerUnit ? RESOURCE_QUANTITY_RULES.PER_GUESTS : RESOURCE_QUANTITY_RULES.FIXED,
      quantity,
      guestBasedQuantity: guestsPerUnit ? quantity : null,
      guestsPerUnit,
      durationMinutes: input.durationMinutes,
      inventoryConfigured: matched.inventoryConfigured,
      requiresStaffConfiguration: !matched.inventoryConfigured,
    });
  }

  return { requirements, unmappedReservableAttractions, mappedAttractions };
}

/**
 * Attractions that must be inventory-mapped before booking confirmation.
 */
export function wpAttractionsRequiringInventoryForBooking(
  selected: readonly AttractionKey[],
): AttractionKey[] {
  return selected.filter((attraction) => {
    const mapping = WP_ATTRACTION_INVENTORY_MAPPINGS.find((row) => row.attraction === attraction);
    return Boolean(mapping?.requiresHoldForBooking);
  });
}

/** Exclusive WP room / facility rentals that require MagiCRM inventory mapping. */
export type WpExclusiveRoomKey = "lower" | "upper" | "cove" | "mezzanine" | "full";

export type WpExclusiveRoomMapping = {
  key: WpExclusiveRoomKey;
  resourceTypeSlugs: readonly string[];
  quantityRule: (typeof RESOURCE_QUANTITY_RULES)[keyof typeof RESOURCE_QUANTITY_RULES];
  productSlugHint: string;
  note: string;
};

export const WP_EXCLUSIVE_ROOM_MAPPINGS: readonly WpExclusiveRoomMapping[] = [
  {
    key: "lower",
    resourceTypeSlugs: ["lower-event-room"],
    quantityRule: RESOURCE_QUANTITY_RULES.FIXED,
    productSlugHint: "lower-event-room",
    note: "Lower Event Room — exclusive FIXED unit.",
  },
  {
    key: "upper",
    resourceTypeSlugs: ["skybox"],
    quantityRule: RESOURCE_QUANTITY_RULES.FIXED,
    productSlugHint: "skybox",
    note: "Skybox / Upper Event Room — exclusive FIXED unit.",
  },
  {
    key: "cove",
    resourceTypeSlugs: ["climbing-area"],
    quantityRule: RESOURCE_QUANTITY_RULES.FIXED,
    productSlugHint: "climbers-cove-90",
    note: "Climbers Cove gathering space — maps to climbing-area capacity unit.",
  },
  {
    key: "mezzanine",
    resourceTypeSlugs: ["mezzanine"],
    quantityRule: RESOURCE_QUANTITY_RULES.FIXED,
    productSlugHint: "mezzanine-sun-thu",
    note: "Mezzanine buyout — exclusive FIXED mezzanine unit.",
  },
  {
    key: "full",
    resourceTypeSlugs: ["full-facility"],
    quantityRule: RESOURCE_QUANTITY_RULES.LOCATION_EXCLUSIVE,
    productSlugHint: "full-facility-before-4-sun-fri",
    note: "Full facility buyout — location-exclusive.",
  },
];

const ROOM_PRICING_ONLY_LABEL =
  /extra room hour|prorated gathering-space extension|additional hour/i;

/**
 * Infer exclusive room reservations from structured WP plan fields + priced room lines.
 * Private-room preference alone does NOT create a reservation.
 * Additional-hour lines are pricing-only (do not invent a second unit).
 */
export function resolveWpExclusiveRooms(input: {
  roomIncluded: boolean;
  rentalKind?: string | null;
  rentalKinds?: readonly string[] | null;
  /** WP plan line labels (cents already in quote — used only to identify which room). */
  itemLabels?: readonly string[];
}): {
  exclusiveRooms: WpExclusiveRoomKey[];
  pricingOnlyRoomAdjustments: string[];
} {
  const kinds = new Set(
    [...(input.rentalKinds ?? []), input.rentalKind]
      .filter((value): value is string => typeof value === "string" && value.length > 0)
      .map((value) => value.toLowerCase()),
  );
  const exclusive = new Set<WpExclusiveRoomKey>();
  const pricingOnlyRoomAdjustments: string[] = [];

  if (kinds.has("full")) {
    exclusive.add("full");
  } else if (kinds.has("mezzanine")) {
    exclusive.add("mezzanine");
  }

  for (const label of input.itemLabels ?? []) {
    if (ROOM_PRICING_ONLY_LABEL.test(label)) {
      pricingOnlyRoomAdjustments.push(label);
      continue;
    }
    const lower = label.toLowerCase();
    if (/full facility/.test(lower)) {
      exclusive.add("full");
      continue;
    }
    if (/mezzanine/.test(lower)) {
      exclusive.add("mezzanine");
      continue;
    }
    if (/lower event room|lower room/.test(lower)) {
      exclusive.add("lower");
      continue;
    }
    if (/skybox|upper event room/.test(lower)) {
      exclusive.add("upper");
      continue;
    }
    if (/climbers cove|gathering space/.test(lower) && /3 hours|private/.test(lower)) {
      exclusive.add("cove");
    }
  }

  // room_included without rental kind / room lines still means exclusive use was priced in
  // a package — but only when kinds already set or labels matched. Preference-only stays empty.
  if (exclusive.size === 0 && input.roomIncluded && kinds.size > 0) {
    if (kinds.has("bowling") || kinds.has("axe") || kinds.has("laser")) {
      // Attraction exclusivity packages are not private-room rentals.
    }
  }

  // Prefer facility/mezzanine over stacked lower/upper when both appear.
  if (exclusive.has("full")) {
    exclusive.delete("lower");
    exclusive.delete("upper");
    exclusive.delete("cove");
    exclusive.delete("mezzanine");
  } else if (exclusive.has("mezzanine")) {
    exclusive.delete("lower");
    exclusive.delete("upper");
    exclusive.delete("cove");
  }

  return {
    exclusiveRooms: [...exclusive],
    pricingOnlyRoomAdjustments,
  };
}

/**
 * Soft room requirements for exclusive WP room rentals. Dedupes by resourceTypeId against
 * existing attraction requirements. Does not create holds.
 */
export function buildWpExclusiveRoomRequirements(input: {
  exclusiveRooms: readonly WpExclusiveRoomKey[];
  durationMinutes: number;
  resourceTypes: readonly OrgResourceTypeRow[];
  existingRequirements?: readonly PlanResourceRequirement[];
}): {
  requirements: PlanResourceRequirement[];
  unmappedExclusiveRooms: WpExclusiveRoomKey[];
  mappedExclusiveRooms: WpExclusiveRoomKey[];
} {
  const bySlug = new Map(
    input.resourceTypes.filter((row) => row.active).map((row) => [row.slug, row]),
  );
  const existingTypeIds = new Set(
    (input.existingRequirements ?? [])
      .map((row) => row.resourceTypeId)
      .filter((id): id is string => Boolean(id)),
  );
  const requirements: PlanResourceRequirement[] = [];
  const unmappedExclusiveRooms: WpExclusiveRoomKey[] = [];
  const mappedExclusiveRooms: WpExclusiveRoomKey[] = [];

  for (const key of input.exclusiveRooms) {
    const mapping = WP_EXCLUSIVE_ROOM_MAPPINGS.find((row) => row.key === key);
    if (!mapping) {
      continue;
    }
    const matched = mapping.resourceTypeSlugs
      .map((slug) => bySlug.get(slug))
      .find((row): row is OrgResourceTypeRow => Boolean(row));
    if (!matched) {
      unmappedExclusiveRooms.push(key);
      continue;
    }
    if (existingTypeIds.has(matched.id)) {
      // Already represented (e.g. cove → climbing-area already from climbing attraction).
      mappedExclusiveRooms.push(key);
      continue;
    }
    mappedExclusiveRooms.push(key);
    existingTypeIds.add(matched.id);
    requirements.push({
      knowledgeItemId: `wp:room:${key}`,
      knowledgeItemName: `room:${key}`,
      productId: mapping.productSlugHint,
      resourceTypeId: matched.id,
      resourceTypeSlug: matched.slug,
      resourceTypeName: matched.name,
      quantityRule: mapping.quantityRule,
      quantity: 1,
      guestBasedQuantity: null,
      guestsPerUnit: null,
      durationMinutes: input.durationMinutes,
      inventoryConfigured: matched.inventoryConfigured,
      requiresStaffConfiguration: !matched.inventoryConfigured,
      locationExclusive: mapping.quantityRule === RESOURCE_QUANTITY_RULES.LOCATION_EXCLUSIVE,
    });
  }

  return { requirements, unmappedExclusiveRooms, mappedExclusiveRooms };
}

export function wpExclusiveRoomsRequiringInventoryForBooking(
  exclusiveRooms: readonly WpExclusiveRoomKey[],
): WpExclusiveRoomKey[] {
  return [...exclusiveRooms];
}

/**
 * Resolve whether a tenant's resource types cover Generations-style WP catalog slugs.
 * Read-only helper for audits and readiness reports.
 */
export function summarizeWpInventoryCoverage(input: {
  resourceTypes: readonly OrgResourceTypeRow[];
}): {
  attractions: Array<{
    attraction: AttractionKey;
    matchedSlug: string | null;
    requiresHoldForBooking: boolean;
    covered: boolean;
  }>;
  roomsAndFacility: Array<{
    keyPrefix: string;
    matchedSlug: string | null;
    covered: boolean;
  }>;
} {
  const active = input.resourceTypes.filter((row) => row.active);
  const bySlug = new Map(active.map((row) => [row.slug, row]));
  return {
    attractions: WP_ATTRACTION_INVENTORY_MAPPINGS.map((mapping) => {
      const matched = mapping.resourceTypeSlugs.map((slug) => bySlug.get(slug)).find(Boolean);
      return {
        attraction: mapping.attraction,
        matchedSlug: matched?.slug ?? null,
        requiresHoldForBooking: mapping.requiresHoldForBooking,
        covered: Boolean(matched),
      };
    }),
    roomsAndFacility: WP_PRICING_COMPONENT_CLASSES.filter(
      (row) => row.inventoryClass === "room" || row.inventoryClass === "optional_add_on",
    ).map((row) => {
      const matched = (row.resourceTypeSlugs ?? [])
        .map((slug) => bySlug.get(slug))
        .find(Boolean);
      return {
        keyPrefix: row.keyPrefix,
        matchedSlug: matched?.slug ?? null,
        covered: Boolean(matched),
      };
    }),
  };
}
