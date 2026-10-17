/**
 * R7 — Stale availability / competing allocation on an exclusive resource.
 * Runs on Neon TEST via vitest.integration.config (isolated tenants, cleaned up).
 */
import { afterAll, afterEach, describe, expect, it } from "vitest";

import { createMemoryRateLimiter } from "@/lib/ai/rate-limiter";
import { ResourceError } from "@/server/errors";
import { resolveRequestContext } from "@/server/request-context";
import { createPublicInquiry } from "@/server/services/inquiry-service";
import { checkInquiryAvailability, startWorkingInquiry } from "@/server/services/live-agent-service";
import { placeProposalHold } from "@/server/services/proposal-hold-service";
import { provisionOrganization } from "@/server/services/provision-organization";
import { EVENT_PLAN_KINDS, INQUIRY_STATUSES } from "@/types/inquiry";
import { RESOURCE_RESERVATION_STATUSES } from "@/types/resource-schedule";
import { authorizeHoldHoursForInquiry } from "../helpers/authorize-test-hours-exception";
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

async function provisionTenant(suffix: string) {
  const result = await provisionOrganization(
    {
      clerkUserId: `user_r7_${suffix}_${crypto.randomUUID()}`,
      clerkOrganizationId: `clerk_org_r7_${suffix}_${crypto.randomUUID()}`,
      organizationName: `R7 Conflict ${suffix}`,
      organizationSlug: `r7-conflict-${suffix}-${crypto.randomUUID()}`,
      isClerkOrganizationAdmin: true,
    },
    db,
  );
  createdOrganizationIds.push(result.organizationId);
  const organization = await db.organization.findFirstOrThrow({
    where: { id: result.organizationId },
    include: { locations: true },
  });
  const profile = await db.userProfile.findFirstOrThrow({ where: { id: result.userProfileId } });
  const ctx = await resolveRequestContext(
    {
      clerkUserId: profile.clerkUserId,
      clerkOrganizationId: organization.clerkOrganizationId,
    },
    db,
  );
  return { ...result, ctx, organization };
}

async function seedExclusiveRoom(organizationId: string, locationId: string | null) {
  const type = await db.resourceType.create({
    data: {
      organizationId,
      locationId,
      name: "R7 Exclusive Suite",
      slug: `r7-exclusive-${crypto.randomUUID().slice(0, 8)}`,
      inventoryConfigured: true,
    },
  });
  const resource = await db.resource.create({
    data: {
      organizationId,
      resourceTypeId: type.id,
      locationId,
      name: "R7 Suite 1",
      displayOrder: 1,
    },
  });
  return { type, resource };
}

async function createCompetingInquiry(
  organization: { id: string; slug: string },
  type: { id: string; slug: string; name: string },
  label: string,
) {
  const created = await createPublicInquiry(
    db,
    {
      organizationSlug: organization.slug,
      rateLimitKey: `${organization.slug}:${crypto.randomUUID()}`,
      firstName: "R7",
      lastName: label,
      email: `r7.${label}.${crypto.randomUUID()}@example.com`,
      eventType: "Birthday Party",
      preferredDate: "2027-08-10",
      startTime: "15:00",
      guestCount: 8,
      guestMix: "mostly_adults",
      desiredDurationMinutes: 120,
      budgetBand: "1500_3000",
      eventGoal: "Celebration",
      diningPreference: "not_sure",
      spacePreference: "semi_private",
      attractionInterestIds: [],
      attractionMode: "recommend",
      submissionId: `r7_${label}_${crypto.randomUUID()}`,
    },
    undefined,
    unlimitedLimiter,
  );
  const plan = await db.eventPlanRecommendation.create({
    data: {
      organizationId: organization.id,
      inquiryId: created.inquiryId,
      kind: EVENT_PLAN_KINDS.RECOMMENDATION,
      tier: "best_fit",
      title: `R7 ${label} plan`,
      sortOrder: 0,
      estimatedTotalCents: 80_000,
      currency: "USD",
      guestCount: 8,
      durationMinutes: 60,
      customerFacingReason: "R7 conflict fixture plan",
      availabilityValidated: true,
      availabilityStatus: "AVAILABLE",
      payload: {
        guestCount: 8,
        eventDate: "2027-08-10",
        startTime: "15:00",
        durationMinutes: 60,
        activities: [{ knowledgeItemId: "r7", name: "Exclusive Suite", quantity: 1, priceCents: 80_000 }],
        dining: { label: "TBD", priceCents: 0 },
        spaces: [],
        schedule: [],
        pricingComplete: true,
        depositPreviewCents: 20_000,
        resourceRequirements: [
          {
            knowledgeItemId: "r7",
            knowledgeItemName: "Exclusive Suite",
            resourceTypeId: type.id,
            resourceTypeSlug: type.slug,
            resourceTypeName: type.name,
            quantityRule: "FIXED",
            quantity: 1,
            guestsPerUnit: null,
            durationMinutes: 60,
            inventoryConfigured: true,
            requiresStaffConfiguration: false,
          },
        ],
      },
    },
  });
  await db.inquiry.update({
    where: { id: created.inquiryId },
    data: { selectedEventPlanId: plan.id },
  });
  return { inquiryId: created.inquiryId, plan };
}

