import { afterAll, afterEach, describe, expect, it } from "vitest";

import { createMemoryRateLimiter } from "@/lib/ai/rate-limiter";
import { readEventPlanPayload } from "@/lib/event-planner/payload";
import { loadBookingCatalogDataset } from "@/server/catalog/load-dataset";
import { importBookingCatalog } from "@/server/services/catalog-import-service";
import { createPublicInquiry } from "@/server/services/inquiry-service";
import { provisionOrganization } from "@/server/services/provision-organization";
import { reserveResourcesInTransaction } from "@/server/services/resource-availability-service";
import { rangesOverlap, parseClockToMinutes } from "@/server/resources/time-window";
import { EVENT_PLAN_KINDS } from "@/types/inquiry";
import { EVENT_PLAN_TIERS } from "@/types/event-planner";
import { RESOURCE_RESERVATION_SOURCES, RESOURCE_RESERVATION_STATUSES } from "@/types/resource-schedule";
import { deleteTestOrganizations } from "../helpers/cleanup-test-organizations";
import { createTestPrismaClient } from "../helpers/test-database";

const db = createTestPrismaClient();
const createdOrganizationIds: string[] = [];
const unlimitedLimiter = createMemoryRateLimiter();

afterEach(async () => {
  await deleteTestOrganizations(db, createdOrganizationIds);
  createdOrganizationIds.length = 0;
}, 60_000);

afterAll(async () => {
  await db.$disconnect();
});

describe("proposal nearby search (postgres)", () => {
  it("shifts a full bowling window without a long transaction or new reservations", async () => {
    const result = await provisionOrganization(
      {
        clerkUserId: `user_near_${crypto.randomUUID()}`,
        clerkOrganizationId: `clerk_org_near_${crypto.randomUUID()}`,
        organizationName: "Nearby search",
        organizationSlug: `nearby-${crypto.randomUUID()}`,
        isClerkOrganizationAdmin: true,
      },
      db,
    );
    createdOrganizationIds.push(result.organizationId);
    const organization = await db.organization.findFirstOrThrow({ where: { id: result.organizationId } });
    await importBookingCatalog(db, {
      organizationSlug: organization.slug,
      dataset: loadBookingCatalogDataset(),
    });

    const lanes = await db.resource.findMany({
      where: { organizationId: organization.id, resourceType: { slug: "bowling-lane" } },
      orderBy: { displayOrder: "asc" },
    });
    expect(lanes).toHaveLength(8);
    const partyA = lanes.slice(0, 4).map((row) => row.id);
    const partyB = lanes.slice(4).map((row) => row.id);
    await reserveResourcesInTransaction(db, {
      organizationId: organization.id,
      status: RESOURCE_RESERVATION_STATUSES.BOOKED,
      sourceType: RESOURCE_RESERVATION_SOURCES.BOOKING,
      slotDate: "2026-10-15",
      startMinute: 18 * 60,
      endMinute: 19 * 60,
      resourceIds: partyA,
      reason: "Party A",
    });
    await reserveResourcesInTransaction(db, {
      organizationId: organization.id,
      status: RESOURCE_RESERVATION_STATUSES.BOOKED,
      sourceType: RESOURCE_RESERVATION_SOURCES.BOOKING,
      slotDate: "2026-10-15",
      startMinute: 18 * 60,
      endMinute: 19 * 60,
      resourceIds: partyB,
      reason: "Party B",
    });
    const reservationsBefore = await db.resourceReservation.count({
      where: { organizationId: organization.id, releasedAt: null },
    });
    expect(reservationsBefore).toBe(8);

    const created = await createPublicInquiry(
      db,
      {
        organizationSlug: organization.slug,
        rateLimitKey: `near:${crypto.randomUUID()}`,
        firstName: "Party",
        lastName: "C",
        email: `party.c.${crypto.randomUUID()}@example.com`,
        eventType: "Birthday Party",
        preferredDate: "2026-10-15",
        startTime: "17:00",
        guestCount: 20,
        guestMix: "mixed_ages",
        desiredDurationMinutes: 120,
        budgetBand: "1500_3000",
        eventGoal: "Celebration",
        diningPreference: "pizza_light",
        spacePreference: "semi_private",
        attractionInterestIds: [],
        attractionMode: "recommend",
        submissionId: `sub_${crypto.randomUUID()}`,
      },
      undefined,
      unlimitedLimiter,
    );

    const good = await db.eventPlanRecommendation.findFirstOrThrow({
      where: {
        inquiryId: created.inquiryId,
        kind: EVENT_PLAN_KINDS.RECOMMENDATION,
        tier: EVENT_PLAN_TIERS.BUDGET,
      },
    });
    const payload = readEventPlanPayload(good.payload);
    expect(good.durationMinutes).toBe(120);
    expect(payload.startTime).not.toBe("17:00");
    expect(payload.itineraryAdjusted).toBe(true);
    const bowling = (payload.itinerary ?? []).find((segment) => segment.label.toLowerCase().includes("bowling"));
    expect(bowling).toBeTruthy();
    const bowlingStart = parseClockToMinutes(bowling?.startTime);
    const bowlingEnd = parseClockToMinutes(bowling?.endTime);
    expect(bowlingStart).not.toBeNull();
    expect(bowlingEnd).not.toBeNull();
    expect(
      rangesOverlap(
        { startMinute: bowlingStart ?? 0, endMinute: bowlingEnd ?? 0 },
        { startMinute: 18 * 60, endMinute: 19 * 60 },
      ),
    ).toBe(false);

    expect(
      await db.resourceReservation.count({ where: { organizationId: organization.id, releasedAt: null } }),
    ).toBe(reservationsBefore);
    expect(await db.booking.count({ where: { inquiryId: created.inquiryId } })).toBe(0);
    expect(
      await db.resourceReservation.count({
        where: { inquiryId: created.inquiryId, status: RESOURCE_RESERVATION_STATUSES.HOLD },
      }),
    ).toBe(0);
  }, 60_000);
});
