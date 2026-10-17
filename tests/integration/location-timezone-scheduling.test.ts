import { afterAll, afterEach, describe, expect, it } from "vitest";

import {
  occupancyInstants,
  resolveSchedulingTimeZone,
} from "@/lib/inquiries/tenant-datetime";
import { evaluateLocationTimezoneCorrectionSafety } from "@/server/ops/location-timezone-correction";
import { weekdayKeyFromIsoDate } from "@/server/catalog/pricing";
import { deleteTestOrganizations } from "../helpers/cleanup-test-organizations";
import { createTestPrismaClient } from "../helpers/test-database";
import { futureEventDateOnWeekday } from "../helpers/future-event-date";

/**
 * Thursday far enough ahead to land in US daylight time so Indianapolis 18:00 → 22:00Z
 * and Pacific 18:00 → next-day 01:00Z stay stable (winter EST/PST would shift assertions).
 */
const EVENT_DATE = futureEventDateOnWeekday("thu", 250);
const EVENT_DATE_PLUS_1 = (() => {
  const d = new Date(`${EVENT_DATE}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
})();

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

describe("location timezone scheduling (TEST)", () => {
  it("uses location timezone for new occupancy instants and leaves stored instants untouched", async () => {
    const org = await createOrg({
      name: "Indiana Venue",
      slug: "indiana-venue",
      timezone: "America/Indiana/Indianapolis",
      locations: [{ name: "Main", slug: "main", timezone: "UTC" }],
    });
    const location = org.locations[0]!;
    const beforeZone = resolveSchedulingTimeZone({
      locationTimeZone: location.timezone,
      organizationTimeZone: org.timezone,
    });
    expect(beforeZone).toBe("UTC");

    const wrongInstant = occupancyInstants({
      slotDate: EVENT_DATE,
      startMinute: 18 * 60,
      endMinute: 20 * 60,
      timeZone: beforeZone,
    });

    const type = await db.resourceType.create({
      data: {
        organizationId: org.id,
        locationId: location.id,
        slug: "lane",
        name: "Lane",
        inventoryConfigured: true,
        active: true,
      },
    });
    const resource = await db.resource.create({
      data: {
        organizationId: org.id,
        resourceTypeId: type.id,
        locationId: location.id,
        name: "Lane 1",
        displayOrder: 1,
        active: true,
      },
    });
    const stored = await db.resourceReservation.create({
      data: {
        organizationId: org.id,
        locationId: location.id,
        resourceId: resource.id,
        status: "BOOKED",
        sourceType: "MANUAL",
        slotDate: new Date("2026-09-26T00:00:00.000Z"),
        startMinute: 17 * 60,
        endMinute: 19 * 60,
        startsAt: wrongInstant.startsAt,
        endsAt: wrongInstant.endsAt,
      },
    });
    const preservedStartsAt = stored.startsAt!.toISOString();

    const safety = evaluateLocationTimezoneCorrectionSafety({
      futureConfirmedOrHoldCount: 0,
      activeHoldCount: 0,
      currentLocationTimezone: location.timezone,
      expectedCurrentTimezone: "UTC",
      expectedCorrectedTimezone: "America/Indiana/Indianapolis",
    });
    expect(safety.ok).toBe(true);

    await db.location.update({
      where: { id: location.id },
      data: { timezone: "America/Indiana/Indianapolis" },
    });
    const after = await db.location.findFirstOrThrow({ where: { id: location.id } });
    const afterZone = resolveSchedulingTimeZone({
      locationTimeZone: after.timezone,
      organizationTimeZone: org.timezone,
    });
    expect(afterZone).toBe("America/Indiana/Indianapolis");

    const correctInstant = occupancyInstants({
      slotDate: EVENT_DATE,
      startMinute: 18 * 60,
      endMinute: 20 * 60,
      timeZone: afterZone,
    });
    expect(correctInstant.startsAt.toISOString()).toBe(`${EVENT_DATE}T22:00:00.000Z`);
    expect(wrongInstant.startsAt.toISOString()).toBe(`${EVENT_DATE}T18:00:00.000Z`);

    const reread = await db.resourceReservation.findFirstOrThrow({ where: { id: stored.id } });
    expect(reread.startsAt!.toISOString()).toBe(preservedStartsAt);
    expect(weekdayKeyFromIsoDate(EVENT_DATE, afterZone)).toBe("thu");
  });

  it("keeps a legitimate UTC tenant and a Pacific sibling location isolated", async () => {
    const utcOrg = await createOrg({
      name: "UTC Ops",
      slug: "utc-ops",
      timezone: "UTC",
      locations: [{ name: "HQ", slug: "hq", timezone: "UTC" }],
    });
    const multi = await createOrg({
      name: "Multi Zone",
      slug: "multi-zone",
      timezone: "America/Chicago",
      locations: [
        { name: "Indiana", slug: "indiana", timezone: "America/Indiana/Indianapolis" },
        { name: "Pacific", slug: "pacific", timezone: "America/Los_Angeles" },
      ],
    });

    const utcZone = resolveSchedulingTimeZone({
      locationTimeZone: utcOrg.locations[0]!.timezone,
      organizationTimeZone: utcOrg.timezone,
    });
    const indianaLoc = multi.locations.find((row) => row.slug === "indiana")!;
    const pacificLoc = multi.locations.find((row) => row.slug === "pacific")!;
    const indianaZone = resolveSchedulingTimeZone({
      locationTimeZone: indianaLoc.timezone,
      organizationTimeZone: multi.timezone,
    });
    const pacificZone = resolveSchedulingTimeZone({
      locationTimeZone: pacificLoc.timezone,
      organizationTimeZone: multi.timezone,
    });

    expect(utcZone).toBe("UTC");
    expect(indianaZone).toBe("America/Indiana/Indianapolis");
    expect(pacificZone).toBe("America/Los_Angeles");

    const localMinute = 18 * 60;
    const utcInstant = occupancyInstants({
      slotDate: EVENT_DATE,
      startMinute: localMinute,
      endMinute: localMinute + 120,
      timeZone: utcZone,
    }).startsAt.toISOString();
    const indianaInstant = occupancyInstants({
      slotDate: EVENT_DATE,
      startMinute: localMinute,
      endMinute: localMinute + 120,
      timeZone: indianaZone,
    }).startsAt.toISOString();
    const pacificInstant = occupancyInstants({
      slotDate: EVENT_DATE,
      startMinute: localMinute,
      endMinute: localMinute + 120,
      timeZone: pacificZone,
    }).startsAt.toISOString();

    expect(utcInstant).toBe(`${EVENT_DATE}T18:00:00.000Z`);
    expect(indianaInstant).toBe(`${EVENT_DATE}T22:00:00.000Z`);
    expect(pacificInstant).toBe(`${EVENT_DATE_PLUS_1}T01:00:00.000Z`);
    expect(new Set([utcInstant, indianaInstant, pacificInstant]).size).toBe(3);
  });

  it("refuses an unsafe correction when active holds exist", async () => {
    const result = evaluateLocationTimezoneCorrectionSafety({
      futureConfirmedOrHoldCount: 0,
      activeHoldCount: 1,
      currentLocationTimezone: "UTC",
      expectedCurrentTimezone: "UTC",
      expectedCorrectedTimezone: "America/Indiana/Indianapolis",
    });
    expect(result.ok).toBe(false);
  });
});
