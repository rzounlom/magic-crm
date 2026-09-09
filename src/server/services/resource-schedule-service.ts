import type { PrismaClient } from "@/generated/prisma/client";

import { requirePermission } from "@/server/policies/require-permission";
import type { RequestContext } from "@/server/request-context";
import { releaseExpiredHolds } from "@/server/services/resource-availability-service";
import {
  SCHEDULE_DAY_END_MINUTE,
  SCHEDULE_DAY_START_MINUTE,
  SCHEDULE_SLOT_MINUTES,
  RESOURCE_RESERVATION_STATUSES,
} from "@/types/resource-schedule";
import { PERMISSIONS } from "@/types/permissions";

type ScheduleDb = PrismaClient;

export async function listScheduleResourceTypes(ctx: RequestContext, database: ScheduleDb) {
  await requirePermission(ctx, PERMISSIONS.INVENTORY_VIEW, database);
  return database.resourceType.findMany({
    where: { organizationId: ctx.organizationId, active: true },
    select: {
      id: true,
      name: true,
      slug: true,
      slotMinutes: true,
      inventoryConfigured: true,
      _count: { select: { resources: { where: { active: true } } } },
    },
    orderBy: { name: "asc" },
  });
}

export async function getMasterScheduleDay(
  ctx: RequestContext,
  database: ScheduleDb,
  input: { date: string; resourceTypeId: string },
) {
  await requirePermission(ctx, PERMISSIONS.INVENTORY_VIEW, database);
  const resourceType = await database.resourceType.findFirst({
    where: {
      id: input.resourceTypeId,
      organizationId: ctx.organizationId,
      active: true,
    },
  });
  if (!resourceType) {
    return null;
  }
  await releaseExpiredHolds(database, ctx.organizationId);
  const resources = await database.resource.findMany({
    where: {
      organizationId: ctx.organizationId,
      resourceTypeId: resourceType.id,
      active: true,
    },
    orderBy: { displayOrder: "asc" },
    select: { id: true, name: true, displayOrder: true, capacity: true },
  });
  const reservations = await database.resourceReservation.findMany({
    where: {
      organizationId: ctx.organizationId,
      resourceId: { in: resources.map((row) => row.id) },
      slotDate: new Date(`${input.date}T00:00:00.000Z`),
      releasedAt: null,
      status: {
        in: [RESOURCE_RESERVATION_STATUSES.HOLD, RESOURCE_RESERVATION_STATUSES.BOOKED],
      },
      OR: [
        { status: RESOURCE_RESERVATION_STATUSES.BOOKED },
        { expiresAt: null },
        { expiresAt: { gt: new Date() } },
      ],
    },
    include: {
      inquiry: {
        select: {
          id: true,
          customerGroupName: true,
          customerFirstName: true,
          customerLastName: true,
        },
      },
    },
    orderBy: [{ startMinute: "asc" }, { resourceId: "asc" }],
  });
  const slotMinutes = resourceType.slotMinutes > 0 ? resourceType.slotMinutes : SCHEDULE_SLOT_MINUTES;
  return {
    date: input.date,
    resourceType,
    resources,
    reservations,
    slotMinutes,
    startMinute: SCHEDULE_DAY_START_MINUTE,
    endMinute: SCHEDULE_DAY_END_MINUTE,
  };
}

export function scheduleDisplayName(inquiry: {
  customerGroupName: string | null;
  customerFirstName: string | null;
  customerLastName: string | null;
} | null): string {
  if (!inquiry) {
    return "Held";
  }
  if (inquiry.customerGroupName?.trim()) {
    return inquiry.customerGroupName.trim();
  }
  const name = [inquiry.customerFirstName, inquiry.customerLastName].filter(Boolean).join(" ").trim();
  return name || "Inquiry";
}
