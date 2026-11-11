import { afterAll, afterEach, describe, expect, it } from "vitest";

import { AuthorizationError, ResourceError } from "@/server/errors";
import {
  getLocationOperatingHoursForAdmin,
  listLocationsOperatingHoursForAdmin,
  saveWeeklyOperatingHoursDraft,
  upsertOperatingHoursDateException,
  verifyOperatingHoursPolicy,
} from "@/server/services/operating-hours-admin-service";
import { evaluateOperatingHours } from "@/server/resources/operating-hours";
import { assertWritableOccupancyOrThrow } from "@/server/resources/scheduling-guards";
import {
  OPERATING_HOURS_EXCEPTION_KINDS,
  OPERATING_HOURS_VERIFICATION_STATUSES,
} from "@/types/operating-hours";
import { PERMISSIONS } from "@/types/permissions";
import { deleteTestOrganizations } from "../helpers/cleanup-test-organizations";
import { createTestPrismaClient } from "../helpers/test-database";
import { futureEventDateOnWeekday } from "../helpers/future-event-date";

const db = createTestPrismaClient();
const createdOrganizationIds: string[] = [];

afterEach(async () => {
  await deleteTestOrganizations(db, createdOrganizationIds);
  createdOrganizationIds.length = 0;
}, 60_000);

afterAll(async () => {
  await db.$disconnect();
});

async function seedTenant() {
  const organization = await db.organization.create({
    data: {
      name: `hours-admin-${crypto.randomUUID()}`,
      slug: `hours-admin-${crypto.randomUUID()}`,
      timezone: "America/Indiana/Indianapolis",
      currency: "USD",
      locations: {
        create: [
          {
            name: "Main Location",
            slug: "main",
            timezone: "America/Indiana/Indianapolis",
          },
        ],
      },
    },
    include: { locations: true },
  });
  createdOrganizationIds.push(organization.id);
  const admin = await db.userProfile.create({
    data: {
      organizationId: organization.id,
      clerkUserId: `user_${crypto.randomUUID()}`,
      email: `admin-${crypto.randomUUID()}@example.com`,
    },
  });
  const sales = await db.userProfile.create({
    data: {
      organizationId: organization.id,
      clerkUserId: `user_${crypto.randomUUID()}`,
      email: `sales-${crypto.randomUUID()}@example.com`,
    },
  });
  const manageDef = await db.permissionDefinition.upsert({
    where: { key: PERMISSIONS.LOCATIONS_MANAGE },
    create: {
      key: PERMISSIONS.LOCATIONS_MANAGE,
      module: "locations",
      name: "Manage locations",
      description: "Create and update locations.",
      active: true,
    },
    update: { active: true },
  });
  const adminGroup = await db.securityGroup.create({
    data: {
      organizationId: organization.id,
      name: "Administrators",
      systemKey: "administrators",
      isSystem: true,
    },
  });
  const salesGroup = await db.securityGroup.create({
    data: {
      organizationId: organization.id,
      name: "Event Sales",
      systemKey: "event_sales",
      isSystem: true,
    },
  });
  await db.securityGroupPermission.create({
    data: {
      organizationId: organization.id,
      securityGroupId: adminGroup.id,
      permissionDefinitionId: manageDef.id,
    },
  });
  await db.securityGroupMember.createMany({
    data: [
      {
        organizationId: organization.id,
        securityGroupId: adminGroup.id,
        userProfileId: admin.id,
      },
      {
        organizationId: organization.id,
        securityGroupId: salesGroup.id,
        userProfileId: sales.id,
      },
    ],
  });
  return {
    organization,
    location: organization.locations[0]!,
    adminCtx: {
      organizationId: organization.id,
      userId: admin.id,
      clerkUserId: admin.clerkUserId,
      clerkOrganizationId: `org_${organization.id}`,
      locationId: organization.locations[0]!.id,
    },
    salesCtx: {
      organizationId: organization.id,
      userId: sales.id,
      clerkUserId: sales.clerkUserId,
      clerkOrganizationId: `org_${organization.id}`,
      locationId: organization.locations[0]!.id,
    },
  };
}

