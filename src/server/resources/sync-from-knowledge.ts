import type { PrismaClient } from "@/generated/prisma/client";

import { inferResourceTypeFromKnowledge } from "@/server/resources/requirements";
import type { PlannerKnowledgeItem } from "@/server/event-planner/build-event-plans";
import { RESOURCE_SCHEDULING_MODES } from "@/types/resource-schedule";

type SyncDb = PrismaClient;

export async function syncResourceCatalogFromKnowledge(
  database: SyncDb,
  organizationId: string,
): Promise<{ resourceTypes: number; requirements: number }> {
  const knowledge = await database.salesKnowledgeItem.findMany({
    where: { organizationId, active: true },
  });

  let resourceTypes = 0;
  let requirements = 0;

  for (const item of knowledge) {
    const inferred = inferResourceTypeFromKnowledge(item as PlannerKnowledgeItem);
    if (!inferred) {
      continue;
    }

    const resourceType = await database.resourceType.upsert({
      where: {
        organizationId_slug: { organizationId, slug: inferred.slug },
      },
      update: {
        name: inferred.name,
        defaultDurationMinutes: inferred.durationMinutes,
        schedulingMode: RESOURCE_SCHEDULING_MODES.SLOTTED,
        slotMinutes: 30,
      },
      create: {
        organizationId,
        name: inferred.name,
        slug: inferred.slug,
        schedulingMode: RESOURCE_SCHEDULING_MODES.SLOTTED,
        slotMinutes: 30,
        defaultDurationMinutes: inferred.durationMinutes,
        inventoryConfigured: false,
        active: true,
      },
    });
    resourceTypes += 1;

    await database.knowledgeResourceRequirement.upsert({
      where: {
        organizationId_salesKnowledgeItemId_resourceTypeId: {
          organizationId,
          salesKnowledgeItemId: item.id,
          resourceTypeId: resourceType.id,
        },
      },
      update: {
        quantityRule: inferred.quantityRule,
        quantity: inferred.quantityRule === "FIXED" ? 1 : null,
        guestsPerUnit: inferred.guestsPerUnit,
        durationMinutes: inferred.durationMinutes,
        requiresStaffConfiguration: inferred.requiresStaffConfiguration,
        notes: inferred.notes,
      },
      create: {
        organizationId,
        salesKnowledgeItemId: item.id,
        resourceTypeId: resourceType.id,
        quantityRule: inferred.quantityRule,
        quantity: inferred.quantityRule === "FIXED" ? 1 : null,
        guestsPerUnit: inferred.guestsPerUnit,
        durationMinutes: inferred.durationMinutes,
        requiresStaffConfiguration: inferred.requiresStaffConfiguration,
        notes: inferred.notes,
      },
    });
    requirements += 1;
  }

  const types = await database.resourceType.findMany({
    where: { organizationId },
    select: { id: true, _count: { select: { resources: true } } },
  });
  for (const type of types) {
    const configured = type._count.resources > 0;
    await database.resourceType.update({
      where: { id: type.id },
      data: { inventoryConfigured: configured },
    });
  }

  return { resourceTypes, requirements };
}
