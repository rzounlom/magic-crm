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
  /** Candidate MagiCRM resourceType.slug values (first match wins per org). */
  resourceTypeSlugs: readonly string[];
  productSlugHint: string;
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
    requiresHoldForBooking: true,
    note: "Finite lanes; booking confirmation requires mapped bowling inventory.",
  },
  {
    attraction: "axe",
    inventoryClass: "reservable",
    resourceTypeSlugs: ["axe-bay", "axe-lane", "axe-throwing"],
    productSlugHint: "axe-throwing-30",
    requiresHoldForBooking: true,
    note: "Finite axe bays/lanes.",
  },
  {
    attraction: "laser",
    inventoryClass: "reservable",
    resourceTypeSlugs: ["laser-arena", "laser-tag", "laser"],
    productSlugHint: "unlimited-laser-tag-90",
    requiresHoldForBooking: true,
    note: "Arena / laser capacity resources.",
  },
  {
    attraction: "golf",
    inventoryClass: "reservable",
    resourceTypeSlugs: ["mini-golf", "mini-golf-course", "golf"],
    productSlugHint: "wp-mini-golf",
    requiresHoldForBooking: true,
    note: "Course / hole inventory when configured.",
  },
  {
    attraction: "climbing",
    inventoryClass: "capacity",
    resourceTypeSlugs: ["climbing", "climbers-cove", "climb"],
    productSlugHint: "climbers-cove-90",
    requiresHoldForBooking: true,
    note: "Climbing area capacity.",
  },
  {
    attraction: "arcade",
    inventoryClass: "capacity",
    resourceTypeSlugs: ["arcade", "arcade-floor"],
    productSlugHint: "unlimited-arcade-1h",
    requiresHoldForBooking: false,
    note: "Soft capacity — validate when resource type exists; hold optional.",
  },
];

export type WpPricingComponentClass = {
  keyPrefix: string;
  inventoryClass: WpInventoryClass;
  note: string;
};

/** Non-attraction WP pricing keys by class (documentation + guard helpers). */
export const WP_PRICING_COMPONENT_CLASSES: readonly WpPricingComponentClass[] = [
  { keyPrefix: "food.", inventoryClass: "food", note: "Catering line items — not lane holds." },
  { keyPrefix: "rooms.", inventoryClass: "room", note: "Event rooms — map to room resource types when present." },
  { keyPrefix: "mezzanine.", inventoryClass: "room", note: "Mezzanine rental windows." },
  { keyPrefix: "facility.", inventoryClass: "optional_add_on", note: "Facility buyouts / add-ons." },
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
    const guestsPerUnit =
      mapping.attraction === "bowling" ? 6 : mapping.attraction === "axe" ? 4 : null;
    const quantity =
      guestsPerUnit && guestsPerUnit > 0
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
