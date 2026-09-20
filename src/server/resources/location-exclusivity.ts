/**
 * Location-exclusive bookings allocate every active bookable Resource at the
 * Location (exact occupancy + GiST overlap) and serialize writers with
 * SELECT … FOR UPDATE on the Location row. Marker occupancy on any
 * LOCATION_EXCLUSIVE product's resource type also blocks later-added units.
 */
import type { Prisma, PrismaClient } from "@/generated/prisma/client";

import { resourcesInLocationWhere } from "@/server/resources/location-scope";
import { PRODUCT_QUANTITY_RULES } from "@/types/catalog";
import { RESOURCE_RESERVATION_STATUSES } from "@/types/resource-schedule";

type ScheduleDb = PrismaClient | Prisma.TransactionClient;

type OccupancyWindow = {
  slotDate: string;
  startMinute: number;
  endMinute: number;
};

function overlappingWhere(
  organizationId: string,
  window: OccupancyWindow,
  exclude?: {
    excludeInquiryId?: string | null;
    excludeBookingId?: string | null;
    excludeReservationId?: string | null;
  },
  now = new Date(),
): Prisma.ResourceReservationWhereInput {
  const and: Prisma.ResourceReservationWhereInput[] = [
    { startMinute: { lt: window.endMinute } },
    { endMinute: { gt: window.startMinute } },
  ];
  if (exclude?.excludeInquiryId) {
    and.push({ OR: [{ inquiryId: null }, { inquiryId: { not: exclude.excludeInquiryId } }] });
  }
  if (exclude?.excludeBookingId) {
    and.push({ OR: [{ bookingId: null }, { bookingId: { not: exclude.excludeBookingId } }] });
  }
  if (exclude?.excludeReservationId) {
    and.push({ id: { not: exclude.excludeReservationId } });
  }
  return {
    organizationId,
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
    AND: and,
  };
}

export async function lockLocationForScheduling(
  database: ScheduleDb,
  organizationId: string,
  locationId: string | null | undefined,
): Promise<void> {
  if (!locationId) {
    return;
  }
  const rows = await database.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM locations
    WHERE id = ${locationId} AND "organizationId" = ${organizationId}
    FOR UPDATE
  `;
  if (rows.length === 0) {
    throw new Error("Location was not found for schedule locking.");
  }
}

export async function listActiveLocationResourceIds(
  database: ScheduleDb,
  organizationId: string,
  locationId: string | null | undefined,
): Promise<string[]> {
  const rows = await database.resource.findMany({
    where: {
      organizationId,
      ...resourcesInLocationWhere(locationId),
    },
    select: { id: true },
    orderBy: [{ resourceTypeId: "asc" }, { displayOrder: "asc" }],
  });
  return rows.map((row) => row.id);
}

export async function locationHasBlockingOccupancy(
  database: ScheduleDb,
  input: {
    organizationId: string;
    locationId: string;
    window: OccupancyWindow;
    excludeInquiryId?: string | null;
    excludeBookingId?: string | null;
    excludeReservationId?: string | null;
    now?: Date;
  },
): Promise<boolean> {
  const base = overlappingWhere(input.organizationId, input.window, input, input.now);
  const occupied = await database.resourceReservation.findFirst({
    where: {
      ...base,
      AND: [
        ...(Array.isArray(base.AND) ? base.AND : []),
        {
          OR: [
            { locationId: input.locationId },
            { resource: { locationId: input.locationId } },
          ],
        },
      ],
    },
    select: { id: true },
  });
  return Boolean(occupied);
}

export async function locationHasExclusiveOccupancy(
  database: ScheduleDb,
  input: {
    organizationId: string;
    locationId: string;
    window: OccupancyWindow;
    excludeInquiryId?: string | null;
    excludeBookingId?: string | null;
    excludeReservationId?: string | null;
    now?: Date;
  },
): Promise<boolean> {
  const markerTypes = await database.productResourceRequirement.findMany({
    where: {
      organizationId: input.organizationId,
      quantityRule: PRODUCT_QUANTITY_RULES.LOCATION_EXCLUSIVE,
    },
    select: { resourceTypeId: true },
  });
  const typeIds = [...new Set(markerTypes.map((row) => row.resourceTypeId))];
  if (typeIds.length === 0) {
    return false;
  }
  const occupied = await database.resourceReservation.findFirst({
    where: {
      ...overlappingWhere(input.organizationId, input.window, input, input.now),
      resource: {
        organizationId: input.organizationId,
        resourceTypeId: { in: typeIds },
        OR: [{ locationId: input.locationId }, { locationId: null }],
      },
    },
    select: { id: true },
  });
  return Boolean(occupied);
}
