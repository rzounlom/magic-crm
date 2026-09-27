import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createMemoryRateLimiter } from "@/lib/ai/rate-limiter";
import { readEventPlanPayload } from "@/lib/event-planner/payload";
import { loadBookingCatalogDataset } from "@/server/catalog/load-dataset";
import { resolveRequestContext } from "@/server/request-context";
import { cancelBooking, confirmInquiryBooking } from "@/server/services/booking-service";
import { importBookingCatalog } from "@/server/services/catalog-import-service";
import { bookPublicEventPlan } from "@/server/services/event-plan-service";
import { createPublicInquiry } from "@/server/services/inquiry-service";
import { provisionOrganization } from "@/server/services/provision-organization";
import { checkResourceAvailability } from "@/server/services/resource-availability-service";
import { getMasterScheduleDay } from "@/server/services/resource-schedule-service";
import { EVENT_PLAN_KINDS } from "@/types/inquiry";
import { EVENT_PLAN_TIERS, type EventPlanTier } from "@/types/event-planner";
import { RESOURCE_RESERVATION_STATUSES, type PlanResourceRequirement } from "@/types/resource-schedule";
import { deleteTestOrganizations } from "../helpers/cleanup-test-organizations";
import { createTestPrismaClient } from "../helpers/test-database";

const db = createTestPrismaClient();
const createdOrganizationIds: string[] = [];
const unlimitedLimiter = createMemoryRateLimiter();

const EXPECTED: Record<
  EventPlanTier,
  { axeMinutes: number; bowlingMinutes: number; roomSlug: string; roomName: string; includesArcade: boolean }
> = {
  [EVENT_PLAN_TIERS.BUDGET]: {
    axeMinutes: 30,
    bowlingMinutes: 60,
    roomSlug: "lower-event-room",
    roomName: "Lower Event Room",
    includesArcade: false,
  },
  [EVENT_PLAN_TIERS.BEST_FIT]: {
    axeMinutes: 60,
    bowlingMinutes: 60,
    roomSlug: "lower-event-room",
    roomName: "Lower Event Room",
    includesArcade: false,
  },
  [EVENT_PLAN_TIERS.PREMIUM]: {
    axeMinutes: 60,
    bowlingMinutes: 60,
    roomSlug: "skybox",
    roomName: "Skybox",
    includesArcade: true,
  },
};

const DATES: Record<EventPlanTier, string> = {
  [EVENT_PLAN_TIERS.BUDGET]: "2026-10-17",
  [EVENT_PLAN_TIERS.BEST_FIT]: "2026-10-18",
  [EVENT_PLAN_TIERS.PREMIUM]: "2026-10-24",
};

type Tenant = {
  organizationId: string;
  locationId: string;
  slug: string;
  ctx: Awaited<ReturnType<typeof resolveRequestContext>>;
};

let tenant: Tenant;
let interestIds: string[] = [];
const bookedInquiryIds = new Map<EventPlanTier, string>();

beforeAll(async () => {
  const provisioned = await provisionOrganization(
    {
      clerkUserId: `user_alloc_${crypto.randomUUID()}`,
      clerkOrganizationId: `clerk_org_alloc_${crypto.randomUUID()}`,
      organizationName: "Allocation Venue",
      organizationSlug: `alloc-${crypto.randomUUID()}`,
      isClerkOrganizationAdmin: true,
    },
    db,
  );
  createdOrganizationIds.push(provisioned.organizationId);
  const organization = await db.organization.findFirstOrThrow({ where: { id: provisioned.organizationId } });
  const profile = await db.userProfile.findFirstOrThrow({ where: { id: provisioned.userProfileId } });
  const ctx = await resolveRequestContext(
    { clerkUserId: profile.clerkUserId, clerkOrganizationId: organization.clerkOrganizationId },
    db,
  );
  await importBookingCatalog(db, {
    organizationSlug: organization.slug,
    dataset: loadBookingCatalogDataset(),
  });
  const interests = await db.attractionInterest.findMany({
    where: { organizationId: organization.id, slug: { in: ["axe-throwing", "bowling"] } },
    select: { id: true, slug: true },
  });
  interestIds = ["axe-throwing", "bowling"].map((slug) => interests.find((row) => row.slug === slug)?.id ?? "");
  tenant = {
    organizationId: organization.id,
    locationId: provisioned.locationId,
    slug: organization.slug,
    ctx,
  };
}, 60_000);

