import { Prisma, type PrismaClient } from "@/generated/prisma/client";

import { ResourceError } from "@/server/errors";
import { localEventWindow, requirementOccupancyWindow } from "@/server/resources/time-window";
import { resourcesInLocationWhere } from "@/server/resources/location-scope";
import {
  isAllOfTypeRule,
  isLocationExclusiveRule,
  isSpecificResourceRule,
} from "@/server/resources/composite-requirements";
import {
  listActiveLocationResourceIds,
  locationHasBlockingOccupancy,
  locationHasExclusiveOccupancy,
  lockLocationForScheduling,
} from "@/server/resources/location-exclusivity";
import type { PlanAvailabilityProvider } from "@/server/event-planner/availability";
import { recordAuditEvent } from "@/server/services/audit";
import { INQUIRY_SALES_STAGES, INQUIRY_STATUSES, INQUIRY_WORKFLOW_STAGES } from "@/types/inquiry";
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
  now = new Date(),
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
      { expiresAt: { gt: now } },
    ],
    ...(and.length > 0 ? { AND: and } : {}),
  };
}

/**
 * Sets releasedAt on expired HOLDs so the gist exclusion no longer blocks new occupancy.
 * History rows are kept. BOOKED rows are never expired. Availability also ignores
 * holdExpiresAt <= now even if this sweeper has not run yet.
 */
