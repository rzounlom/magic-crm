import { Prisma, type PrismaClient } from "@/generated/prisma/client";

import { ResourceError } from "@/server/errors";
import { requirePermission } from "@/server/policies/require-permission";
import type { RequestContext } from "@/server/request-context";
import {
  numberedResourceNames,
  resourceMetadata,
  resourceTypeSlugFromName,
} from "@/server/resources/naming";
import { recordAuditEvent } from "@/server/services/audit";
import { PERMISSIONS } from "@/types/permissions";
import {
  MAX_BULK_RESOURCES,
  RESOURCE_QUANTITY_RULES,
  RESOURCE_SCHEDULING_MODES,
  type ResourceQuantityRule,
  type ResourceSchedulingMode,
} from "@/types/resource-schedule";

type ResourceDb = PrismaClient;

function isSchedulingMode(value: string): value is ResourceSchedulingMode {
  return (Object.values(RESOURCE_SCHEDULING_MODES) as string[]).includes(value);
}

function isQuantityRule(value: string): value is ResourceQuantityRule {
  return (Object.values(RESOURCE_QUANTITY_RULES) as string[]).includes(value);
}

async function refreshInventoryConfigured(database: ResourceDb, organizationId: string, resourceTypeId: string) {
  const activeCount = await database.resource.count({
    where: { organizationId, resourceTypeId, active: true },
  });
  await database.resourceType.update({
    where: { id: resourceTypeId },
    data: { inventoryConfigured: activeCount > 0 },
  });
}

export async function listResourceTypesForAdmin(ctx: RequestContext, database: ResourceDb) {
  await requirePermission(ctx, PERMISSIONS.INVENTORY_MANAGE, database);
  return database.resourceType.findMany({
    where: { organizationId: ctx.organizationId },
    include: {
      _count: {
        select: {
          resources: { where: { active: true } },
          requirements: true,
        },
      },
      requirements: {
        include: {
          salesKnowledgeItem: { select: { id: true, name: true, active: true } },
        },
      },
    },
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });
}

export async function getResourceTypeForAdmin(
  ctx: RequestContext,
  database: ResourceDb,
  resourceTypeId: string,
) {
  await requirePermission(ctx, PERMISSIONS.INVENTORY_MANAGE, database);
  return database.resourceType.findFirst({
    where: { id: resourceTypeId, organizationId: ctx.organizationId },
    include: {
      resources: { orderBy: { displayOrder: "asc" } },
      requirements: {
        include: {
          salesKnowledgeItem: {
            select: { id: true, name: true, type: true, active: true, maxGuests: true },
          },
        },
      },
    },
  });
}

export async function listKnowledgeItemsForResourceLink(
  ctx: RequestContext,
  database: ResourceDb,
) {
  await requirePermission(ctx, PERMISSIONS.INVENTORY_MANAGE, database);
  return database.salesKnowledgeItem.findMany({
    where: { organizationId: ctx.organizationId, active: true },
    select: { id: true, name: true, type: true },
    orderBy: { name: "asc" },
  });
}

export async function createResourceType(
  ctx: RequestContext,
  database: ResourceDb,
  input: {
    name: string;
    slug?: string;
    schedulingMode?: string;
    slotMinutes?: number;
    defaultDurationMinutes?: number | null;
    bufferBeforeMinutes?: number;
    bufferAfterMinutes?: number;
  },
) {
  await requirePermission(ctx, PERMISSIONS.INVENTORY_MANAGE, database);
  const name = input.name.trim();
  if (!name || name.length > 120) {
    throw new ResourceError("INVALID_RESOURCE", "Enter a resource type name.");
  }
  const slug = (input.slug?.trim() || resourceTypeSlugFromName(name)).slice(0, 80);
  const schedulingMode = input.schedulingMode && isSchedulingMode(input.schedulingMode)
    ? input.schedulingMode
    : RESOURCE_SCHEDULING_MODES.SLOTTED;
  try {
    const created = await database.resourceType.create({
      data: {
        organizationId: ctx.organizationId,
        name,
        slug,
        schedulingMode,
        slotMinutes: input.slotMinutes && input.slotMinutes > 0 ? input.slotMinutes : 30,
        defaultDurationMinutes: input.defaultDurationMinutes ?? null,
        bufferBeforeMinutes: input.bufferBeforeMinutes ?? 0,
        bufferAfterMinutes: input.bufferAfterMinutes ?? 0,
        inventoryConfigured: false,
        active: true,
      },
    });
    await recordAuditEvent(database, {
      organizationId: ctx.organizationId,
      actorUserProfileId: ctx.userId,
      action: "resource_type.created",
      resourceType: "resource_type",
      resourceId: created.id,
      metadata: { name: created.name, slug: created.slug },
    });
    return created;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new ResourceError("INVALID_RESOURCE", "A resource type with that name or slug already exists.");
    }
    throw error;
  }
}

