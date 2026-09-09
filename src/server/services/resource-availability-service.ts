import { Prisma, type PrismaClient } from "@/generated/prisma/client";

import { localEventWindow } from "@/server/resources/time-window";
import type { PlanAvailabilityProvider } from "@/server/event-planner/availability";
import { recordAuditEvent } from "@/server/services/audit";
import {
  RESOURCE_RESERVATION_STATUSES,
  type ResourceAvailabilityRequest,
  type ResourceAvailabilityResult,
  type ResourceTypeAvailability,
} from "@/types/resource-schedule";

type ScheduleDb = PrismaClient;

const UNVALIDATED_NOTE =
  "Known published limits were applied. Live inventory still needs confirmation against the Resource Schedule.";

const NOT_CONFIGURED_NOTE =
  "Finite resource types exist, but numbered inventory has not been configured. Live availability cannot be validated.";

type OccupancyWindow = {
  slotDate: string;
  startMinute: number;
  endMinute: number;
};

function occupancyWhere(
  organizationId: string,
  resourceIds: string[],
  window: OccupancyWindow,
  exclude?: {
    excludeInquiryId?: string | null;
    excludeBookingId?: string | null;
    excludeReservationId?: string | null;
  },
): Prisma.ResourceReservationWhereInput {
  const and: Prisma.ResourceReservationWhereInput[] = [];
  if (exclude?.excludeInquiryId) {
    and.push({
      OR: [{ inquiryId: null }, { inquiryId: { not: exclude.excludeInquiryId } }],
    });
  }
  if (exclude?.excludeBookingId) {
    and.push({
      OR: [{ bookingId: null }, { bookingId: { not: exclude.excludeBookingId } }],
    });
  }
  if (exclude?.excludeReservationId) {
    and.push({ id: { not: exclude.excludeReservationId } });
  }
  return {
    organizationId,
    resourceId: { in: resourceIds },
    slotDate: new Date(`${window.slotDate}T00:00:00.000Z`),
    releasedAt: null,
    status: {
      in: [RESOURCE_RESERVATION_STATUSES.HOLD, RESOURCE_RESERVATION_STATUSES.BOOKED],
    },
    OR: [
      { status: RESOURCE_RESERVATION_STATUSES.BOOKED },
      { expiresAt: null },
      { expiresAt: { gt: new Date() } },
    ],
    ...(and.length > 0 ? { AND: and } : {}),
  };
}

/**
 * Sets releasedAt on expired HOLDs so the gist exclusion no longer blocks new occupancy.
 * History rows are kept.
 */
export async function releaseExpiredHolds(database: ScheduleDb, organizationId: string) {
  const now = new Date();
  const result = await database.resourceReservation.updateMany({
    where: {
      organizationId,
      status: RESOURCE_RESERVATION_STATUSES.HOLD,
      releasedAt: null,
      expiresAt: { lte: now },
    },
    data: { releasedAt: now },
  });
  if (result.count > 0) {
    await recordAuditEvent(database, {
      organizationId,
      action: "resource.hold_expired",
      resourceType: "resource_reservation",
      metadata: { expiredCount: result.count },
    });
  }
  return result.count;
}

export async function checkResourceAvailability(
  database: ScheduleDb,
  input: ResourceAvailabilityRequest,
): Promise<ResourceAvailabilityResult> {
  await releaseExpiredHolds(database, input.organizationId);
  const window = localEventWindow({
    date: input.date,
    startTime: input.startTime,
    durationMinutes: input.durationMinutes,
  });
  const finite = input.resourceRequirements.filter((row) => row.resourceTypeSlug.length > 0);
  if (finite.length === 0) {
    return { validated: false, available: true, note: UNVALIDATED_NOTE, types: [] };
  }
  if (!window) {
    return {
      validated: false,
      available: false,
      note: "A date and start time are required before Resource Schedule availability can be checked.",
      types: finite.map(unconfiguredType),
    };
  }

  const types: ResourceTypeAvailability[] = [];
  let allConfigured = true;
  let anyConflict = false;

  for (const requirement of finite) {
    if (requirement.requiresStaffConfiguration || !requirement.inventoryConfigured || requirement.quantity == null) {
      allConfigured = false;
      types.push(unconfiguredType(requirement));
      continue;
    }

    const resourceTypeId = requirement.resourceTypeId;
    if (!resourceTypeId) {
      allConfigured = false;
      types.push(unconfiguredType(requirement));
      continue;
    }

    const units = await database.resource.findMany({
      where: {
        organizationId: input.organizationId,
        resourceTypeId,
        active: true,
      },
      select: { id: true },
      orderBy: { displayOrder: "asc" },
    });
    if (units.length === 0) {
      allConfigured = false;
      types.push({
        resourceTypeSlug: requirement.resourceTypeSlug,
        resourceTypeName: requirement.resourceTypeName,
        requestedQuantity: requirement.quantity,
        availableQuantity: null,
        inventoryConfigured: false,
        conflict: false,
        requiresStaffConfiguration: true,
      });
      continue;
    }

    const availableIds = await listAvailableResourceIds(database, {
      organizationId: input.organizationId,
      resourceIds: units.map((row) => row.id),
      window,
      excludeInquiryId: input.excludeInquiryId,
      excludeBookingId: input.excludeBookingId,
      excludeReservationId: input.excludeReservationId,
    });
    const availableQuantity = availableIds.length;
    const conflict = availableQuantity < requirement.quantity;
    if (conflict) {
      anyConflict = true;
    }
    types.push({
      resourceTypeSlug: requirement.resourceTypeSlug,
      resourceTypeName: requirement.resourceTypeName,
      requestedQuantity: requirement.quantity,
      availableQuantity,
      inventoryConfigured: true,
      conflict,
      requiresStaffConfiguration: false,
    });
  }

  if (!allConfigured) {
    return { validated: false, available: !anyConflict, note: NOT_CONFIGURED_NOTE, types };
  }

  return {
    validated: !anyConflict,
    available: !anyConflict,
    note: anyConflict
      ? "One or more finite resources are already on hold or booked for that window."
      : "Finite resources were checked against the Resource Schedule.",
    types,
  };
}