afterAll(async () => {
  await deleteTestOrganizations(db, createdOrganizationIds);
  await db.$disconnect();
}, 60_000);

describe("catalog physical resource allocation (postgres)", () => {
  it.each([EVENT_PLAN_TIERS.BUDGET, EVENT_PLAN_TIERS.BEST_FIT, EVENT_PLAN_TIERS.PREMIUM])(
    "persists exact physical resources for %s",
    async (tier) => {
      expect(interestIds.every((id) => id.length > 0)).toBe(true);
      const expected = EXPECTED[tier];
      const created = await createPublicInquiry(
        db,
        {
          organizationSlug: tenant.slug,
          rateLimitKey: `alloc:${tier}:${crypto.randomUUID()}`,
          firstName: "Alex",
          lastName: "Rivera",
          email: `alloc.${tier}.${crypto.randomUUID()}@example.com`,
          eventType: "Birthday Party",
          preferredDate: DATES[tier],
          startTime: "14:00",
          guestCount: 20,
          guestMix: "mostly_adults",
          foodPreference: "WANTS_FOOD",
          privateSpacePreference: "YES",
          budgetPreference: "FLEXIBLE",
          attractionMode: "known",
          attractionInterestIds: interestIds,
          submissionId: `sub_${crypto.randomUUID()}`,
        },
        undefined,
        unlimitedLimiter,
      );
      const plan = await db.eventPlanRecommendation.findFirstOrThrow({
        where: {
          organizationId: tenant.organizationId,
          inquiryId: created.inquiryId,
          kind: EVENT_PLAN_KINDS.RECOMMENDATION,
          tier,
        },
      });
      const durationMinutes = plan.durationMinutes;
      if (durationMinutes == null) {
        throw new Error("Plan is missing a duration");
      }
      await bookPublicEventPlan(
        db,
        { token: created.publicToken, planId: plan.id, rateLimitKey: `book:${tier}:${crypto.randomUUID()}` },
        unlimitedLimiter,
      );
      await confirmInquiryBooking(tenant.ctx, db, created.inquiryId);
      bookedInquiryIds.set(tier, created.inquiryId);

      const payload = readEventPlanPayload(plan.payload);
      const requirements = payload.resourceRequirements ?? [];
      const rows = await db.resourceReservation.findMany({
        where: { organizationId: tenant.organizationId, inquiryId: created.inquiryId, releasedAt: null },
        include: { resource: { include: { resourceType: true } } },
      });

      expect(rows.every((row) => row.status === RESOURCE_RESERVATION_STATUSES.BOOKED)).toBe(true);
      expect(rows.every((row) => row.organizationId === tenant.organizationId)).toBe(true);
      expect(rows.every((row) => row.locationId === tenant.locationId)).toBe(true);
      expect(rows.every((row) => row.resource.organizationId === tenant.organizationId)).toBe(true);
      expect(rows.every((row) => row.resource.locationId === tenant.locationId)).toBe(true);

      const requirementQuantity = requirements.reduce((sum, row) => sum + (row.quantity ?? 0), 0);
      expect(rows).toHaveLength(requirementQuantity);
      const requirementSlugs = new Set(requirements.map((row) => row.resourceTypeSlug));
      expect(rows.every((row) => requirementSlugs.has(row.resource.resourceType.slug))).toBe(true);

      expectWindow(rows, requirements, "axe-throwing-lane", expected.axeMinutes, 3);
      expectWindow(rows, requirements, "bowling-lane", expected.bowlingMinutes, 4);
      expectWindow(rows, requirements, expected.roomSlug, null, 1);
      const room = rows.find((row) => row.resource.resourceType.slug === expected.roomSlug);
      expect(room?.resource.name).toBe(expected.roomName);

      const activityStarts = requirements
        .filter((row) => row.resourceTypeSlug === "axe-throwing-lane" || row.resourceTypeSlug === "bowling-lane")
        .map((row) => clockMinutes(row.windowStartTime));
      const activityEnds = requirements
        .filter((row) => row.resourceTypeSlug === "axe-throwing-lane" || row.resourceTypeSlug === "bowling-lane")
        .map((row) => clockMinutes(row.windowEndTime));
      expect(room?.startMinute).toBeLessThanOrEqual(Math.min(...activityStarts));
      expect(room?.endMinute).toBeGreaterThanOrEqual(Math.max(...activityEnds));

      expect(rows.some((row) => /arcade/i.test(row.resource.name) || /arcade/i.test(row.resource.resourceType.slug))).toBe(
        false,
      );
      expect((payload.activities ?? []).some((activity) => /arcade/i.test(activity.name))).toBe(expected.includesArcade);

      const occupied = await checkResourceAvailability(db, {
        organizationId: tenant.organizationId,
        locationId: tenant.locationId,
        date: DATES[tier],
        startTime: "14:00",
        durationMinutes,
        resourceRequirements: requirements,
      });
      expect(occupied.available).toBe(false);
      const sameWindowIgnored = await checkResourceAvailability(db, {
        organizationId: tenant.organizationId,
        locationId: tenant.locationId,
        date: DATES[tier],
        startTime: "14:00",
        durationMinutes,
        resourceRequirements: requirements,
        excludeInquiryId: created.inquiryId,
      });
      expect(sameWindowIgnored.available).toBe(true);

      for (const slug of ["bowling-lane", "axe-throwing-lane", expected.roomSlug]) {
        const resourceType = await db.resourceType.findFirstOrThrow({
          where: { organizationId: tenant.organizationId, slug },
        });
        const day = await getMasterScheduleDay(tenant.ctx, db, { date: DATES[tier], resourceTypeId: resourceType.id });
        const reservedIds = new Set(
          rows.filter((row) => row.resource.resourceType.slug === slug).map((row) => row.resourceId),
        );
        const painted = (day?.reservations ?? []).filter((row) => reservedIds.has(row.resourceId));
        expect(painted).toHaveLength(reservedIds.size);
        for (const paintedRow of painted) {
          const source = rows.find((row) => row.resourceId === paintedRow.resourceId);
          expect(paintedRow.startMinute).toBe(source?.startMinute);
          expect(paintedRow.endMinute).toBe(source?.endMinute);
          expect(paintedRow.status).toBe(RESOURCE_RESERVATION_STATUSES.BOOKED);
        }
      }
    },
    60_000,
  );

  it(
    "releases every active reservation when the confirmed booking is cancelled",
    async () => {
      const inquiryId = bookedInquiryIds.get(EVENT_PLAN_TIERS.BUDGET);
      expect(inquiryId).toBeTruthy();
      const before = await db.resourceReservation.findMany({
        where: { inquiryId, releasedAt: null },
        select: { resourceId: true },
      });
      expect(before.length).toBeGreaterThan(0);
      await cancelBooking(tenant.ctx, db, { inquiryId });
      const afterCancel = await db.resourceReservation.findMany({ where: { inquiryId } });
      expect(afterCancel.every((row) => row.releasedAt instanceof Date)).toBe(true);
      const bowlingType = await db.resourceType.findFirstOrThrow({
        where: { organizationId: tenant.organizationId, slug: "bowling-lane" },
      });
      const cleared = await getMasterScheduleDay(tenant.ctx, db, {
        date: DATES[EVENT_PLAN_TIERS.BUDGET],
        resourceTypeId: bowlingType.id,
      });
      const releasedIds = new Set(before.map((row) => row.resourceId));
      expect((cleared?.reservations ?? []).some((row) => releasedIds.has(row.resourceId))).toBe(false);
    },
    60_000,
  );
});

function clockMinutes(value: string | null | undefined): number {
  const match = /^(\d{2}):(\d{2})/.exec(value ?? "");
  if (!match) {
    throw new Error("Resource requirement is missing a clock window");
  }
  return Number(match[1]) * 60 + Number(match[2]);
}

function expectWindow(
  rows: Array<{
    startMinute: number;
    endMinute: number;
    resourceId: string;
    resource: { resourceType: { slug: string } };
  }>,
  requirements: PlanResourceRequirement[],
  slug: string,
  durationMinutes: number | null,
  quantity: number,
) {
  const requirement = requirements.find((row) => row.resourceTypeSlug === slug);
  expect(requirement?.quantity).toBe(quantity);
  const start = clockMinutes(requirement?.windowStartTime);
  const end = clockMinutes(requirement?.windowEndTime);
  if (durationMinutes != null) {
    expect(end - start).toBe(durationMinutes);
  }
  const matches = rows.filter((row) => row.resource.resourceType.slug === slug);
  expect(matches).toHaveLength(quantity);
  expect(new Set(matches.map((row) => row.resourceId)).size).toBe(quantity);
  for (const row of matches) {
    expect(row.startMinute).toBe(start);
    expect(row.endMinute).toBe(end);
  }
}
