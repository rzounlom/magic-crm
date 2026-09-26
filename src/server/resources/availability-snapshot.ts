import type { PrismaClient } from "@/generated/prisma/client";

import { resourcesInLocationWhere } from "@/server/resources/location-scope";
import { localEventWindow, requirementOccupancyWindow } from "@/server/resources/time-window";
import {
  isAllOfTypeRule,
  isLocationExclusiveRule,
  isSpecificResourceRule,
} from "@/server/resources/composite-requirements";
import { PRODUCT_QUANTITY_RULES } from "@/types/catalog";
import {
  RESOURCE_RESERVATION_STATUSES,
  type PlanResourceRequirement,
  type ResourceAvailabilityRequest,
  type ResourceAvailabilityResult,
  type ResourceTypeAvailability,
} from "@/types/resource-schedule";

type ScheduleDb = PrismaClient;

const UNVALIDATED_NOTE =
  "Known published limits were applied. Live inventory still needs confirmation against the Resource Schedule.";

const NOT_CONFIGURED_NOTE =
  "Finite resource types exist, but numbered inventory has not been configured. Live availability cannot be validated.";

export type SnapshotReservation = {
  id: string;
  resourceId: string;
  resourceTypeId: string;
  reservationLocationId: string | null;
  resourceLocationId: string | null;
  startMinute: number;
  endMinute: number;
  status: string;
  expiresAt: Date | null;
  inquiryId: string | null;
  bookingId: string | null;
};

export type SnapshotUnit = {
  id: string;
  resourceTypeId: string;
};

/**
 * One location's inventory and that day's occupancy, loaded for advisory search.
 * Confirmation still rechecks inside its lock; this snapshot is not authoritative.
 */
export type LocationAvailabilitySnapshot = {
  organizationId: string;
  locationId: string | null;
  slotDate: string;
  now: Date;
  units: SnapshotUnit[];
  reservations: SnapshotReservation[];
  exclusiveTypeIds: string[];
  queryPhaseMs: number;
};

export async function loadLocationAvailabilitySnapshot(
  database: ScheduleDb,
  input: {
    organizationId: string;
    locationId?: string | null;
    slotDate: string;
    now?: Date;
  },
): Promise<LocationAvailabilitySnapshot> {
  const started = Date.now();
  const now = input.now ?? new Date();
  const units = await database.resource.findMany({
    where: {
      organizationId: input.organizationId,
      ...resourcesInLocationWhere(input.locationId),
    },
    select: { id: true, resourceTypeId: true },
    orderBy: [{ resourceTypeId: "asc" }, { displayOrder: "asc" }],
  });
  const reservations = units.length
    ? await database.resourceReservation.findMany({
        where: {
          organizationId: input.organizationId,
          resourceId: { in: units.map((row) => row.id) },
          slotDate: new Date(`${input.slotDate}T00:00:00.000Z`),
          releasedAt: null,
          status: { in: [RESOURCE_RESERVATION_STATUSES.HOLD, RESOURCE_RESERVATION_STATUSES.BOOKED] },
        },
        select: {
          id: true,
          resourceId: true,
          locationId: true,
          startMinute: true,
          endMinute: true,
          status: true,
          expiresAt: true,
          inquiryId: true,
          bookingId: true,
          resource: { select: { resourceTypeId: true, locationId: true } },
        },
      })
    : [];
  const markers = await database.productResourceRequirement.findMany({
    where: {
      organizationId: input.organizationId,
      quantityRule: PRODUCT_QUANTITY_RULES.LOCATION_EXCLUSIVE,
    },
    select: { resourceTypeId: true },
  });
  return {
    organizationId: input.organizationId,
    locationId: input.locationId ?? null,
    slotDate: input.slotDate,
    now,
    units,
    reservations: reservations.map((row) => ({
      id: row.id,
      resourceId: row.resourceId,
      resourceTypeId: row.resource.resourceTypeId,
      reservationLocationId: row.locationId,
      resourceLocationId: row.resource.locationId,
      startMinute: row.startMinute,
      endMinute: row.endMinute,
      status: row.status,
      expiresAt: row.expiresAt,
      inquiryId: row.inquiryId,
      bookingId: row.bookingId,
    })),
    exclusiveTypeIds: [...new Set(markers.map((row) => row.resourceTypeId))],
    queryPhaseMs: Date.now() - started,
  };
}

