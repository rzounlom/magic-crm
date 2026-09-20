import type { PlanResourceRequirement } from "@/types/resource-schedule";
import { RESOURCE_QUANTITY_RULES } from "@/types/resource-schedule";
import { isExactAllocationRule } from "@/server/resources/composite-requirements";

export type InventoryCount = {
  id: string;
  activeCount: number;
};

export function applyInventoryFeasibility(
  requirements: PlanResourceRequirement[],
  inventory: InventoryCount[],
): PlanResourceRequirement[] {
  const counts = new Map(inventory.map((row) => [row.id, row.activeCount]));
  return requirements.map((requirement) => {
    if (!requirement.resourceTypeId || requirement.quantity == null) {
      return requirement;
    }
    if (
      requirement.quantityRule !== RESOURCE_QUANTITY_RULES.PER_GUESTS
      || isExactAllocationRule(requirement)
    ) {
      return requirement;
    }
    const activeCount = counts.get(requirement.resourceTypeId);
    if (activeCount == null || activeCount <= 0 || requirement.inventoryConfigured !== true) {
      return requirement;
    }
    const guestBased = requirement.guestBasedQuantity ?? requirement.quantity;
    if (requirement.quantity <= activeCount) {
      return {
        ...requirement,
        guestBasedQuantity: guestBased,
        rotationWaves: null,
        rotationNote: null,
      };
    }
    const waves = Math.ceil(guestBased / activeCount);
    return {
      ...requirement,
      guestBasedQuantity: guestBased,
      quantity: activeCount,
      rotationWaves: waves,
      rotationNote: `${guestBased} ${requirement.resourceTypeName}${guestBased === 1 ? "" : "s"} would be needed at once. Using ${activeCount} in ${waves} rotations.`,
    };
  });
}