export async function releaseExpiredHolds(
  database: ScheduleDb,
  organizationId: string,
  now = new Date(),
) {
  const expired = await database.resourceReservation.findMany({
    where: {
      organizationId,
      status: RESOURCE_RESERVATION_STATUSES.HOLD,
      releasedAt: null,
      expiresAt: { lte: now },
    },
    select: { id: true, inquiryId: true },
  });
  if (expired.length === 0) {
    return 0;
  }
  await database.resourceReservation.updateMany({
    where: {
      id: { in: expired.map((row) => row.id) },
      organizationId,
      status: RESOURCE_RESERVATION_STATUSES.HOLD,
      releasedAt: null,
      expiresAt: { lte: now },
    },
    data: { releasedAt: now },
  });
  const inquiryIds = [...new Set(expired.map((row) => row.inquiryId).filter((id): id is string => Boolean(id)))];
  for (const inquiryId of inquiryIds) {
    const remaining = await database.resourceReservation.findFirst({
      where: {
        organizationId,
        inquiryId,
        status: RESOURCE_RESERVATION_STATUSES.HOLD,
        releasedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      select: { id: true },
    });
    if (!remaining) {
      await database.inquiry.updateMany({
        where: {
          id: inquiryId,
          organizationId,
          salesStage: INQUIRY_SALES_STAGES.HOLD_PLACED,
          status: { not: INQUIRY_STATUSES.BOOKED },
        },
        data: {
          salesStage: INQUIRY_SALES_STAGES.READY_TO_BOOK,
          workflowStage: INQUIRY_WORKFLOW_STAGES.READY_FOR_LIVE_AGENT,
        },
      });
    }
  }
  await recordAuditEvent(database, {
    organizationId,
    action: "resource.hold_expired",
    resourceType: "resource_reservation",
    metadata: { expiredCount: expired.length },
  });
  return expired.length;
}

export async function checkResourceAvailability(
  database: ScheduleDb,
  input: ResourceAvailabilityRequest,
): Promise<ResourceAvailabilityResult> {
  const now = input.now ?? new Date();
  await releaseExpiredHolds(database, input.organizationId, now);
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

    if (isLocationExclusiveRule(requirement.quantityRule) || requirement.locationExclusive) {
      if (!input.locationId) {
        allConfigured = false;
        types.push(unconfiguredType(requirement));
        continue;
      }
      const exclusiveWindow = requirementOccupancyWindow(requirement, window);
      const occupied = await locationHasBlockingOccupancy(database, {
        organizationId: input.organizationId,
        locationId: input.locationId,
        window: exclusiveWindow,
        excludeInquiryId: input.excludeInquiryId,
        excludeBookingId: input.excludeBookingId,
        excludeReservationId: input.excludeReservationId,
        now,
      });
      const activeIds = await listActiveLocationResourceIds(database, input.organizationId, input.locationId);
      if (activeIds.length === 0) {
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
      if (occupied) {
        anyConflict = true;
      }
      types.push({
        resourceTypeSlug: requirement.resourceTypeSlug,
        resourceTypeName: requirement.resourceTypeName,
        requestedQuantity: activeIds.length,
        availableQuantity: occupied ? 0 : activeIds.length,
        inventoryConfigured: true,
        conflict: occupied,
        requiresStaffConfiguration: false,
      });
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
        ...resourcesInLocationWhere(input.locationId),
      },
      select: { id: true },
      orderBy: { displayOrder: "asc" },
    });
    const scopedUnits =
      isSpecificResourceRule(requirement.quantityRule) || requirement.specificResourceId
        ? units.filter((row) => row.id === requirement.specificResourceId)
        : units;
    if (
      (isSpecificResourceRule(requirement.quantityRule) || requirement.specificResourceId)
      && scopedUnits.length !== 1
    ) {
      anyConflict = true;
      types.push({
        resourceTypeSlug: requirement.resourceTypeSlug,
        resourceTypeName: requirement.resourceTypeName,
        requestedQuantity: 1,
        availableQuantity: 0,
        inventoryConfigured: true,
        conflict: true,
        requiresStaffConfiguration: false,
      });
      continue;
    }
    if (scopedUnits.length === 0) {
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

    const requirementWindow = requirementOccupancyWindow(requirement, window);

    const availableIds = await listAvailableResourceIds(database, {
      organizationId: input.organizationId,
      resourceIds: scopedUnits.map((row) => row.id),
      window: requirementWindow,
      excludeInquiryId: input.excludeInquiryId,
      excludeBookingId: input.excludeBookingId,
      excludeReservationId: input.excludeReservationId,
      now,
    });
    const requestedQuantity = isAllOfTypeRule(requirement.quantityRule)
      ? scopedUnits.length
      : requirement.quantity;
    let conflict = availableIds.length < requestedQuantity;
    if (
      !conflict
      && input.locationId
      && (await locationHasExclusiveOccupancy(database, {
        organizationId: input.organizationId,
        locationId: input.locationId,
        window: requirementWindow,
        excludeInquiryId: input.excludeInquiryId,
        excludeBookingId: input.excludeBookingId,
        excludeReservationId: input.excludeReservationId,
        now,
      }))
    ) {
      conflict = true;
    }
    if (conflict) {
      anyConflict = true;
    }
    types.push({
      resourceTypeSlug: requirement.resourceTypeSlug,
      resourceTypeName: requirement.resourceTypeName,
      requestedQuantity,
      availableQuantity: conflict && availableIds.length >= requestedQuantity ? 0 : availableIds.length,
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
    now?: Date;
  },
): Promise<string[]> {
  if (input.resourceIds.length === 0) {
    return [];
  }
  const now = input.now ?? new Date();
  const busy = await database.resourceReservation.findMany({
    where: occupancyWhere(input.organizationId, input.resourceIds, input.window, input, now),
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
    locationId?: string | null;
    status: (typeof RESOURCE_RESERVATION_STATUSES)[keyof typeof RESOURCE_RESERVATION_STATUSES];
    sourceType: string;
    slotDate: string;
    startMinute: number;
    endMinute: number;
    startsAt?: Date | null;
    endsAt?: Date | null;
    resourceIds: string[];
    inquiryId?: string | null;
    bookingId?: string | null;
    expiresAt?: Date | null;
    reason?: string | null;
    createdByUserProfileId?: string | null;
    now?: Date;
    locationExclusive?: boolean;
  },
) {
  if (input.endMinute <= input.startMinute) {
    throw new Error("Resource reservation windows must have endMinute greater than startMinute.");
  }
  await releaseExpiredHolds(database, input.organizationId, input.now ?? new Date());
  return database.$transaction(async (tx) => {
    await lockLocationForScheduling(tx, input.organizationId, input.locationId);
    if (input.locationId) {
      const exclusive = input.locationExclusive === true;
      if (exclusive) {
        const blocked = await locationHasBlockingOccupancy(tx, {
          organizationId: input.organizationId,
          locationId: input.locationId,
          window: {
            slotDate: input.slotDate,
            startMinute: input.startMinute,
            endMinute: input.endMinute,
          },
          excludeInquiryId: input.inquiryId,
          excludeBookingId: input.bookingId,
          now: input.now,
        });
        if (blocked) {
          throw new ResourceError("RESOURCE_CONFLICT");
        }
      } else {
        const blocked = await locationHasExclusiveOccupancy(tx, {
          organizationId: input.organizationId,
          locationId: input.locationId,
          window: {
            slotDate: input.slotDate,
            startMinute: input.startMinute,
            endMinute: input.endMinute,
          },
          excludeInquiryId: input.inquiryId,
          excludeBookingId: input.bookingId,
          now: input.now,
        });
        if (blocked) {
          throw new ResourceError("RESOURCE_CONFLICT");
        }
      }
    }
    await tx.resourceReservation.createMany({
      data: input.resourceIds.map((resourceId) => ({
        organizationId: input.organizationId,
        locationId: input.locationId ?? null,
        resourceId,
        status: input.status,
        slotDate: new Date(`${input.slotDate}T00:00:00.000Z`),
        startMinute: input.startMinute,
        endMinute: input.endMinute,
        startsAt: input.startsAt ?? null,
        endsAt: input.endsAt ?? null,
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
  locationId?: string | null,
): PlanAvailabilityProvider {
  return {
    async check(input) {
      const requirements = input.resourceRequirements ?? [];
      const result = await checkResourceAvailability(database, {
        organizationId,
        locationId,
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
