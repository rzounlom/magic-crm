import { PRODUCT_QUANTITY_RULES } from "@/types/catalog";
import type { PlanResourceRequirement } from "@/types/resource-schedule";
import { toPlanQuantityRule } from "@/server/resources/composite-requirements";

export type CatalogResourceRequirementRow = {
  productId: string;
  productName: string;
  resourceTypeId: string;
  resourceTypeSlug: string;
  resourceTypeName: string;
  inventoryConfigured: boolean;
  activeCount: number;
  quantityRule: string;
  quantity: number | null;
  guestsPerUnit: number | null;
  durationMinutes: number | null;
  exclusive: boolean;
  specificResourceId?: string | null;
  locationExclusive?: boolean;
};

export function deriveCatalogResourceRequirements(input: {
  productIds: string[];
  guestCount: number;
  durationMinutes: number;
  requirements: CatalogResourceRequirementRow[];
}): PlanResourceRequirement[] {
  const wanted = new Set(input.productIds);
  return input.requirements
    .filter((row) => wanted.has(row.productId))
    .map((row) => {
      const quantity = quantityForRequirement(row, input.guestCount);
      return {
        knowledgeItemId: row.productId,
        knowledgeItemName: row.productName,
        productId: row.productId,
        resourceTypeId: row.resourceTypeId,
        resourceTypeSlug: row.resourceTypeSlug,
        resourceTypeName: row.resourceTypeName,
        quantityRule: toPlanQuantityRule(row.quantityRule),
        quantity,
        guestsPerUnit: row.guestsPerUnit,
        durationMinutes: row.durationMinutes ?? input.durationMinutes,
        inventoryConfigured: row.inventoryConfigured,
        requiresStaffConfiguration: !row.inventoryConfigured || quantity == null,
        specificResourceId: row.specificResourceId ?? null,
        locationExclusive: row.locationExclusive === true || row.quantityRule === PRODUCT_QUANTITY_RULES.LOCATION_EXCLUSIVE,
      };
    });
}

export function quantityForRequirement(
  row: Pick<
    CatalogResourceRequirementRow,
    "quantityRule" | "quantity" | "guestsPerUnit" | "activeCount" | "locationExclusive"
  >,
  guestCount: number,
): number | null {
  if (row.quantityRule === PRODUCT_QUANTITY_RULES.PER_GUESTS) {
    if (!row.guestsPerUnit || row.guestsPerUnit < 1) {
      return null;
    }
    return Math.max(1, Math.ceil(guestCount / row.guestsPerUnit));
  }
  if (row.quantityRule === PRODUCT_QUANTITY_RULES.ALL_OF_TYPE) {
    return row.activeCount > 0 ? row.activeCount : null;
  }
  if (row.quantityRule === PRODUCT_QUANTITY_RULES.SPECIFIC_RESOURCE) {
    return 1;
  }
  if (row.quantityRule === PRODUCT_QUANTITY_RULES.LOCATION_EXCLUSIVE || row.locationExclusive) {
    return 1;
  }
  if (!row.quantity || row.quantity <= 0) {
    return null;
  }
  return row.quantity;
}
