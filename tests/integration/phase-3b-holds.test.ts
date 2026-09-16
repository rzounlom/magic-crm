import { afterAll, afterEach, describe, expect, it } from "vitest";

import { createMemoryRateLimiter } from "@/lib/ai/rate-limiter";
import { InquiryError } from "@/server/errors";
import { resolveRequestContext } from "@/server/request-context";
import { confirmHeldBooking } from "@/server/services/booking-service";
import { checkResourceAvailability } from "@/server/services/resource-availability-service";
import { expireHold, expireInquiryHoldsNow, placeProposalHold } from "@/server/services/proposal-hold-service";
import { reservePublicEventPlan, selectPublicEventPlan } from "@/server/services/event-plan-service";
import { createPublicInquiry } from "@/server/services/inquiry-service";
import { startWorkingInquiry } from "@/server/services/live-agent-service";
import { provisionOrganization } from "@/server/services/provision-organization";
import { getMasterScheduleDay } from "@/server/services/resource-schedule-service";
import { BOOKING_STATUSES } from "@/types/booking";
import { EVENT_PLAN_KINDS, INQUIRY_SALES_STAGES, INQUIRY_STATUSES } from "@/types/inquiry";
import { RESOURCE_RESERVATION_STATUSES } from "@/types/resource-schedule";
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

async function provisionTenant(suffix: string, extras: { timezone?: string; depositPercent?: number } = {}) {
  const result = await provisionOrganization(
    {
      clerkUserId: `user_hold_${suffix}_${crypto.randomUUID()}`,
      clerkOrganizationId: `clerk_org_hold_${suffix}_${crypto.randomUUID()}`,
      organizationName: `Hold ${suffix}`,
      organizationSlug: `hold-${suffix}-${crypto.randomUUID()}`,
      isClerkOrganizationAdmin: true,
    },
    db,
  );
  createdOrganizationIds.push(result.organizationId);
  if (extras.timezone) {
    await db.organization.update({ where: { id: result.organizationId }, data: { timezone: extras.timezone } });
  }
  if (extras.depositPercent != null) {
    await db.organization.update({
      where: { id: result.organizationId },
      data: { depositPercent: extras.depositPercent },
    });
  }
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

async function seedLanes(organizationId: string, locationId: string | null, count: number) {
  const type = await db.resourceType.create({
    data: {
      organizationId,
      locationId,
      name: "Test Lane",
      slug: `test-lane-${crypto.randomUUID().slice(0, 8)}`,
      inventoryConfigured: true,
    },
  });
  const resources = [];
  for (let i = 1; i <= count; i += 1) {
    resources.push(
      await db.resource.create({
        data: {
          organizationId,
          resourceTypeId: type.id,
          locationId,
          name: `Test Lane ${i}`,
          displayOrder: i,
        },
      }),
    );
  }
  return { type, resources };
}

async function createPlanInquiry(
  organization: { id: string; slug: string; locationId?: string | null },
  type: { id: string; slug: string; name: string },
  quantity: number,
) {
  const created = await createPublicInquiry(
    db,
    {
      organizationSlug: organization.slug,
      rateLimitKey: `${organization.slug}:${crypto.randomUUID()}`,
      firstName: "Ada",
      lastName: "Lovelace",
      email: `ada.${crypto.randomUUID()}@example.com`,
      eventType: "Birthday Party",
      preferredDate: "2026-10-15",
      startTime: "18:00",
      guestCount: 12,
      guestMix: "mostly_children",
      desiredDurationMinutes: 180,
      budgetBand: "1500_3000",
      eventGoal: "Celebration",
      diningPreference: "pizza_light",
      spacePreference: "no_preference",
      attractionInterestIds: [],
      attractionMode: "recommend",
      submissionId: `sub_${crypto.randomUUID()}`,
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
      title: "Test Hold Plan",
      sortOrder: 0,
      estimatedTotalCents: 100_000,
      currency: "USD",
      guestCount: 12,
      durationMinutes: 60,
      customerFacingReason: "Test plan",
      availabilityValidated: true,
      availabilityStatus: "AVAILABLE",
      payload: {
        guestCount: 12,
        eventDate: "2026-10-15",
        startTime: "18:00",
        durationMinutes: 60,
        activities: [{ knowledgeItemId: "bowl", name: "Bowling", quantity: 1, priceCents: 100_000 }],
        dining: { label: "Pizza", priceCents: 0 },
        spaces: [],
        schedule: [],
        pricingComplete: true,
        depositPreviewCents: 30_000,
        resourceRequirements: [
          {
            knowledgeItemId: "bowl",
            knowledgeItemName: "Bowling",
            resourceTypeId: type.id,
            resourceTypeSlug: type.slug,
            resourceTypeName: type.name,
            quantityRule: "FIXED",
            quantity,
            guestsPerUnit: null,
            durationMinutes: 60,
            inventoryConfigured: true,
            requiresStaffConfiguration: false,
          },
        ],
      },
    },
  });
  return { ...created, plan };
}

