import { PRODUCT_QUANTITY_RULES } from "@/types/catalog";
import { RESOURCE_QUANTITY_RULES, type PlanResourceRequirement } from "@/types/resource-schedule";

export function isLocationExclusiveRule(quantityRule: string | null | undefined): boolean {
  return quantityRule === PRODUCT_QUANTITY_RULES.LOCATION_EXCLUSIVE
    || quantityRule === RESOURCE_QUANTITY_RULES.LOCATION_EXCLUSIVE;
}

export function isSpecificResourceRule(quantityRule: string | null | undefined): boolean {
  return quantityRule === PRODUCT_QUANTITY_RULES.SPECIFIC_RESOURCE
    || quantityRule === RESOURCE_QUANTITY_RULES.SPECIFIC_RESOURCE;
}

export function isAllOfTypeRule(quantityRule: string | null | undefined): boolean {
  return quantityRule === PRODUCT_QUANTITY_RULES.ALL_OF_TYPE
    || quantityRule === RESOURCE_QUANTITY_RULES.ALL_OF_TYPE;
}

/** Rules that must not be silently reduced into rotations or partial quantities. */
export function isExactAllocationRule(requirement: Pick<PlanResourceRequirement, "quantityRule" | "specificResourceId" | "locationExclusive">): boolean {
  return (
    requirement.locationExclusive === true
    || isLocationExclusiveRule(requirement.quantityRule)
    || isSpecificResourceRule(requirement.quantityRule)
    || isAllOfTypeRule(requirement.quantityRule)
    || Boolean(requirement.specificResourceId)
  );
}

export function toPlanQuantityRule(quantityRule: string): PlanResourceRequirement["quantityRule"] {
  if (quantityRule === PRODUCT_QUANTITY_RULES.ALL_OF_TYPE) {
    return RESOURCE_QUANTITY_RULES.ALL_OF_TYPE;
  }
  if (quantityRule === PRODUCT_QUANTITY_RULES.PER_GUESTS) {
    return RESOURCE_QUANTITY_RULES.PER_GUESTS;
  }
  if (quantityRule === PRODUCT_QUANTITY_RULES.SPECIFIC_RESOURCE) {
    return RESOURCE_QUANTITY_RULES.SPECIFIC_RESOURCE;
  }
  if (quantityRule === PRODUCT_QUANTITY_RULES.LOCATION_EXCLUSIVE) {
    return RESOURCE_QUANTITY_RULES.LOCATION_EXCLUSIVE;
  }
  return RESOURCE_QUANTITY_RULES.FIXED;
}