export async function listAvailableResourceIds(
  database: ScheduleDb,
  input: {
    organizationId: string;
    resourceIds: string[];
    window: OccupancyWindow;
    excludeInquiryId?: string | null;
    excludeBookingId?: string | null;
    excludeReservationId?: string | null;
  },
): Promise<string[]> {
  if (input.resourceIds.length === 0) {
    return [];
  }
  const busy = await database.resourceReservation.findMany({
    where: occupancyWhere(input.organizationId, input.resourceIds, input.window, input),
    select: { resourceId: true, startMinute: true, endMinute: true },
  });
  const occupied = new Set(
    busy
      .filter((row) => row.startMinute < input.window.endMinute && input.window.startMinute < row.endMinute)
      .map((row) => row.resourceId),
  );
  return input.resourceIds.filter((id) => !occupied.has(id));
}

function unconfiguredType(requirement: {
  resourceTypeSlug: string;
  resourceTypeName: string;
  quantity: number | null;
  requiresStaffConfiguration: boolean;
}): ResourceTypeAvailability {
  return {
    resourceTypeSlug: requirement.resourceTypeSlug,
    resourceTypeName: requirement.resourceTypeName,
    requestedQuantity: requirement.quantity,
    availableQuantity: null,
    inventoryConfigured: false,
    conflict: false,
    requiresStaffConfiguration: requirement.requiresStaffConfiguration,
  };
}

/**
 * Inserts HOLD or BOOKED rows in one transaction. The exclusion constraint rejects overlapping
 * active reservations even if two agents pass a prior availability check.
 * Not called from recommendation generation or customer plan selection.
 */
export async function reserveResourcesInTransaction(
  database: ScheduleDb,
  input: {
    organizationId: string;
    status: (typeof RESOURCE_RESERVATION_STATUSES)[keyof typeof RESOURCE_RESERVATION_STATUSES];
    sourceType: string;
    slotDate: string;
    startMinute: number;
    endMinute: number;
    resourceIds: string[];
    inquiryId?: string | null;
    bookingId?: string | null;
    expiresAt?: Date | null;
    reason?: string | null;
    createdByUserProfileId?: string | null;
  },
) {
  if (input.endMinute <= input.startMinute) {
    throw new Error("Resource reservation windows must have endMinute greater than startMinute.");
  }
  await releaseExpiredHolds(database, input.organizationId);
  return database.$transaction(async (tx) => {
    await tx.resourceReservation.createMany({
      data: input.resourceIds.map((resourceId) => ({
        organizationId: input.organizationId,
        resourceId,
        status: input.status,
        slotDate: new Date(`${input.slotDate}T00:00:00.000Z`),
        startMinute: input.startMinute,
        endMinute: input.endMinute,
        inquiryId: input.inquiryId ?? null,
        bookingId: input.bookingId ?? null,
        sourceType: input.sourceType,
        expiresAt: input.expiresAt ?? null,
        reason: input.reason ?? null,
        createdByUserProfileId: input.createdByUserProfileId ?? null,
      })),
    });
  });
}

export function isReservationOverlapError(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
    return false;
  }
  const message = `${error.message} ${JSON.stringify(error.meta ?? {})}`;
  return (
    message.includes("resource_reservations_no_overlap") ||
    message.includes("exclusion") ||
    error.code === "P2002"
  );
}

export function createResourceScheduleAvailabilityProvider(
  database: ScheduleDb,
  organizationId: string,
): PlanAvailabilityProvider {
  return {
    async check(input) {
      const requirements = input.resourceRequirements ?? [];
      const result = await checkResourceAvailability(database, {
        organizationId,
        date: input.eventDate,
        startTime: input.startTime,
        durationMinutes: input.durationMinutes,
        resourceRequirements: requirements,
        excludeInquiryId: input.excludeInquiryId,
        excludeBookingId: input.excludeBookingId,
      });
      return {
        validated: result.validated,
        available: result.available,
        note: result.note,
        types: result.types,
      };
    },
  };
}
