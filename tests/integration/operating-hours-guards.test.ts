import { afterAll, afterEach, describe, expect, it } from "vitest";

import { BookingError, ResourceError } from "@/server/errors";
import {
  assertPendingOccupancyOrThrow,
  assertWritableOccupancyOrThrow,
} from "@/server/resources/scheduling-guards";
import {
  OPERATING_HOURS_EXCEPTION_KINDS,
  OPERATING_HOURS_VERIFICATION_STATUSES,
} from "@/types/operating-hours";
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

async function createOrg(input: {
  name: string;
  slug: string;
  timezone: string;
  locations: Array<{ name: string; slug: string; timezone: string }>;
}) {
  const organization = await db.organization.create({
    data: {
      name: input.name,
      slug: `${input.slug}-${crypto.randomUUID()}`,
      timezone: input.timezone,
      currency: "USD",
      locations: {
        create: input.locations.map((location) => ({
          name: location.name,
          slug: location.slug,
          timezone: location.timezone,
        })),
      },
    },
    include: { locations: { orderBy: { slug: "asc" } } },
  });
  createdOrganizationIds.push(organization.id);
  return organization;
}

async function seedVerifiedHours(
  organizationId: string,
  locationId: string,
  windows: Array<{ dayOfWeek: number; startMinute: number; endMinute: number }>,
  exceptions: Array<{
    localDate: string;
    kind: string;
    startMinute?: number | null;
    endMinute?: number | null;
  }> = [],
) {
  const policy = await db.locationOperatingHoursPolicy.create({
    data: {
      organizationId,
      locationId,
      verificationStatus: OPERATING_HOURS_VERIFICATION_STATUSES.VERIFIED,
      approvedAt: new Date("2026-10-01T00:00:00.000Z"),
      approvedByNote: "Synthetic test approval",
    },
  });
  if (windows.length > 0) {
    await db.locationOperatingHoursWindow.createMany({
      data: windows.map((row) => ({
        organizationId,
        locationId,
        policyId: policy.id,
        dayOfWeek: row.dayOfWeek,
        startMinute: row.startMinute,
        endMinute: row.endMinute,
      })),
    });
  }
  if (exceptions.length > 0) {
    await db.locationOperatingHoursException.createMany({
      data: exceptions.map((row) => ({
        organizationId,
        locationId,
        policyId: policy.id,
        localDate: new Date(`${row.localDate}T00:00:00.000Z`),
        kind: row.kind,
        startMinute: row.startMinute ?? null,
        endMinute: row.endMinute ?? null,
      })),
    });
  }
  return policy;
}

