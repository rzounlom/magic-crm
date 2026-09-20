import { PRODUCT_QUANTITY_RULES } from "@/types/catalog";
import {
  isAllOfTypeRule,
  isLocationExclusiveRule,
  isSpecificResourceRule,
} from "@/server/resources/composite-requirements";

export type CatalogRequirementDraft = {
  resourceTypeSlug: string;
  quantityRule: string;
  quantity?: number | null;
  guestsPerUnit?: number | null;
  resourceName?: string | null;
};

export type CatalogRequirementInventory = {
  slug: string;
  activeCount: number;
  resources: Array<{
    id: string;
    name: string;
    locationId: string | null;
  }>;
};

export function validateCatalogProductRequirements(input: {
  productSlug: string;
  requirements: CatalogRequirementDraft[];
  inventoryBySlug: Map<string, CatalogRequirementInventory>;
  locationId: string | null;
}): Array<{ resourceTypeSlug: string; resourceId: string | null }> {
  const seen = new Set<string>();
  const exclusive = input.requirements.filter((row) => isLocationExclusiveRule(row.quantityRule));
  if (exclusive.length > 0 && input.requirements.length > 1) {
    throw new Error(
      `Product "${input.productSlug}" cannot combine LOCATION_EXCLUSIVE with other resource requirements.`,
    );
  }
  return input.requirements.map((requirement) => {
    if (seen.has(requirement.resourceTypeSlug)) {
      throw new Error(
        `Product "${input.productSlug}" has duplicate requirements for "${requirement.resourceTypeSlug}".`,
      );
    }
    seen.add(requirement.resourceTypeSlug);
    const inventory = input.inventoryBySlug.get(requirement.resourceTypeSlug);
    if (!inventory) {
      throw new Error(
        `Product "${input.productSlug}" references unknown resource type "${requirement.resourceTypeSlug}".`,
      );
    }
    if (requirement.quantityRule === PRODUCT_QUANTITY_RULES.FIXED) {
      if (!requirement.quantity || requirement.quantity <= 0) {
        throw new Error(`Product "${input.productSlug}" FIXED quantity must be greater than 0.`);
      }
      if (requirement.quantity > inventory.activeCount) {
        throw new Error(
          `Product "${input.productSlug}" requests ${requirement.quantity} ${requirement.resourceTypeSlug} units but only ${inventory.activeCount} are configured.`,
        );
      }
    }
    if (isAllOfTypeRule(requirement.quantityRule) && inventory.activeCount < 1) {
      throw new Error(
        `Product "${input.productSlug}" ALL_OF_TYPE "${requirement.resourceTypeSlug}" has zero active resources.`,
      );
    }
    if (isLocationExclusiveRule(requirement.quantityRule) && inventory.activeCount < 1) {
      throw new Error(
        `Product "${input.productSlug}" LOCATION_EXCLUSIVE marker type "${requirement.resourceTypeSlug}" has zero active resources.`,
      );
    }
    if (!isSpecificResourceRule(requirement.quantityRule)) {
      return { resourceTypeSlug: requirement.resourceTypeSlug, resourceId: null };
    }
    const name = requirement.resourceName?.trim();
    if (!name) {
      throw new Error(`Product "${input.productSlug}" SPECIFIC_RESOURCE requires resourceName.`);
    }
    const matches = inventory.resources.filter((row) => row.name === name);
    if (matches.length !== 1) {
      throw new Error(
        `Product "${input.productSlug}" SPECIFIC_RESOURCE "${name}" was not found as a unique ${requirement.resourceTypeSlug} unit.`,
      );
    }
    const resource = matches[0]!;
    if (input.locationId && resource.locationId && resource.locationId !== input.locationId) {
      throw new Error(
        `Product "${input.productSlug}" SPECIFIC_RESOURCE "${name}" belongs to another location.`,
      );
    }
    return { resourceTypeSlug: requirement.resourceTypeSlug, resourceId: resource.id };
  });
}
