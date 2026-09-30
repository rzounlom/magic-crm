import { afterAll, describe, expect, it } from "vitest";

import { invalidatePermissionCache } from "@/server/policies/require-permission";
import { resolveRequestContext } from "@/server/request-context";
import { reserveResourcesInTransaction } from "@/server/services/resource-availability-service";
import { createEmployeeManualInquiry } from "@/server/services/inquiry-service";
import { getMasterScheduleBoard } from "@/server/services/resource-schedule-service";
import { provisionOrganization } from "@/server/services/provision-organization";
import { PERMISSIONS } from "@/types/permissions";
import { RESOURCE_RESERVATION_SOURCES, RESOURCE_RESERVATION_STATUSES } from "@/types/resource-schedule";
import { deleteTestOrganizations } from "../helpers/cleanup-test-organizations";
import { createTestPrismaClient } from "../helpers/test-database";

const db = createTestPrismaClient();
const createdOrganizationIds: string[] = [];

afterAll(async () => {
  await deleteTestOrganizations(db, createdOrganizationIds);
  await db.$disconnect();
});

async function provision(label: string) {
  const result = await provisionOrganization(
    {
      clerkUserId: `user_sched_${label}_${crypto.randomUUID()}`,
      clerkOrganizationId: `clerk_org_sched_${label}_${crypto.randomUUID()}`,
      organizationName: `Schedule ${label}`,
      organizationSlug: `sched-${label}-${crypto.randomUUID()}`,
      isClerkOrganizationAdmin: true,
    },
    db,
  );
  createdOrganizationIds.push(result.organizationId);
  const organization = await db.organization.findFirstOrThrow({ where: { id: result.organizationId } });
  const profile = await db.userProfile.findFirstOrThrow({ where: { id: result.userProfileId } });
  const ctx = await resolveRequestContext(
    { clerkUserId: profile.clerkUserId, clerkOrganizationId: organization.clerkOrganizationId },
    db,
  );
  return { ...result, ctx };
}

async function dropPermission(organizationId: string, key: string) {
  const definition = await db.permissionDefinition.findFirstOrThrow({ where: { key } });
  await db.securityGroupPermission.deleteMany({
    where: { organizationId, permissionDefinitionId: definition.id },
  });
}