describe("operating-hours and local-time booking guards (TEST)", () => {
  it("blocks confirmed occupancy when hours are unconfigured unless a staff exception is used", async () => {
    const org = await createOrg({
      name: "Indiana Fail Closed",
      slug: "indiana-fail-closed",
      timezone: "America/Indiana/Indianapolis",
      locations: [{ name: "Main", slug: "main", timezone: "America/Indiana/Indianapolis" }],
    });
    const location = org.locations[0]!;
    await expect(
      assertWritableOccupancyOrThrow({
        database: db,
        organizationId: org.id,
        locationId: location.id,
        timeZone: "America/Indiana/Indianapolis",
        slotDate: "2026-10-22",
        startMinute: 14 * 60,
        endMinute: 16 * 60,
        flow: "test_confirm_unconfigured",
        errorKind: "booking",
      }),
    ).rejects.toMatchObject({ code: "OPERATING_HOURS_UNRESOLVED" });
  });

  it("allows pending bookings under legacy unconfigured hours without inventing open status", async () => {
    const org = await createOrg({
      name: "Indiana Unconfigured",
      slug: "indiana-unconfigured",
      timezone: "America/Indiana/Indianapolis",
      locations: [{ name: "Main", slug: "main", timezone: "America/Indiana/Indianapolis" }],
    });
    const location = org.locations[0]!;
    const result = await assertPendingOccupancyOrThrow({
      database: db,
      organizationId: org.id,
      locationId: location.id,
      timeZone: "America/Indiana/Indianapolis",
      slotDate: "2026-10-22",
      startMinute: 14 * 60,
      endMinute: 16 * 60,
      flow: "test_pending",
    });
    expect(result.ok).toBe(true);
    expect(result.aggregate.legacyCompatibilityAllow).toBe(true);
    expect(result.startsAt.toISOString()).toBe("2026-10-22T18:00:00.000Z");
  });

  it("blocks confirmed occupancy for invalid local time and verified closures", async () => {
    const org = await createOrg({
      name: "Indiana Verified",
      slug: "indiana-verified",
      timezone: "America/Indiana/Indianapolis",
      locations: [{ name: "Main", slug: "main", timezone: "America/Indiana/Indianapolis" }],
    });
    const location = org.locations[0]!;
    await seedVerifiedHours(
      org.id,
      location.id,
      [{ dayOfWeek: 4, startMinute: 12 * 60, endMinute: 22 * 60 }],
      [{ localDate: "2026-10-15", kind: OPERATING_HOURS_EXCEPTION_KINDS.CLOSED }],
    );

    await expect(
      assertWritableOccupancyOrThrow({
        database: db,
        organizationId: org.id,
        locationId: location.id,
        timeZone: "America/Indiana/Indianapolis",
        slotDate: "2026-03-08",
        startMinute: 150,
        endMinute: 210,
        flow: "test_confirm",
        errorKind: "booking",
      }),
    ).rejects.toBeInstanceOf(BookingError);

    await expect(
      assertWritableOccupancyOrThrow({
        database: db,
        organizationId: org.id,
        locationId: location.id,
        timeZone: "America/Indiana/Indianapolis",
        slotDate: "2026-10-15",
        startMinute: 14 * 60,
        endMinute: 16 * 60,
        flow: "test_confirm",
        errorKind: "resource",
      }),
    ).rejects.toBeInstanceOf(ResourceError);
  });

  it("isolates location hours across tenants and sibling locations", async () => {
    const multi = await createOrg({
      name: "Multi Hours",
      slug: "multi-hours",
      timezone: "America/Chicago",
      locations: [
        { name: "Indiana", slug: "indiana", timezone: "America/Indiana/Indianapolis" },
        { name: "Pacific", slug: "pacific", timezone: "America/Los_Angeles" },
      ],
    });
    const utcOrg = await createOrg({
      name: "UTC Hours",
      slug: "utc-hours",
      timezone: "UTC",
      locations: [{ name: "HQ", slug: "hq", timezone: "UTC" }],
    });
    const indiana = multi.locations.find((row) => row.slug === "indiana")!;
    const pacific = multi.locations.find((row) => row.slug === "pacific")!;
    await seedVerifiedHours(multi.id, indiana.id, [
      { dayOfWeek: 4, startMinute: 12 * 60, endMinute: 22 * 60 },
    ]);
    await seedVerifiedHours(multi.id, pacific.id, [
      { dayOfWeek: 4, startMinute: 9 * 60, endMinute: 12 * 60 },
    ]);

    const indianaOk = await assertWritableOccupancyOrThrow({
      database: db,
      organizationId: multi.id,
      locationId: indiana.id,
      timeZone: indiana.timezone,
      slotDate: "2026-10-22",
      startMinute: 14 * 60,
      endMinute: 16 * 60,
      flow: "test_indiana",
      errorKind: "booking",
    });
    expect(indianaOk.startsAt.toISOString()).toBe("2026-10-22T18:00:00.000Z");

    await expect(
      assertWritableOccupancyOrThrow({
        database: db,
        organizationId: multi.id,
        locationId: pacific.id,
        timeZone: pacific.timezone,
        slotDate: "2026-10-22",
        startMinute: 14 * 60,
        endMinute: 16 * 60,
        flow: "test_pacific",
        errorKind: "booking",
      }),
    ).rejects.toBeInstanceOf(BookingError);

    const utcOk = await assertPendingOccupancyOrThrow({
      database: db,
      organizationId: utcOrg.id,
      locationId: utcOrg.locations[0]!.id,
      timeZone: "UTC",
      slotDate: "2026-10-22",
      startMinute: 14 * 60,
      endMinute: 16 * 60,
      flow: "test_utc",
    });
    expect(utcOk.startsAt.toISOString()).toBe("2026-10-22T14:00:00.000Z");

    const foreign = await db.locationOperatingHoursPolicy.findFirst({
      where: { organizationId: utcOrg.id, locationId: indiana.id },
    });
    expect(foreign).toBeNull();
  });

  it("keeps historical booking rows readable without revalidation", async () => {
    const org = await createOrg({
      name: "Historical Compat",
      slug: "historical-compat",
      timezone: "America/Indiana/Indianapolis",
      locations: [{ name: "Main", slug: "main", timezone: "America/Indiana/Indianapolis" }],
    });
    const email = `hist.${crypto.randomUUID()}@example.com`;
    const inquiry = await db.inquiry.create({
      data: {
        organizationId: org.id,
        locationId: org.locations[0]!.id,
        status: "READY_FOR_HUMAN",
        source: "EMPLOYEE",
        customerEmail: email,
        customerEmailNormalized: email,
        customerFirstName: "Hist",
        guestCount: 8,
      },
    });
    const booking = await db.booking.create({
      data: {
        organizationId: org.id,
        inquiryId: inquiry.id,
        locationId: org.locations[0]!.id,
        bookingNumber: `HIST-${crypto.randomUUID().slice(0, 8)}`,
        status: "CONFIRMED",
        eventDate: new Date("2026-09-26T00:00:00.000Z"),
        startTime: "17:00",
        endTime: "19:00",
        startMinute: 17 * 60,
        endMinute: 19 * 60,
        // Historical UTC-shaped instant from R2D.1 era — must remain stored as-is.
        startsAt: new Date("2026-09-26T17:00:00.000Z"),
        endsAt: new Date("2026-09-26T19:00:00.000Z"),
        guestCount: 8,
        subtotalCents: 10000,
        taxCents: 0,
        totalCents: 10000,
        currency: "USD",
        customerEmail: email,
        payload: {},
      },
    });
    const reread = await db.booking.findFirstOrThrow({ where: { id: booking.id } });
    expect(reread.startsAt?.toISOString()).toBe("2026-09-26T17:00:00.000Z");
    expect(reread.taxCents).toBe(0);
  });
});
