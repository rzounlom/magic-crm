import { formatItineraryRange } from "@/lib/inquiries/tenant-datetime";
import {
  isAllocatedBookingReservation,
  isLegacyHoldReservation,
  isReleasedBookingReservation,
} from "@/lib/inquiries/employee-workspace-state";
import { minutesToClock } from "@/server/resources/time-window";
import { RESOURCE_RESERVATION_STATUSES } from "@/types/resource-schedule";

export type AllocationReservation = {
  id: string;
  status?: string | null;
  releasedAt?: Date | null;
  startMinute: number;
  endMinute: number;
  expiresAt?: Date | null;
  resource: {
    name: string;
    resourceType: { id?: string | null; name: string; slug?: string | null };
  };
};

export type ResourceTypeInventoryCount = {
  resourceTypeId?: string;
  resourceTypeName: string;
  resourceTypeSlug?: string;
  activeQuantity: number;
};

export type AllocatedResourceGroup = {
  key: string;
  resourceTypeName: string;
  startMinute: number;
  endMinute: number;
  names: string[];
  allocatedQuantity: number;
  activeQuantity: number | null;
  released: boolean;
  /** Raw reservation status for presentation (HOLD vs BOOKED). */
  reservationStatus: string | null;
};

/** Staff-facing allocation label — presentation only. */
export function formatAllocationOccupancyLabel(group: AllocatedResourceGroup): string {
  if (group.released) {
    return `${group.allocatedQuantity} released`;
  }
  if (group.reservationStatus === RESOURCE_RESERVATION_STATUSES.HOLD) {
    return `${group.allocatedQuantity} on hold`;
  }
  return `${group.allocatedQuantity} booked`;
}

export function allocationStatusBadgeLabel(group: AllocatedResourceGroup): "Released" | "HOLD" | "Booked" {
  if (group.released) {
    return "Released";
  }
  if (group.reservationStatus === RESOURCE_RESERVATION_STATUSES.HOLD) {
    return "HOLD";
  }
  return "Booked";
}

export function formatReservationClockRange(startMinute: number, endMinute: number): string {
  return formatItineraryRange(minutesToClock(startMinute), minutesToClock(endMinute));
}

export function formatRequirementClockRange(
  startTime: string | null | undefined,
  endTime: string | null | undefined,
): string {
  return formatItineraryRange(startTime, endTime);
}

export function classifyWorkspaceReservations<T extends AllocationReservation>(rows: T[]) {
  return {
    legacyHolds: rows.filter((row) => isLegacyHoldReservation(row)),
    allocated: rows.filter((row) => isAllocatedBookingReservation(row)),
    released: rows.filter((row) => isReleasedBookingReservation(row)),
  };
}

export function groupAllocatedResources(
  rows: AllocationReservation[],
  inventory: ResourceTypeInventoryCount[] = [],
): AllocatedResourceGroup[] {
  const byName = new Map(inventory.map((row) => [row.resourceTypeName, row.activeQuantity]));
  const bySlug = new Map(
    inventory
      .filter((row) => row.resourceTypeSlug)
      .map((row) => [row.resourceTypeSlug as string, row.activeQuantity]),
  );
  const groups = new Map<string, AllocatedResourceGroup>();
  for (const row of rows) {
    const typeName = row.resource.resourceType.name;
    const statusKey = row.releasedAt ? "released" : (row.status ?? "active");
    const key = `${typeName}:${row.startMinute}:${row.endMinute}:${statusKey}`;
    const existing = groups.get(key);
    if (existing) {
      existing.names.push(row.resource.name);
      existing.allocatedQuantity += 1;
      continue;
    }
    groups.set(key, {
      key,
      resourceTypeName: typeName,
      startMinute: row.startMinute,
      endMinute: row.endMinute,
      names: [row.resource.name],
      allocatedQuantity: 1,
      activeQuantity:
        (row.resource.resourceType.slug ? bySlug.get(row.resource.resourceType.slug) : undefined) ??
        byName.get(typeName) ??
        null,
      released: Boolean(row.releasedAt),
      reservationStatus: row.status ?? null,
    });
  }
  return [...groups.values()];
}

export function formatAllocatedSummary(group: AllocatedResourceGroup): string {
  if (group.activeQuantity != null && group.activeQuantity > 0) {
    return `${group.allocatedQuantity} allocated of ${group.activeQuantity} total`;
  }
  return `${group.allocatedQuantity} allocated`;
}

export function formatAllocatedWindow(group: AllocatedResourceGroup): string {
  return formatReservationClockRange(group.startMinute, group.endMinute);
}