describe("master schedule board", () => {
  it("paints exact booked resources and active holds, and hides other tenants, locations, and inactive holds", async () => {
    const alpha = await provision("alpha");
    const beta = await provision("beta");
    const otherLocation = await db.location.create({
      data: {
        organizationId: alpha.organizationId,
        name: "Other site",
        slug: `other-${crypto.randomUUID()}`,
        timezone: "America/Indiana/Indianapolis",
      },
    });
    const bowling = await db.resourceType.create({
      data: { organizationId: alpha.organizationId, name: "Bowling", slug: "bowling-lane", inventoryConfigured: true },
    });
    const lanes = await Promise.all(
      [1, 2].map((order) =>
        db.resource.create({
          data: {
            organizationId: alpha.organizationId,
            resourceTypeId: bowling.id,
            locationId: alpha.locationId,
            name: `Lane ${order}`,
            displayOrder: order,
          },
        }),
      ),
    );
    const elsewhere = await db.resource.create({
      data: {
        organizationId: alpha.organizationId,
        resourceTypeId: bowling.id,
        locationId: otherLocation.id,
        name: "Lane elsewhere",
        displayOrder: 3,
      },
    });
    const foreignType = await db.resourceType.create({
      data: { organizationId: beta.organizationId, name: "Bowling", slug: "bowling-lane", inventoryConfigured: true },
    });
    await db.resource.create({
      data: {
        organizationId: beta.organizationId,
        resourceTypeId: foreignType.id,
        name: "Foreign lane",
        displayOrder: 1,
      },
    });

    await reserveResourcesInTransaction(db, {
      organizationId: alpha.organizationId,
      locationId: alpha.locationId,
      status: RESOURCE_RESERVATION_STATUSES.BOOKED,
      sourceType: RESOURCE_RESERVATION_SOURCES.MANUAL,
      slotDate: "2026-11-18",
      startMinute: 17 * 60,
      endMinute: 18 * 60,
      resourceIds: lanes.map((lane) => lane.id),
    });
    await reserveResourcesInTransaction(db, {
      organizationId: alpha.organizationId,
      locationId: alpha.locationId,
      status: RESOURCE_RESERVATION_STATUSES.HOLD,
      sourceType: RESOURCE_RESERVATION_SOURCES.MANUAL,
      slotDate: "2026-11-18",
      startMinute: 19 * 60,
      endMinute: 20 * 60,
      expiresAt: new Date("2026-11-19T17:00:00.000Z"),
      resourceIds: [lanes[0]!.id],
    });
    await reserveResourcesInTransaction(db, {
      organizationId: alpha.organizationId,
      locationId: alpha.locationId,
      status: RESOURCE_RESERVATION_STATUSES.HOLD,
      sourceType: RESOURCE_RESERVATION_SOURCES.MANUAL,
      slotDate: "2026-11-18",
      startMinute: 12 * 60,
      endMinute: 13 * 60,
      expiresAt: new Date("2020-01-01T00:00:00.000Z"),
      resourceIds: [lanes[1]!.id],
      now: new Date("2020-01-01T00:00:00.000Z"),
    });
    await db.resourceReservation.updateMany({
      where: { organizationId: alpha.organizationId, startMinute: 12 * 60 },
      data: { releasedAt: new Date("2020-01-02T00:00:00.000Z") },
    });

    const board = await getMasterScheduleBoard(alpha.ctx, db, { date: "2026-11-18" });
    const resourceIds = board.reservations.map((row) => row.resourceId);
    expect(resourceIds).toEqual(expect.arrayContaining(lanes.map((lane) => lane.id)));
    expect(resourceIds).not.toContain(elsewhere.id);
    expect(board.resources.map((row) => row.id)).not.toContain(elsewhere.id);
    expect(board.resources.every((row) => row.name !== "Foreign lane")).toBe(true);
    expect(board.reservations.filter((row) => row.status === RESOURCE_RESERVATION_STATUSES.BOOKED)).toHaveLength(2);
    expect(board.reservations.some((row) => row.status === RESOURCE_RESERVATION_STATUSES.HOLD && row.startMinute === 19 * 60)).toBe(
      true,
    );
    expect(board.reservations.some((row) => row.startMinute === 12 * 60)).toBe(false);

    const foreign = await getMasterScheduleBoard(beta.ctx, db, { date: "2026-11-18" });
    expect(foreign.reservations).toHaveLength(0);
    expect(foreign.resources.map((row) => row.name)).toEqual(["Foreign lane"]);
  }, 60_000);

  it("requires calendar.view to read and events.create to start an employee event", async () => {
    const tenant = await provision("perms");
    await getMasterScheduleBoard(tenant.ctx, db, { date: "2026-11-18" });
    await dropPermission(tenant.organizationId, PERMISSIONS.CALENDAR_VIEW);
    invalidatePermissionCache(tenant.ctx);
    await expect(getMasterScheduleBoard(tenant.ctx, db, { date: "2026-11-18" })).rejects.toThrow();

    const creator = await provision("creator");
    await dropPermission(creator.organizationId, PERMISSIONS.EVENTS_CREATE);
    invalidatePermissionCache(creator.ctx);
    await expect(
      createEmployeeManualInquiry(creator.ctx, db, {
        firstName: "Ada",
        lastName: "Ng",
        email: "ada.sched@example.com",
        eventType: "Birthday Party",
        preferredDate: "2026-11-18",
        startTime: "17:00",
        guestCount: 10,
        desiredDurationMinutes: 120,
      }),
    ).rejects.toThrow();
  }, 60_000);
});