describe("phase 3B holds and schedule (postgres)", () => {
  it("places an exact 24-hour hold on customer reserve and leaves follow-up without inventory", async () => {
    const tenant = await provisionTenant("path");
    const locationId = tenant.organization.locations[0]?.id ?? null;
    const { type } = await seedLanes(tenant.organizationId, locationId, 2);
    const reserved = await createPlanInquiry(tenant.organization, type, 1);
    const follow = await createPlanInquiry(tenant.organization, type, 1);

    const hold = await reservePublicEventPlan(
      db,
      { token: reserved.publicToken, planId: reserved.plan.id, rateLimitKey: reserved.publicToken },
      unlimitedLimiter,
    );
    expect(hold.hold.resourceCount).toBe(1);
    expect(hold.hold.depositRequiredCents).toBe(30_000);
    const inquiry = await db.inquiry.findFirstOrThrow({ where: { id: reserved.inquiryId } });
    expect(inquiry.salesStage).toBe(INQUIRY_SALES_STAGES.HOLD_PLACED);
    expect(inquiry.status).toBe(INQUIRY_STATUSES.READY_FOR_HUMAN);
    const rows = await db.resourceReservation.findMany({ where: { inquiryId: reserved.inquiryId } });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe(RESOURCE_RESERVATION_STATUSES.HOLD);
    expect(rows[0]?.expiresAt?.getTime()).toBeGreaterThan(Date.now() + 23 * 60 * 60 * 1000);

    await selectPublicEventPlan(
      db,
      { token: follow.publicToken, planId: follow.plan.id, rateLimitKey: follow.publicToken },
      unlimitedLimiter,
    );
    const followInquiry = await db.inquiry.findFirstOrThrow({ where: { id: follow.inquiryId } });
    expect(followInquiry.salesStage).toBe(INQUIRY_SALES_STAGES.READY_TO_BOOK);
    expect(await db.resourceReservation.count({ where: { inquiryId: follow.inquiryId } })).toBe(0);
  }, 60_000);

  it("lets only one concurrent hold win the same physical resource", async () => {
    const tenant = await provisionTenant("race");
    const locationId = tenant.organization.locations[0]?.id ?? null;
    const { type } = await seedLanes(tenant.organizationId, locationId, 1);
    const first = await createPlanInquiry(tenant.organization, type, 1);
    const second = await createPlanInquiry(tenant.organization, type, 1);

    const results = await Promise.allSettled([
      reservePublicEventPlan(
        db,
        { token: first.publicToken, planId: first.plan.id, rateLimitKey: first.publicToken },
        unlimitedLimiter,
      ),
      reservePublicEventPlan(
        db,
        { token: second.publicToken, planId: second.plan.id, rateLimitKey: second.publicToken },
        unlimitedLimiter,
      ),
    ]);
    const wins = results.filter((row) => row.status === "fulfilled");
    const losses = results.filter((row) => row.status === "rejected");
    expect(wins).toHaveLength(1);
    expect(losses).toHaveLength(1);
    const loss = losses[0];
    expect(loss.status).toBe("rejected");
    if (loss.status === "rejected") {
      expect(loss.reason).toBeInstanceOf(InquiryError);
      expect((loss.reason as InquiryError).code).toBe("AVAILABILITY_CHANGED");
    }
    expect(
      await db.resourceReservation.count({
        where: {
          organizationId: tenant.organizationId,
          status: RESOURCE_RESERVATION_STATUSES.HOLD,
          releasedAt: null,
        },
      }),
    ).toBe(1);
  }, 60_000);

  it("does not leave a partial multi-resource hold", async () => {
    const tenant = await provisionTenant("atomic");
    const locationId = tenant.organization.locations[0]?.id ?? null;
    const { type, resources } = await seedLanes(tenant.organizationId, locationId, 4);
    await db.resourceReservation.create({
      data: {
        organizationId: tenant.organizationId,
        locationId,
        resourceId: resources[0]!.id,
        status: RESOURCE_RESERVATION_STATUSES.BOOKED,
        slotDate: new Date("2026-10-15T00:00:00.000Z"),
        startMinute: 18 * 60,
        endMinute: 19 * 60,
        sourceType: "MANUAL",
      },
    });
    const created = await createPlanInquiry(tenant.organization, type, 4);
    await expect(
      placeProposalHold(db, {
        organizationId: tenant.organizationId,
        inquiryId: created.inquiryId,
        planId: created.plan.id,
        selectPlan: true,
      }),
    ).rejects.toBeInstanceOf(Error);
    expect(await db.resourceReservation.count({ where: { inquiryId: created.inquiryId } })).toBe(0);
    const inquiry = await db.inquiry.findFirstOrThrow({ where: { id: created.inquiryId } });
    expect(inquiry.salesStage).not.toBe(INQUIRY_SALES_STAGES.HOLD_PLACED);
  }, 60_000);

  it("treats double-click reserve as one logical hold", async () => {
    const tenant = await provisionTenant("idem");
    const locationId = tenant.organization.locations[0]?.id ?? null;
    const { type } = await seedLanes(tenant.organizationId, locationId, 2);
    const created = await createPlanInquiry(tenant.organization, type, 1);
    const results = await Promise.all([
      reservePublicEventPlan(
        db,
        { token: created.publicToken, planId: created.plan.id, rateLimitKey: `${created.publicToken}-a` },
        unlimitedLimiter,
      ),
      reservePublicEventPlan(
        db,
        { token: created.publicToken, planId: created.plan.id, rateLimitKey: `${created.publicToken}-b` },
        unlimitedLimiter,
      ),
    ]);
    expect(results.some((row) => row.hold.reused) || results.every((row) => row.hold.inquiryId === created.inquiryId)).toBe(
      true,
    );
    expect(await db.resourceReservation.count({ where: { inquiryId: created.inquiryId, releasedAt: null } })).toBe(1);
  }, 60_000);

  it("expires holds with a controllable clock and never expires BOOKED rows", async () => {
    const tenant = await provisionTenant("exp");
    const locationId = tenant.organization.locations[0]?.id ?? null;
    const { type, resources } = await seedLanes(tenant.organizationId, locationId, 1);
    const created = await createPlanInquiry(tenant.organization, type, 1);
    const t0 = new Date("2026-09-16T16:00:00.000Z");
    await placeProposalHold(db, {
      organizationId: tenant.organizationId,
      inquiryId: created.inquiryId,
      planId: created.plan.id,
      selectPlan: true,
      now: t0,
    });
    const stillActive = await checkResourceAvailability(db, {
      organizationId: tenant.organizationId,
      locationId,
      date: "2026-10-15",
      startTime: "18:00",
      durationMinutes: 60,
      now: new Date(t0.getTime() + 23 * 60 * 60 * 1000 + 59 * 60 * 1000),
      resourceRequirements: [
        {
          knowledgeItemId: "bowl",
          knowledgeItemName: "Bowling",
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
    });
    expect(stillActive.available).toBe(false);

    const expiredAt = new Date(t0.getTime() + 24 * 60 * 60 * 1000);
    await expireHold(db, { organizationId: tenant.organizationId, now: expiredAt });
    const after = await checkResourceAvailability(db, {
      organizationId: tenant.organizationId,
      locationId,
      date: "2026-10-15",
      startTime: "18:00",
      durationMinutes: 60,
      now: expiredAt,
      resourceRequirements: [
        {
          knowledgeItemId: "bowl",
          knowledgeItemName: "Bowling",
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
    });
    expect(after.available).toBe(true);
    await expireHold(db, { organizationId: tenant.organizationId, now: expiredAt });
    await expireInquiryHoldsNow(db, { organizationId: tenant.organizationId, inquiryId: created.inquiryId, now: expiredAt });

    await db.resourceReservation.create({
      data: {
        organizationId: tenant.organizationId,
        locationId,
        resourceId: resources[0]!.id,
        status: RESOURCE_RESERVATION_STATUSES.BOOKED,
        slotDate: new Date("2026-10-16T00:00:00.000Z"),
        startMinute: 18 * 60,
        endMinute: 19 * 60,
        sourceType: "BOOKING",
        expiresAt: expiredAt,
      },
    });
    await expireHold(db, { organizationId: tenant.organizationId, now: new Date(expiredAt.getTime() + 60_000) });
    expect(
      await db.resourceReservation.count({
        where: {
          organizationId: tenant.organizationId,
          status: RESOURCE_RESERVATION_STATUSES.BOOKED,
          releasedAt: null,
        },
      }),
    ).toBe(1);
  }, 60_000);

  it("keeps tenant and location inventory isolated and uses tenant-local schedule days", async () => {
    const tenantA = await provisionTenant("iso-a", { timezone: "America/New_York", depositPercent: 30 });
    const tenantB = await provisionTenant("iso-b", { timezone: "America/Los_Angeles", depositPercent: 20 });
    const locationA = tenantA.organization.locations[0]?.id ?? null;
    const locationB = tenantB.organization.locations[0]?.id ?? null;
    const seededA = await seedLanes(tenantA.organizationId, locationA, 1);
    const seededB = await seedLanes(tenantB.organizationId, locationB, 1);
    const createdA = await createPlanInquiry(tenantA.organization, seededA.type, 1);
    const holdA = await placeProposalHold(db, {
      organizationId: tenantA.organizationId,
      inquiryId: createdA.inquiryId,
      planId: createdA.plan.id,
      selectPlan: true,
    });
    expect(holdA.depositRequiredCents).toBe(30_000);

    const locationTwo = await db.location.create({
      data: {
        organizationId: tenantA.organizationId,
        name: "Second Site",
        slug: `second-${crypto.randomUUID().slice(0, 8)}`,
        timezone: "America/Chicago",
      },
    });
    const seededLocationTwo = await seedLanes(tenantA.organizationId, locationTwo.id, 1);
    const checkSameTenantOtherLocation = await checkResourceAvailability(db, {
      organizationId: tenantA.organizationId,
      locationId: locationTwo.id,
      date: "2026-10-15",
      startTime: "18:00",
      durationMinutes: 60,
      resourceRequirements: [
        {
          knowledgeItemId: "bowl",
          knowledgeItemName: "Bowling",
          resourceTypeId: seededLocationTwo.type.id,
          resourceTypeSlug: seededLocationTwo.type.slug,
          resourceTypeName: seededLocationTwo.type.name,
          quantityRule: "FIXED",
          quantity: 1,
          guestsPerUnit: null,
          durationMinutes: 60,
          inventoryConfigured: true,
          requiresStaffConfiguration: false,
        },
      ],
    });
    expect(checkSameTenantOtherLocation.available).toBe(true);

    const checkB = await checkResourceAvailability(db, {
      organizationId: tenantB.organizationId,
      locationId: locationB,
      date: "2026-10-15",
      startTime: "18:00",
      durationMinutes: 60,
      resourceRequirements: [
        {
          knowledgeItemId: "bowl",
          knowledgeItemName: "Bowling",
          resourceTypeId: seededB.type.id,
          resourceTypeSlug: seededB.type.slug,
          resourceTypeName: seededB.type.name,
          quantityRule: "FIXED",
          quantity: 1,
          guestsPerUnit: null,
          durationMinutes: 60,
          inventoryConfigured: true,
          requiresStaffConfiguration: false,
        },
      ],
    });
    expect(checkB.available).toBe(true);
    const createdB = await createPlanInquiry(tenantB.organization, seededB.type, 1);
    const holdB = await placeProposalHold(db, {
      organizationId: tenantB.organizationId,
      inquiryId: createdB.inquiryId,
      planId: createdB.plan.id,
      selectPlan: true,
    });
    expect(holdB.depositRequiredCents).toBe(20_000);

    const day = await getMasterScheduleDay(tenantA.ctx, db, {
      date: "2026-10-15",
      resourceTypeId: seededA.type.id,
    });
    expect(day?.reservations.some((row) => row.status === RESOURCE_RESERVATION_STATUSES.HOLD)).toBe(true);
    expect(day?.resources.every((row) => seededA.resources.some((unit) => unit.id === row.id))).toBe(true);
  }, 60_000);

  it("rejects a public reserve that uses another inquiry's proposal id", async () => {
    const tenant = await provisionTenant("idor");
    const other = await provisionTenant("idor-b");
    const locationId = tenant.organization.locations[0]?.id ?? null;
    const { type } = await seedLanes(tenant.organizationId, locationId, 1);
    const created = await createPlanInquiry(tenant.organization, type, 1);
    const stranger = await createPublicInquiry(
      db,
      {
        organizationSlug: other.organization.slug,
        rateLimitKey: `stranger:${crypto.randomUUID()}`,
        firstName: "Eve",
        lastName: "Other",
        email: `eve.${crypto.randomUUID()}@example.com`,
        eventType: "Birthday Party",
        preferredDate: "2026-10-15",
        startTime: "18:00",
        guestCount: 8,
        guestMix: "mostly_children",
        desiredDurationMinutes: 180,
        budgetBand: "1500_3000",
        eventGoal: "Celebration",
        diningPreference: "pizza_light",
        spacePreference: "no_preference",
        attractionInterestIds: [],
        attractionMode: "recommend",
        submissionId: `sub_${crypto.randomUUID()}`,
      },
      undefined,
      unlimitedLimiter,
    );
    await expect(
      reservePublicEventPlan(
        db,
        { token: stranger.publicToken, planId: created.plan.id, rateLimitKey: stranger.publicToken },
        unlimitedLimiter,
      ),
    ).rejects.toBeInstanceOf(InquiryError);
  }, 60_000);

  it("converts an active hold to BOOKED without releasing then reacquiring", async () => {
    const tenant = await provisionTenant("convert");
    const locationId = tenant.organization.locations[0]?.id ?? null;
    const { type } = await seedLanes(tenant.organizationId, locationId, 1);
    const created = await createPlanInquiry(tenant.organization, type, 1);
    await placeProposalHold(db, {
      organizationId: tenant.organizationId,
      inquiryId: created.inquiryId,
      planId: created.plan.id,
      selectPlan: true,
    });
    const held = await db.resourceReservation.findMany({
      where: { inquiryId: created.inquiryId, releasedAt: null },
      select: { id: true, resourceId: true },
    });
    expect(held).toHaveLength(1);
    await startWorkingInquiry(tenant.ctx, db, created.inquiryId);
    const confirmed = await confirmHeldBooking(tenant.ctx, db, created.inquiryId);
    expect(confirmed.created).toBe(true);
    expect(confirmed.booking.status).toBe(BOOKING_STATUSES.CONFIRMED);
    expect(confirmed.booking.depositRequiredCents).toBe(30_000);
    expect(confirmed.booking.depositPaidCents).toBe(0);
    const rows = await db.resourceReservation.findMany({ where: { inquiryId: created.inquiryId } });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(held[0]?.id);
    expect(rows[0]?.resourceId).toBe(held[0]?.resourceId);
    expect(rows[0]?.status).toBe(RESOURCE_RESERVATION_STATUSES.BOOKED);
    expect(rows[0]?.bookingId).toBe(confirmed.booking.id);
    expect(rows[0]?.expiresAt).toBeNull();
    expect(rows[0]?.releasedAt).toBeNull();
    const inquiry = await db.inquiry.findFirstOrThrow({ where: { id: created.inquiryId } });
    expect(inquiry.salesStage).toBe(INQUIRY_SALES_STAGES.BOOKED);
    expect(inquiry.status).toBe(INQUIRY_STATUSES.BOOKED);
  }, 60_000);

  it("keeps a customer hold vs staff confirmation race internally consistent", async () => {
    const tenant = await provisionTenant("hold-vs-book");
    const locationId = tenant.organization.locations[0]?.id ?? null;
    const { type } = await seedLanes(tenant.organizationId, locationId, 1);
    const heldInquiry = await createPlanInquiry(tenant.organization, type, 1);
    const competing = await createPlanInquiry(tenant.organization, type, 1);
    await placeProposalHold(db, {
      organizationId: tenant.organizationId,
      inquiryId: heldInquiry.inquiryId,
      planId: heldInquiry.plan.id,
      selectPlan: true,
    });
    await startWorkingInquiry(tenant.ctx, db, heldInquiry.inquiryId);
    const results = await Promise.allSettled([
      confirmHeldBooking(tenant.ctx, db, heldInquiry.inquiryId),
      reservePublicEventPlan(
        db,
        { token: competing.publicToken, planId: competing.plan.id, rateLimitKey: competing.publicToken },
        unlimitedLimiter,
      ),
    ]);
    expect(results).toHaveLength(2);
    const booked = await db.booking.count({
      where: { organizationId: tenant.organizationId, inquiryId: heldInquiry.inquiryId },
    });
    const competingHolds = await db.resourceReservation.count({
      where: { inquiryId: competing.inquiryId, releasedAt: null, status: RESOURCE_RESERVATION_STATUSES.HOLD },
    });
    const heldRows = await db.resourceReservation.findMany({
      where: { inquiryId: heldInquiry.inquiryId, releasedAt: null },
    });
    if (booked === 1) {
      expect(heldRows.every((row) => row.status === RESOURCE_RESERVATION_STATUSES.BOOKED)).toBe(true);
      expect(competingHolds).toBe(0);
    } else {
      expect(heldRows.every((row) => row.status === RESOURCE_RESERVATION_STATUSES.HOLD)).toBe(true);
    }
    expect(
      await db.resourceReservation.count({
        where: {
          organizationId: tenant.organizationId,
          status: { in: [RESOURCE_RESERVATION_STATUSES.HOLD, RESOURCE_RESERVATION_STATUSES.BOOKED] },
          releasedAt: null,
        },
      }),
    ).toBe(1);
  }, 60_000);

  it("does not let expiry cancel a booking that already converted, and does not revive a released hold", async () => {
    const tenant = await provisionTenant("exp-vs-confirm");
    const locationId = tenant.organization.locations[0]?.id ?? null;
    const { type } = await seedLanes(tenant.organizationId, locationId, 1);
    const created = await createPlanInquiry(tenant.organization, type, 1);
    await placeProposalHold(db, {
      organizationId: tenant.organizationId,
      inquiryId: created.inquiryId,
      planId: created.plan.id,
      selectPlan: true,
    });
    await startWorkingInquiry(tenant.ctx, db, created.inquiryId);
    const results = await Promise.allSettled([
      confirmHeldBooking(tenant.ctx, db, created.inquiryId),
      expireInquiryHoldsNow(db, { organizationId: tenant.organizationId, inquiryId: created.inquiryId }),
    ]);
    expect(results).toHaveLength(2);
    const booking = await db.booking.findFirst({
      where: { organizationId: tenant.organizationId, inquiryId: created.inquiryId },
    });
    const rows = await db.resourceReservation.findMany({ where: { inquiryId: created.inquiryId } });
    if (booking) {
      expect(booking.status).toBe(BOOKING_STATUSES.CONFIRMED);
      expect(rows.some((row) => row.status === RESOURCE_RESERVATION_STATUSES.BOOKED && row.releasedAt == null)).toBe(
        true,
      );
      await expireHold(db, { organizationId: tenant.organizationId, now: new Date(Date.now() + 25 * 60 * 60 * 1000) });
      expect(
        await db.resourceReservation.count({
          where: { inquiryId: created.inquiryId, status: RESOURCE_RESERVATION_STATUSES.BOOKED, releasedAt: null },
        }),
      ).toBeGreaterThan(0);
    } else {
      expect(rows.every((row) => row.status !== RESOURCE_RESERVATION_STATUSES.BOOKED || row.releasedAt != null)).toBe(
        true,
      );
    }
  }, 60_000);
});
