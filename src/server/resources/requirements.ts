import {
  isLaneLike,
  isSpaceItem,
  type PlannerKnowledgeItem,
} from "@/server/event-planner/build-event-plans";
import type { EventPlanActivity, EventPlanSpace } from "@/types/event-planner";
import {
  RESOURCE_QUANTITY_RULES,
  type PlanResourceRequirement,
  type ResourceQuantityRule,
} from "@/types/resource-schedule";

export type InferredResourceType = {
  slug: string;
  name: string;
  quantityRule: ResourceQuantityRule;
  guestsPerUnit: number | null;
  durationMinutes: number | null;
  requiresStaffConfiguration: boolean;
  notes: string | null;
};

const MOBILE_PATTERN = /\bmobile\b/i;

export function inferResourceTypeFromKnowledge(item: PlannerKnowledgeItem): InferredResourceType | null {
  const text = [item.name, item.shortDescription, item.details].join("\n");
  if (MOBILE_PATTERN.test(text)) {
    return null;
  }

  if (/bowling/i.test(item.name) || (isLaneLike(item) && /bowl/i.test(text))) {
    const perLane = item.maxGuests && item.maxGuests > 0 ? item.maxGuests : null;
    return {
      slug: "bowling-lane",
      name: "Bowling Lane",
      quantityRule: perLane ? RESOURCE_QUANTITY_RULES.PER_GUESTS : RESOURCE_QUANTITY_RULES.UNKNOWN,
      guestsPerUnit: perLane,
      durationMinutes: item.durationMinutes,
      requiresStaffConfiguration: perLane == null,
      notes: perLane
        ? `Published knowledge allows up to ${perLane} guests per lane. Lane count is not published.`
        : "Bowling appears finite, but per-lane capacity is not published.",
    };
  }

  if (/axe throw/i.test(item.name) || /\baxe\b/i.test(item.name)) {
    return {
      slug: "axe-throwing-lane",
      name: "Axe Throwing Lane",
      quantityRule: RESOURCE_QUANTITY_RULES.UNKNOWN,
      guestsPerUnit: null,
      durationMinutes: item.durationMinutes,
      requiresStaffConfiguration: true,
      notes: "Axe throwing is treated as finite inventory. Lane count and per-lane capacity are not published.",
    };
  }

  if (isSpaceItem(item)) {
    const party = /party room/i.test(text);
    return {
      slug: party && !/private event/i.test(item.name) ? "party-room" : "private-event-room",
      name: party && !/private event/i.test(item.name) ? "Party Room" : "Private Event Room",
      quantityRule: RESOURCE_QUANTITY_RULES.FIXED,
      guestsPerUnit: item.maxGuests,
      durationMinutes: item.durationMinutes,
      requiresStaffConfiguration: !item.maxGuests,
      notes: item.maxGuests
        ? null
        : "Room inventory count is not published and must be configured by an administrator.",
    };
  }

  return null;
}

export function resolveRequirementQuantity(input: {
  quantityRule: ResourceQuantityRule;
  guestsPerUnit: number | null;
  guestCount: number;
  activityQuantity: number | null;
}): number | null {
  if (input.quantityRule === RESOURCE_QUANTITY_RULES.UNKNOWN) {
    return null;
  }
  if (input.quantityRule === RESOURCE_QUANTITY_RULES.FIXED) {
    return Math.max(1, input.activityQuantity ?? 1);
  }
  if (input.guestsPerUnit && input.guestsPerUnit > 0) {
    return Math.max(1, Math.ceil(input.guestCount / input.guestsPerUnit));
  }
  if (input.activityQuantity && input.activityQuantity > 0) {
    return input.activityQuantity;
  }
  return null;
}

export type StoredKnowledgeResourceRequirement = {
  salesKnowledgeItemId: string;
  resourceTypeId: string;
  resourceTypeSlug: string;
  resourceTypeName: string;
  inventoryConfigured: boolean;
  quantityRule: ResourceQuantityRule;
  quantity: number | null;
  guestsPerUnit: number | null;
  durationMinutes: number | null;
  requiresStaffConfiguration: boolean;
};