async function placeHold(
  tenant: { ctx: Awaited<ReturnType<typeof resolveRequestContext>>; organizationId: string },
  created: { inquiryId: string; plan: { id: string } },
) {
  const hours = await authorizeHoldHoursForInquiry({
    ctx: tenant.ctx,
    database: db,
    inquiryId: created.inquiryId,
  });
  return placeProposalHold(db, {
    organizationId: tenant.organizationId,
    inquiryId: created.inquiryId,
    planId: created.plan.id,
    selectPlan: true,
    hoursExceptionId: hours.id,
  });
}

describe("R7 stale availability and competing bookings", () => {
  it("lets both inquiries check availability, then blocks the second HOLD after the first occupies the exclusive unit", async () => {
    const tenant = await provisionTenant("stale");
    const locationId = tenant.organization.locations[0]?.id ?? null;
    const { type } = await seedExclusiveRoom(tenant.organizationId, locationId);

    const first = await createCompetingInquiry(tenant.organization, type, "first");
    const second = await createCompetingInquiry(tenant.organization, type, "second");

    await startWorkingInquiry(tenant.ctx, db, first.inquiryId);
    await startWorkingInquiry(tenant.ctx, db, second.inquiryId);

    const checkA = await checkInquiryAvailability(tenant.ctx, db, first.inquiryId);
    const checkB = await checkInquiryAvailability(tenant.ctx, db, second.inquiryId);
    expect(checkA.available).toBe(true);
    expect(checkB.available).toBe(true);

    await placeHold(tenant, first);

    const firstHolds = await db.resourceReservation.count({
      where: {
        inquiryId: first.inquiryId,
        releasedAt: null,
        status: RESOURCE_RESERVATION_STATUSES.HOLD,
      },
    });
    expect(firstHolds).toBe(1);

    await expect(placeHold(tenant, second)).rejects.toBeInstanceOf(ResourceError);

    const secondHolds = await db.resourceReservation.count({
      where: {
        inquiryId: second.inquiryId,
        releasedAt: null,
      },
    });
    const secondBookings = await db.booking.count({ where: { inquiryId: second.inquiryId } });
    const secondInquiry = await db.inquiry.findFirstOrThrow({ where: { id: second.inquiryId } });

    expect(secondHolds).toBe(0);
    expect(secondBookings).toBe(0);
    expect(secondInquiry.status).not.toBe(INQUIRY_STATUSES.BOOKED);

    const recheck = await checkInquiryAvailability(tenant.ctx, db, second.inquiryId);
    expect(recheck.available).toBe(false);
  }, 90_000);

  it("allows at most one concurrent HOLD when two inquiries race the same exclusive unit", async () => {
    const tenant = await provisionTenant("race");
    const locationId = tenant.organization.locations[0]?.id ?? null;
    const { type } = await seedExclusiveRoom(tenant.organizationId, locationId);

    const first = await createCompetingInquiry(tenant.organization, type, "race-a");
    const second = await createCompetingInquiry(tenant.organization, type, "race-b");
    await startWorkingInquiry(tenant.ctx, db, first.inquiryId);
    await startWorkingInquiry(tenant.ctx, db, second.inquiryId);
    expect((await checkInquiryAvailability(tenant.ctx, db, first.inquiryId)).available).toBe(true);
    expect((await checkInquiryAvailability(tenant.ctx, db, second.inquiryId)).available).toBe(true);

    const results = await Promise.allSettled([placeHold(tenant, first), placeHold(tenant, second)]);
    const fulfilled = results.filter((row) => row.status === "fulfilled");
    const rejected = results.filter((row) => row.status === "rejected");
    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);

    const activeHolds = await db.resourceReservation.findMany({
      where: {
        organizationId: tenant.organizationId,
        releasedAt: null,
        status: RESOURCE_RESERVATION_STATUSES.HOLD,
      },
    });
    expect(activeHolds).toHaveLength(1);

    const bookings = await db.booking.count({ where: { organizationId: tenant.organizationId } });
    expect(bookings).toBe(0);
  }, 90_000);
});
