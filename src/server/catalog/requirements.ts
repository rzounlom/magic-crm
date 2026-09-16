import { PRODUCT_QUANTITY_RULES } from "@/types/catalog";
import { RESOURCE_QUANTITY_RULES, type PlanResourceRequirement } from "@/types/resource-schedule";

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
        quantityRule:
          row.quantityRule === PRODUCT_QUANTITY_RULES.ALL_OF_TYPE
            ? RESOURCE_QUANTITY_RULES.ALL_OF_TYPE
            : row.quantityRule === PRODUCT_QUANTITY_RULES.PER_GUESTS
              ? RESOURCE_QUANTITY_RULES.PER_GUESTS
              : RESOURCE_QUANTITY_RULES.FIXED,
        quantity,
        guestsPerUnit: row.guestsPerUnit,
        durationMinutes: row.durationMinutes ?? input.durationMinutes,
        inventoryConfigured: row.inventoryConfigured,
        requiresStaffConfiguration: !row.inventoryConfigured || quantity == null,
      };
    });
}

export function quantityForRequirement(
  row: Pick<CatalogResourceRequirementRow, "quantityRule" | "quantity" | "guestsPerUnit" | "activeCount">,
  guestCount: number,
): number | null {
  if (row.quantityRule === PRODUCT_QUANTITY_RULES.PER_GUESTS) {
    if (!row.guestsPerUnit || row.guestsPerUnit < 1) {
      return null;
    }
    return Math.max(1, Math.ceil(guestCount / row.guestsPerUnit));
  }
  if (row.quantityRule === PRODUCT_QUANTITY_RULES.ALL_OF_TYPE) {
    return Math.max(1, row.activeCount);
  }
  return Math.max(1, row.quantity ?? 1);
}
