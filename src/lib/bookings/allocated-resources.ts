import { formatItineraryRange } from "@/lib/inquiries/tenant-datetime";
import {
  isAllocatedBookingReservation,
  isLegacyHoldReservation,
  isReleasedBookingReservation,
} from "@/lib/inquiries/employee-workspace-state";
import { minutesToClock } from "@/server/resources/time-window";

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
};

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
    const key = `${typeName}:${row.startMinute}:${row.endMinute}:${row.releasedAt ? "released" : "active"}`;
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