export async function updateResourceType(
  ctx: RequestContext,
  database: ResourceDb,
  resourceTypeId: string,
  input: {
    name: string;
    schedulingMode?: string;
    slotMinutes?: number;
    defaultDurationMinutes?: number | null;
    bufferBeforeMinutes?: number;
    bufferAfterMinutes?: number;
    active: boolean;
  },
) {
  await requirePermission(ctx, PERMISSIONS.INVENTORY_MANAGE, database);
  const existing = await database.resourceType.findFirst({
    where: { id: resourceTypeId, organizationId: ctx.organizationId },
  });
  if (!existing) {
    throw new ResourceError("RESOURCE_NOT_FOUND");
  }
  const name = input.name.trim();
  if (!name || name.length > 120) {
    throw new ResourceError("INVALID_RESOURCE", "Enter a resource type name.");
  }
  const updated = await database.resourceType.update({
    where: { id: existing.id },
    data: {
      name,
      schedulingMode:
        input.schedulingMode && isSchedulingMode(input.schedulingMode)
          ? input.schedulingMode
          : existing.schedulingMode,
      slotMinutes: input.slotMinutes && input.slotMinutes > 0 ? input.slotMinutes : existing.slotMinutes,
      defaultDurationMinutes: input.defaultDurationMinutes ?? null,
      bufferBeforeMinutes: input.bufferBeforeMinutes ?? existing.bufferBeforeMinutes,
      bufferAfterMinutes: input.bufferAfterMinutes ?? existing.bufferAfterMinutes,
      active: input.active,
    },
  });
  await recordAuditEvent(database, {
    organizationId: ctx.organizationId,
    actorUserProfileId: ctx.userId,
    action: "resource_type.updated",
    resourceType: "resource_type",
    resourceId: updated.id,
    metadata: { name: updated.name, active: updated.active },
  });
  return updated;
}

export async function createResource(
  ctx: RequestContext,
  database: ResourceDb,
  input: {
    resourceTypeId: string;
    name: string;
    displayOrder?: number;
    capacity?: number | null;
    capacityKind?: "per_unit" | "occupancy" | null;
    notes?: string | null;
    active?: boolean;
  },
) {
  await requirePermission(ctx, PERMISSIONS.INVENTORY_MANAGE, database);
  const type = await database.resourceType.findFirst({
    where: { id: input.resourceTypeId, organizationId: ctx.organizationId },
  });
  if (!type) {
    throw new ResourceError("RESOURCE_NOT_FOUND");
  }
  const name = input.name.trim();
  if (!name || name.length > 120) {
    throw new ResourceError("INVALID_RESOURCE", "Enter a resource name.");
  }
  const maxOrder = await database.resource.aggregate({
    where: { organizationId: ctx.organizationId, resourceTypeId: type.id },
    _max: { displayOrder: true },
  });
  const created = await database.resource.create({
    data: {
      organizationId: ctx.organizationId,
      resourceTypeId: type.id,
      name,
      displayOrder: input.displayOrder ?? (maxOrder._max.displayOrder ?? 0) + 1,
      capacity: input.capacity ?? null,
      active: input.active !== false,
      metadata: resourceMetadata({ notes: input.notes, capacityKind: input.capacityKind }),
    },
  });
  await refreshInventoryConfigured(database, ctx.organizationId, type.id);
  await recordAuditEvent(database, {
    organizationId: ctx.organizationId,
    actorUserProfileId: ctx.userId,
    action: "resource.created",
    resourceType: "resource",
    resourceId: created.id,
    metadata: { name: created.name, resourceTypeId: type.id },
  });
  return created;
}

export async function bulkCreateResources(
  ctx: RequestContext,
  database: ResourceDb,
  input: {
    resourceTypeId: string;
    count: number;
    namePattern: string;
    capacity?: number | null;
    capacityKind?: "per_unit" | "occupancy" | null;
  },
) {
  await requirePermission(ctx, PERMISSIONS.INVENTORY_MANAGE, database);
  const type = await database.resourceType.findFirst({
    where: { id: input.resourceTypeId, organizationId: ctx.organizationId },
  });
  if (!type) {
    throw new ResourceError("RESOURCE_NOT_FOUND");
  }
  const count = Math.min(MAX_BULK_RESOURCES, Math.floor(input.count));
  if (count < 1) {
    throw new ResourceError("INVALID_RESOURCE", "Enter how many resources to create.");
  }
  const maxOrder = await database.resource.aggregate({
    where: { organizationId: ctx.organizationId, resourceTypeId: type.id },
    _max: { displayOrder: true },
  });
  const startAt = (maxOrder._max.displayOrder ?? 0) + 1;
  const names = numberedResourceNames(input.namePattern || `${type.name} {n}`, count, startAt);
  const created = await database.resource.createMany({
    data: names.map((name, index) => ({
      organizationId: ctx.organizationId,
      resourceTypeId: type.id,
      name,
      displayOrder: startAt + index,
      capacity: input.capacity ?? null,
      active: true,
      metadata: resourceMetadata({ capacityKind: input.capacityKind }),
    })),
  });
  await refreshInventoryConfigured(database, ctx.organizationId, type.id);
  await recordAuditEvent(database, {
    organizationId: ctx.organizationId,
    actorUserProfileId: ctx.userId,
    action: "resource.created",
    resourceType: "resource_type",
    resourceId: type.id,
    metadata: { bulkCount: created.count, namePattern: input.namePattern },
  });
  return created.count;
}

