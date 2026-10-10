import { afterAll, afterEach, describe, expect, it } from "vitest";

import { resolveStrictOccupancyInstants } from "@/lib/inquiries/strict-local-time";
import { listAvailableResourceIds } from "@/server/services/resource-availability-service";
import { LOCAL_TIME_RESOLUTION_STATUSES } from "@/types/operating-hours";
import { RESOURCE_RESERVATION_STATUSES } from "@/types/resource-schedule";
import { deleteTestOrganizations } from "../helpers/cleanup-test-organizations";
import { createTestPrismaClient } from "../helpers/test-database";

const db = createTestPrismaClient();
const createdOrganizationIds: string[] = [];

afterEach(async () => {
  await deleteTestOrganizations(db, createdOrganizationIds);
  createdOrganizationIds.length = 0;
}, 60_000);

afterAll(async () => {
  await db.$disconnect();
});

describe("overnight resource occupancy (TEST)", () => {
  it("detects cross-midnight conflicts via absolute instants and DB exclusion", async () => {
    const org = await db.organization.create({
      data: {
        name: "Overnight Org",
        slug: `overnight-${crypto.randomUUID()}`,
        timezone: "America/Indiana/Indianapolis",
        currency: "USD",
        locations: {
          create: {
            name: "Main",
            slug: "main",
            timezone: "America/Indiana/Indianapolis",
          },
        },
      },
      include: { locations: true },
    });
    createdOrganizationIds.push(org.id);
    const location = org.locations[0]!;
    const type = await db.resourceType.create({
      data: {
        organizationId: org.id,
        locationId: location.id,
        name: "Lane",
        slug: "lane",
        inventoryConfigured: true,
      },
    });
    const resource = await db.resource.create({
      data: {
        organizationId: org.id,
        resourceTypeId: type.id,
        locationId: location.id,
        name: "Lane 1",
        displayOrder: 1,
      },
    });

    const overnight = resolveStrictOccupancyInstants({
      slotDate: "2026-10-25",
      startMinute: 23 * 60,
      endMinute: 25 * 60,
      timeZone: "America/Indiana/Indianapolis",
    });
    expect(overnight.status).toBe(LOCAL_TIME_RESOLUTION_STATUSES.VALID);
    if (overnight.status !== LOCAL_TIME_RESOLUTION_STATUSES.VALID) {
      return;
    }

    await db.resourceReservation.create({
      data: {
        organizationId: org.id,
        locationId: location.id,
        resourceId: resource.id,
        status: RESOURCE_RESERVATION_STATUSES.BOOKED,
        sourceType: "MANUAL",
        slotDate: new Date("2026-10-25T00:00:00.000Z"),
        startMinute: 23 * 60,
        endMinute: 25 * 60,
        startsAt: overnight.startsAt,
        endsAt: overnight.endsAt,
      },
    });

    const available = await listAvailableResourceIds(db, {
      organizationId: org.id,
      resourceIds: [resource.id],
      window: { slotDate: "2026-10-26", startMinute: 30, endMinute: 90 },
      timeZone: "America/Indiana/Indianapolis",
    });
    expect(available).toEqual([]);

    const backToBack = await listAvailableResourceIds(db, {
      organizationId: org.id,
      resourceIds: [resource.id],
      window: { slotDate: "2026-10-26", startMinute: 60, endMinute: 120 },
      timeZone: "America/Indiana/Indianapolis",
    });
    expect(backToBack).toEqual([resource.id]);

    const conflictInstant = resolveStrictOccupancyInstants({
      slotDate: "2026-10-26",
      startMinute: 30,
      endMinute: 90,
      timeZone: "America/Indiana/Indianapolis",
    });
    expect(conflictInstant.status).toBe(LOCAL_TIME_RESOLUTION_STATUSES.VALID);
    if (conflictInstant.status !== LOCAL_TIME_RESOLUTION_STATUSES.VALID) {
      return;
    }

    await expect(
      db.resourceReservation.create({
        data: {
          organizationId: org.id,
          locationId: location.id,
          resourceId: resource.id,
          status: RESOURCE_RESERVATION_STATUSES.HOLD,
          sourceType: "MANUAL",
          slotDate: new Date("2026-10-26T00:00:00.000Z"),
          startMinute: 30,
          endMinute: 90,
          startsAt: conflictInstant.startsAt,
          endsAt: conflictInstant.endsAt,
          expiresAt: new Date("2026-12-01T00:00:00.000Z"),
        },
      }),
    ).rejects.toThrow();
  });
});