function countsAsOccupancy(row: SnapshotReservation, now: Date): boolean {
  if (row.status === RESOURCE_RESERVATION_STATUSES.BOOKED) {
    return true;
  }
  return row.expiresAt == null || row.expiresAt > now;
}

function isExcluded(
  row: SnapshotReservation,
  exclude: {
    excludeInquiryId?: string | null;
    excludeBookingId?: string | null;
    excludeReservationId?: string | null;
  },
): boolean {
  if (exclude.excludeInquiryId && row.inquiryId === exclude.excludeInquiryId) {
    return true;
  }
  if (exclude.excludeBookingId && row.bookingId === exclude.excludeBookingId) {
    return true;
  }
  if (exclude.excludeReservationId && row.id === exclude.excludeReservationId) {
    return true;
  }
  return false;
}

function activeRows(snapshot: LocationAvailabilitySnapshot, exclude: ResourceAvailabilityRequest): SnapshotReservation[] {
  return snapshot.reservations.filter((row) => countsAsOccupancy(row, snapshot.now) && !isExcluded(row, exclude));
}

function overlaps(row: SnapshotReservation, window: { startMinute: number; endMinute: number }): boolean {
  return row.startMinute < window.endMinute && window.startMinute < row.endMinute;
}

function unconfiguredType(requirement: PlanResourceRequirement): ResourceTypeAvailability {
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

/** Same conflict rules as checkResourceAvailability, using the preloaded day snapshot. */
export function evaluateAvailabilitySnapshot(
  snapshot: LocationAvailabilitySnapshot,
  input: ResourceAvailabilityRequest,
): ResourceAvailabilityResult {
  const window = localEventWindow({
    date: input.date,
    startTime: input.startTime,
    durationMinutes: input.durationMinutes,
  });
  const finite = input.resourceRequirements.filter((row) => row.resourceTypeSlug.length > 0);
  if (finite.length === 0) {
    return { validated: false, available: true, note: UNVALIDATED_NOTE, types: [] };
  }
  if (!window || window.slotDate !== snapshot.slotDate) {
    return {
      validated: false,
      available: false,
      note: "A date and start time are required before Resource Schedule availability can be checked.",
      types: finite.map(unconfiguredType),
    };
  }

  const rows = activeRows(snapshot, input);
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
      const occupied = rows.some(
        (row) =>
          overlaps(row, exclusiveWindow) &&
          (row.reservationLocationId === input.locationId || row.resourceLocationId === input.locationId),
      );
      const activeIds = snapshot.units.map((row) => row.id);
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

    const units = snapshot.units.filter((row) => row.resourceTypeId === resourceTypeId);
    const scopedUnits =
      isSpecificResourceRule(requirement.quantityRule) || requirement.specificResourceId
        ? units.filter((row) => row.id === requirement.specificResourceId)
        : units;
    if (
      (isSpecificResourceRule(requirement.quantityRule) || requirement.specificResourceId) &&
      scopedUnits.length !== 1
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
    const occupiedIds = new Set(
      rows
        .filter(
          (row) =>
            scopedUnits.some((unit) => unit.id === row.resourceId) && overlaps(row, requirementWindow),
        )
        .map((row) => row.resourceId),
    );
    const availableIds = scopedUnits.filter((row) => !occupiedIds.has(row.id)).map((row) => row.id);
    const requestedQuantity = isAllOfTypeRule(requirement.quantityRule) ? scopedUnits.length : requirement.quantity;
    let conflict = availableIds.length < requestedQuantity;
    if (
      !conflict &&
      input.locationId &&
      snapshot.exclusiveTypeIds.length > 0 &&
      rows.some(
        (row) =>
          snapshot.exclusiveTypeIds.includes(row.resourceTypeId) &&
          (row.resourceLocationId === input.locationId || row.resourceLocationId == null) &&
          overlaps(row, requirementWindow),
      )
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