function requirementFromStored(
  item: PlannerKnowledgeItem,
  stored: StoredKnowledgeResourceRequirement,
  guestCount: number,
  fallbackDurationMinutes: number,
  activityQuantity: number | null,
): PlanResourceRequirement {
  const quantity =
    stored.quantityRule === RESOURCE_QUANTITY_RULES.FIXED
      ? (stored.quantity ?? Math.max(1, activityQuantity ?? 1))
      : resolveRequirementQuantity({
          quantityRule: stored.quantityRule,
          guestsPerUnit: stored.guestsPerUnit,
          guestCount,
          activityQuantity,
        });
  return {
    knowledgeItemId: item.id,
    knowledgeItemName: item.name,
    resourceTypeId: stored.resourceTypeId,
    resourceTypeSlug: stored.resourceTypeSlug,
    resourceTypeName: stored.resourceTypeName,
    quantityRule: stored.quantityRule,
    quantity,
    guestsPerUnit: stored.guestsPerUnit,
    durationMinutes: stored.durationMinutes ?? fallbackDurationMinutes,
    inventoryConfigured: stored.inventoryConfigured,
    requiresStaffConfiguration: stored.requiresStaffConfiguration || !stored.inventoryConfigured,
  };
}

function requirementFromInference(
  item: PlannerKnowledgeItem,
  inferred: InferredResourceType,
  catalog: { id: string; slug: string; name: string; inventoryConfigured: boolean } | undefined,
  guestCount: number,
  fallbackDurationMinutes: number,
  activityQuantity: number | null,
): PlanResourceRequirement {
  return {
    knowledgeItemId: item.id,
    knowledgeItemName: item.name,
    resourceTypeId: catalog?.id ?? null,
    resourceTypeSlug: inferred.slug,
    resourceTypeName: catalog?.name ?? inferred.name,
    quantityRule: inferred.quantityRule,
    quantity: resolveRequirementQuantity({
      quantityRule: inferred.quantityRule,
      guestsPerUnit: inferred.guestsPerUnit,
      guestCount,
      activityQuantity,
    }),
    guestsPerUnit: inferred.guestsPerUnit,
    durationMinutes: inferred.durationMinutes ?? fallbackDurationMinutes,
    inventoryConfigured: catalog?.inventoryConfigured === true,
    requiresStaffConfiguration: inferred.requiresStaffConfiguration || catalog?.inventoryConfigured !== true,
  };
}

export function derivePlanResourceRequirements(input: {
  activities: EventPlanActivity[];
  spaces: EventPlanSpace[];
  guestCount: number;
  durationMinutes: number;
  knowledge: PlannerKnowledgeItem[];
  catalog?: Array<{
    id: string;
    slug: string;
    name: string;
    inventoryConfigured: boolean;
  }>;
  storedRequirements?: StoredKnowledgeResourceRequirement[];
}): PlanResourceRequirement[] {
  const byId = new Map(input.knowledge.map((item) => [item.id, item]));
  const catalogBySlug = new Map((input.catalog ?? []).map((row) => [row.slug, row]));
  const storedByItemId = new Map(
    (input.storedRequirements ?? []).map((row) => [row.salesKnowledgeItemId, row]),
  );
  const rows: PlanResourceRequirement[] = [];

  const pushFor = (knowledgeItemId: string, activityQuantity: number | null) => {
    const item = byId.get(knowledgeItemId);
    if (!item) {
      return;
    }
    const stored = storedByItemId.get(item.id);
    if (stored) {
      rows.push(
        requirementFromStored(item, stored, input.guestCount, input.durationMinutes, activityQuantity),
      );
      return;
    }
    const inferred = inferResourceTypeFromKnowledge(item);
    if (!inferred) {
      return;
    }
    rows.push(
      requirementFromInference(
        item,
        inferred,
        catalogBySlug.get(inferred.slug),
        input.guestCount,
        input.durationMinutes,
        activityQuantity,
      ),
    );
  };

  for (const activity of input.activities) {
    pushFor(activity.knowledgeItemId, activity.quantity);
  }
  for (const space of input.spaces) {
    pushFor(space.knowledgeItemId, 1);
  }

  return rows;
}