describe("operating hours administration", () => {
  it("lets administrators draft, exception, and verify hours without inventing Production data", async () => {
    const { location, adminCtx, salesCtx, organization } = await seedTenant();

    await expect(listLocationsOperatingHoursForAdmin(salesCtx, db)).rejects.toBeInstanceOf(
      AuthorizationError,
    );

    await saveWeeklyOperatingHoursDraft(adminCtx, db, {
      locationId: location.id,
      windows: [
        { dayOfWeek: 4, startMinute: 600, endMinute: 1320 },
        { dayOfWeek: 5, startMinute: 1080, endMinute: 1560 },
      ],
    });

    const thursday = futureEventDateOnWeekday("thu", 250);
    await upsertOperatingHoursDateException(adminCtx, db, {
      locationId: location.id,
      exception: {
        localDate: thursday,
        kind: OPERATING_HOURS_EXCEPTION_KINDS.CLOSED,
        note: "Synthetic holiday closure for test",
      },
    });

    const beforeVerify = await getLocationOperatingHoursForAdmin(adminCtx, db, location.id);
    expect(beforeVerify.policy?.verificationStatus).toBe(OPERATING_HOURS_VERIFICATION_STATUSES.DRAFT);
    expect(beforeVerify.policy?.weeklyWindows).toHaveLength(2);
    expect(beforeVerify.policy?.exceptions).toHaveLength(1);

    await expect(
      assertWritableOccupancyOrThrow({
        database: db,
        organizationId: organization.id,
        locationId: location.id,
        timeZone: location.timezone,
        slotDate: thursday,
        startMinute: 720,
        endMinute: 780,
        flow: "test_draft_hours_block",
        errorKind: "resource",
      }),
    ).rejects.toBeInstanceOf(ResourceError);

    await verifyOperatingHoursPolicy(adminCtx, db, {
      locationId: location.id,
      approvedByNote: "Owner-approved synthetic test hours for isolation suite",
    });

    const afterVerify = await getLocationOperatingHoursForAdmin(adminCtx, db, location.id);
    expect(afterVerify.policy?.verificationStatus).toBe(OPERATING_HOURS_VERIFICATION_STATUSES.VERIFIED);

    const closedEval = evaluateOperatingHours({
      policy: {
        verificationStatus: OPERATING_HOURS_VERIFICATION_STATUSES.VERIFIED,
        weeklyWindows: afterVerify.policy!.weeklyWindows.map((row) => ({
          dayOfWeek: row.dayOfWeek,
          startMinute: row.startMinute,
          endMinute: row.endMinute,
        })),
        exceptions: afterVerify.policy!.exceptions.map((row) => ({
          localDate: row.localDate.toISOString().slice(0, 10),
          kind: row.kind,
          startMinute: row.startMinute,
          endMinute: row.endMinute,
        })),
      },
      slotDate: thursday,
      startMinute: 720,
      endMinute: 780,
    });
    expect(closedEval.status).toBe("OUTSIDE_HOURS");

    const friday = futureEventDateOnWeekday("fri", 251);
    await expect(
      assertWritableOccupancyOrThrow({
        database: db,
        organizationId: organization.id,
        locationId: location.id,
        timeZone: location.timezone,
        slotDate: friday,
        startMinute: 1100,
        endMinute: 1160,
        flow: "test_verified_hours_allow",
        errorKind: "resource",
      }),
    ).resolves.toMatchObject({ operatingHours: { status: "WITHIN_HOURS" } });

    const foreign = await db.organization.create({
      data: {
        name: `hours-foreign-${crypto.randomUUID()}`,
        slug: `hours-foreign-${crypto.randomUUID()}`,
        timezone: "America/New_York",
        currency: "USD",
        locations: {
          create: [{ name: "Other", slug: "other", timezone: "America/New_York" }],
        },
      },
      include: { locations: true },
    });
    createdOrganizationIds.push(foreign.id);
    await expect(
      getLocationOperatingHoursForAdmin(adminCtx, db, foreign.locations[0]!.id),
    ).rejects.toBeInstanceOf(ResourceError);
  });
});