export async function updateResource(
  ctx: RequestContext,
  database: ResourceDb,
  resourceId: string,
  input: {
    name: string;
    displayOrder?: number;
    capacity?: number | null;
    capacityKind?: "per_unit" | "occupancy" | null;
    notes?: string | null;
    active: boolean;
  },
) {
  await requirePermission(ctx, PERMISSIONS.INVENTORY_MANAGE, database);
  const existing = await database.resource.findFirst({
    where: { id: resourceId, organizationId: ctx.organizationId },
  });
  if (!existing) {
    throw new ResourceError("RESOURCE_NOT_FOUND");
  }
  const name = input.name.trim();
  if (!name || name.length > 120) {
    throw new ResourceError("INVALID_RESOURCE", "Enter a resource name.");
  }
  const updated = await database.resource.update({
    where: { id: existing.id },
    data: {
      name,
      displayOrder: input.displayOrder ?? existing.displayOrder,
      capacity: input.capacity ?? null,
      active: input.active,
      metadata: resourceMetadata({ notes: input.notes, capacityKind: input.capacityKind }),
    },
  });
  await refreshInventoryConfigured(database, ctx.organizationId, existing.resourceTypeId);
  await recordAuditEvent(database, {
    organizationId: ctx.organizationId,
    actorUserProfileId: ctx.userId,
    action: input.active ? "resource.updated" : "resource.deactivated",
    resourceType: "resource",
    resourceId: updated.id,
    metadata: { name: updated.name, active: updated.active },
  });
  return updated;
}

export async function upsertKnowledgeResourceRequirement(
  ctx: RequestContext,
  database: ResourceDb,
  input: {
    salesKnowledgeItemId: string;
    resourceTypeId: string;
    quantityRule: string;
    quantity?: number | null;
    guestsPerUnit?: number | null;
    durationMinutes?: number | null;
    requiresStaffConfiguration: boolean;
    notes?: string | null;
  },
) {
  await requirePermission(ctx, PERMISSIONS.INVENTORY_MANAGE, database);
  const [item, type] = await Promise.all([
    database.salesKnowledgeItem.findFirst({
      where: { id: input.salesKnowledgeItemId, organizationId: ctx.organizationId },
    }),
    database.resourceType.findFirst({
      where: { id: input.resourceTypeId, organizationId: ctx.organizationId },
    }),
  ]);
  if (!item || !type) {
    throw new ResourceError("RESOURCE_NOT_FOUND");
  }
  if (!isQuantityRule(input.quantityRule)) {
    throw new ResourceError("INVALID_RESOURCE", "Choose a quantity rule.");
  }
  const row = await database.knowledgeResourceRequirement.upsert({
    where: {
      organizationId_salesKnowledgeItemId_resourceTypeId: {
        organizationId: ctx.organizationId,
        salesKnowledgeItemId: item.id,
        resourceTypeId: type.id,
      },
    },
    update: {
      quantityRule: input.quantityRule,
      quantity: input.quantityRule === RESOURCE_QUANTITY_RULES.FIXED ? (input.quantity ?? 1) : null,
      guestsPerUnit:
        input.quantityRule === RESOURCE_QUANTITY_RULES.PER_GUESTS ? (input.guestsPerUnit ?? null) : null,
      durationMinutes: input.durationMinutes ?? null,
      requiresStaffConfiguration:
        input.requiresStaffConfiguration || input.quantityRule === RESOURCE_QUANTITY_RULES.UNKNOWN,
      notes: input.notes?.trim() || null,
    },
    create: {
      organizationId: ctx.organizationId,
      salesKnowledgeItemId: item.id,
      resourceTypeId: type.id,
      quantityRule: input.quantityRule,
      quantity: input.quantityRule === RESOURCE_QUANTITY_RULES.FIXED ? (input.quantity ?? 1) : null,
      guestsPerUnit:
        input.quantityRule === RESOURCE_QUANTITY_RULES.PER_GUESTS ? (input.guestsPerUnit ?? null) : null,
      durationMinutes: input.durationMinutes ?? null,
      requiresStaffConfiguration:
        input.requiresStaffConfiguration || input.quantityRule === RESOURCE_QUANTITY_RULES.UNKNOWN,
      notes: input.notes?.trim() || null,
    },
  });
  await recordAuditEvent(database, {
    organizationId: ctx.organizationId,
    actorUserProfileId: ctx.userId,
    action: "knowledge_requirement.updated",
    resourceType: "knowledge_resource_requirement",
    resourceId: row.id,
    metadata: { salesKnowledgeItemId: item.id, resourceTypeId: type.id, quantityRule: input.quantityRule },
  });
  return row;
}
