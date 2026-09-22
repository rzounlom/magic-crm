import { afterAll, afterEach, describe, expect, it } from "vitest";

import { createMemoryRateLimiter } from "@/lib/ai/rate-limiter";
import { BookingError } from "@/server/errors";
import { resolveRequestContext } from "@/server/request-context";
import { confirmInquiryBooking, listPendingBookingsForSchedule } from "@/server/services/booking-service";
import { reservePublicEventPlan, selectPublicEventPlan } from "@/server/services/event-plan-service";
import { createPublicInquiry } from "@/server/services/inquiry-service";
import { checkInquiryAvailability, startWorkingInquiry } from "@/server/services/live-agent-service";
import { provisionOrganization } from "@/server/services/provision-organization";
import { upsertPendingBookingFromPlan } from "@/server/services/pending-booking-service";
import { getMasterScheduleDay } from "@/server/services/resource-schedule-service";
import { BOOKING_STATUSES } from "@/types/booking";
import { EVENT_PLAN_KINDS, INQUIRY_SALES_STAGES, INQUIRY_STATUSES } from "@/types/inquiry";
import {
  RESOURCE_QUANTITY_RULES,
  RESOURCE_RESERVATION_STATUSES,
  type PlanResourceRequirement,
} from "@/types/resource-schedule";
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
      clerkUserId: `user_pend_${suffix}_${crypto.randomUUID()}`,
      clerkOrganizationId: `clerk_org_pend_${suffix}_${crypto.randomUUID()}`,
      organizationName: `Pending ${suffix}`,
      organizationSlug: `pending-${suffix}-${crypto.randomUUID()}`,
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
  return { ...result, ctx, organization, locationId: organization.locations[0]?.id ?? null };
}

async function seedTypedResources(
  organizationId: string,
  locationId: string | null,
  slug: string,
  name: string,
  count: number,
) {
  const type = await db.resourceType.create({
    data: { organizationId, locationId, slug, name, inventoryConfigured: true, active: true },
  });
  const resources = [];
  for (let i = 1; i <= count; i += 1) {
    resources.push(
      await db.resource.create({
        data: {
          organizationId,
          resourceTypeId: type.id,
          locationId,
          name: count === 1 ? name : `${name} ${i}`,
          displayOrder: i,
          active: true,
        },
      }),
    );
  }
  return { type, resources };
}

function requirement(input: {
  type: { id: string; slug: string; name: string };
  quantityRule: PlanResourceRequirement["quantityRule"];
  quantity: number;
  specificResourceId?: string | null;
}): PlanResourceRequirement {
  return {
    knowledgeItemId: input.type.id,
    knowledgeItemName: input.type.name,
    resourceTypeId: input.type.id,
    resourceTypeSlug: input.type.slug,
    resourceTypeName: input.type.name,
    quantityRule: input.quantityRule,
    quantity: input.quantity,
    guestsPerUnit: null,
    durationMinutes: 180,
    inventoryConfigured: true,
    requiresStaffConfiguration: false,
    specificResourceId: input.specificResourceId ?? null,
    locationExclusive: input.quantityRule === RESOURCE_QUANTITY_RULES.LOCATION_EXCLUSIVE,
  };
}

async function createPlanInquiry(
  organization: { id: string; slug: string },
  requirements: PlanResourceRequirement[],
  title = "Pending Plan",
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
      title,
      sortOrder: 0,
      estimatedTotalCents: 100_000,
      currency: "USD",
      guestCount: 12,
      durationMinutes: 180,
      customerFacingReason: "Test plan",
      availabilityValidated: true,
      availabilityStatus: "AVAILABLE",
      payload: {
        guestCount: 12,
        eventDate: "2026-10-15",
        startTime: "18:00",
        durationMinutes: 180,
        activities: [{ knowledgeItemId: "bowl", name: "Bowling", quantity: 1, priceCents: 100_000 }],
        dining: { label: "Pizza", priceCents: 0 },
        spaces: [],
        schedule: [],
        itinerary: [{ startTime: "18:00", endTime: "19:00", label: "Bowling" }],
        pricingComplete: true,
        depositPreviewCents: 30_000,
        resourceRequirements: requirements,
      },
    },
  });
  return { ...created, plan };
}

describe("pending bookings (postgres)", { timeout: 60_000 }, () => {
  it("does not let Check Availability allocate occupancy", async () => {
    const tenant = await provisionTenant("check");
    const bowling = await seedTypedResources(tenant.organizationId, tenant.locationId, "bowling-lane", "Bowling Lane", 2);
    const created = await createPlanInquiry(tenant.organization, [
      requirement({ type: bowling.type, quantityRule: RESOURCE_QUANTITY_RULES.FIXED, quantity: 1 }),
    ]);
    await reservePublicEventPlan(
      db,
      { token: created.publicToken, planId: created.plan.id, rateLimitKey: created.publicToken },
      unlimitedLimiter,
    );
    await startWorkingInquiry(tenant.ctx, db, created.inquiryId);
    const check = await checkInquiryAvailability(tenant.ctx, db, created.inquiryId);
    expect(check.available).toBe(true);
    expect(await db.resourceReservation.count({ where: { inquiryId: created.inquiryId } })).toBe(0);
    const pending = await listPendingBookingsForSchedule(tenant.ctx, db, "2026-10-15");
    expect(pending.some((row) => row.inquiryId === created.inquiryId)).toBe(true);
    const day = await getMasterScheduleDay(tenant.ctx, db, {
      date: "2026-10-15",
      resourceTypeId: bowling.type.id,
    });
    expect(day?.reservations).toHaveLength(0);
  });

  it("confirms a Mezzanine pending booking onto exact composite rows", async () => {
    const tenant = await provisionTenant("mezz");
    const bowling = await seedTypedResources(tenant.organizationId, tenant.locationId, "bowling-lane", "Bowling Lane", 8);
    const axe = await seedTypedResources(tenant.organizationId, tenant.locationId, "axe-throwing-lane", "Axe Throwing Lane", 8);
    const skybox = await seedTypedResources(tenant.organizationId, tenant.locationId, "skybox", "Skybox", 1);
    const mezzanine = await seedTypedResources(tenant.organizationId, tenant.locationId, "mezzanine", "Mezzanine", 1);
    const created = await createPlanInquiry(tenant.organization, [
      requirement({
        type: mezzanine.type,
        quantityRule: RESOURCE_QUANTITY_RULES.SPECIFIC_RESOURCE,
        quantity: 1,
        specificResourceId: mezzanine.resources[0]!.id,
      }),
      requirement({ type: bowling.type, quantityRule: RESOURCE_QUANTITY_RULES.ALL_OF_TYPE, quantity: 8 }),
      requirement({ type: axe.type, quantityRule: RESOURCE_QUANTITY_RULES.FIXED, quantity: 7 }),
      requirement({
        type: skybox.type,
        quantityRule: RESOURCE_QUANTITY_RULES.SPECIFIC_RESOURCE,
        quantity: 1,
        specificResourceId: skybox.resources[0]!.id,
      }),
    ], "Mezzanine");
    await reservePublicEventPlan(
      db,
      { token: created.publicToken, planId: created.plan.id, rateLimitKey: created.publicToken },
      unlimitedLimiter,
    );
    await startWorkingInquiry(tenant.ctx, db, created.inquiryId);
    const confirmed = await confirmInquiryBooking(tenant.ctx, db, created.inquiryId);
    expect(confirmed.booking.status).toBe(BOOKING_STATUSES.CONFIRMED);
    const rows = await db.resourceReservation.findMany({
      where: { inquiryId: created.inquiryId, status: RESOURCE_RESERVATION_STATUSES.BOOKED, releasedAt: null },
      include: { resource: { select: { resourceType: { select: { slug: true } } } } },
    });
    const bySlug = new Map<string, number>();
    for (const row of rows) {
      const slug = row.resource.resourceType.slug;
      bySlug.set(slug, (bySlug.get(slug) ?? 0) + 1);
    }
    expect(bySlug.get("mezzanine")).toBe(1);
    expect(bySlug.get("bowling-lane")).toBe(8);
    expect(bySlug.get("axe-throwing-lane")).toBe(7);
    expect(bySlug.get("skybox")).toBe(1);
    const axeDay = await getMasterScheduleDay(tenant.ctx, db, {
      date: "2026-10-15",
      resourceTypeId: axe.type.id,
    });
    expect(axeDay?.reservations.filter((row) => row.status === RESOURCE_RESERVATION_STATUSES.BOOKED)).toHaveLength(7);
    expect(axeDay?.resources).toHaveLength(8);
  });

  it("confirms Full Facility as location-exclusive occupancy", async () => {
    const tenant = await provisionTenant("full");
    const bowling = await seedTypedResources(tenant.organizationId, tenant.locationId, "bowling-lane", "Bowling Lane", 2);
    const extra = await seedTypedResources(tenant.organizationId, tenant.locationId, "laser-tag-arena", "Laser Tag Arena", 1);
    const fullFacility = await seedTypedResources(tenant.organizationId, tenant.locationId, "full-facility", "Full Facility", 1);
    const created = await createPlanInquiry(tenant.organization, [
      requirement({
        type: fullFacility.type,
        quantityRule: RESOURCE_QUANTITY_RULES.LOCATION_EXCLUSIVE,
        quantity: 1,
      }),
    ], "Full Facility");
    await reservePublicEventPlan(
      db,
      { token: created.publicToken, planId: created.plan.id, rateLimitKey: created.publicToken },
      unlimitedLimiter,
    );
    await startWorkingInquiry(tenant.ctx, db, created.inquiryId);
    await confirmInquiryBooking(tenant.ctx, db, created.inquiryId);
    const booked = await db.resourceReservation.count({
      where: {
        organizationId: tenant.organizationId,
        status: RESOURCE_RESERVATION_STATUSES.BOOKED,
        releasedAt: null,
      },
    });
    expect(booked).toBe(bowling.resources.length + extra.resources.length + fullFacility.resources.length);
  });

  it("lets only one of two pending confirmations occupy the same resource", async () => {
    const tenant = await provisionTenant("race-confirm");
    const bowling = await seedTypedResources(tenant.organizationId, tenant.locationId, "bowling-lane", "Bowling Lane", 1);
    const first = await createPlanInquiry(tenant.organization, [
      requirement({ type: bowling.type, quantityRule: RESOURCE_QUANTITY_RULES.FIXED, quantity: 1 }),
    ]);
    const second = await createPlanInquiry(tenant.organization, [
      requirement({ type: bowling.type, quantityRule: RESOURCE_QUANTITY_RULES.FIXED, quantity: 1 }),
    ]);
    await reservePublicEventPlan(
      db,
      { token: first.publicToken, planId: first.plan.id, rateLimitKey: first.publicToken },
      unlimitedLimiter,
    );
    await reservePublicEventPlan(
      db,
      { token: second.publicToken, planId: second.plan.id, rateLimitKey: second.publicToken },
      unlimitedLimiter,
    );
    expect(await db.resourceReservation.count({ where: { organizationId: tenant.organizationId } })).toBe(0);
    await startWorkingInquiry(tenant.ctx, db, first.inquiryId);
    await startWorkingInquiry(tenant.ctx, db, second.inquiryId);
    const results = await Promise.allSettled([
      confirmInquiryBooking(tenant.ctx, db, first.inquiryId),
      confirmInquiryBooking(tenant.ctx, db, second.inquiryId),
    ]);
    const wins = results.filter((row) => row.status === "fulfilled");
    const losses = results.filter((row) => row.status === "rejected");
    expect(wins).toHaveLength(1);
    expect(losses).toHaveLength(1);
    if (losses[0]?.status === "rejected") {
      expect(losses[0].reason).toBeInstanceOf(BookingError);
    }
    expect(
      await db.booking.count({
        where: { organizationId: tenant.organizationId, status: BOOKING_STATUSES.CONFIRMED },
      }),
    ).toBe(1);
    expect(
      await db.booking.count({
        where: { organizationId: tenant.organizationId, status: BOOKING_STATUSES.PENDING_PAYMENT },
      }),
    ).toBe(1);
    expect(
      await db.resourceReservation.count({
        where: { organizationId: tenant.organizationId, status: RESOURCE_RESERVATION_STATUSES.BOOKED, releasedAt: null },
      }),
    ).toBe(1);
  });

  it("rejects Book Now against another tenant's proposal", async () => {
    const tenant = await provisionTenant("idor-a");
    const other = await provisionTenant("idor-b");
    const bowling = await seedTypedResources(tenant.organizationId, tenant.locationId, "bowling-lane", "Bowling Lane", 1);
    const created = await createPlanInquiry(tenant.organization, [
      requirement({ type: bowling.type, quantityRule: RESOURCE_QUANTITY_RULES.FIXED, quantity: 1 }),
    ]);
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
    ).rejects.toBeInstanceOf(Error);
    expect(await db.booking.count({ where: { organizationId: other.organizationId } })).toBe(0);
  });

  it("does not create a booking on Submit inquiry", async () => {
    const tenant = await provisionTenant("follow");
    const bowling = await seedTypedResources(tenant.organizationId, tenant.locationId, "bowling-lane", "Bowling Lane", 1);
    const created = await createPlanInquiry(tenant.organization, [
      requirement({ type: bowling.type, quantityRule: RESOURCE_QUANTITY_RULES.FIXED, quantity: 1 }),
    ]);
    await selectPublicEventPlan(
      db,
      { token: created.publicToken, planId: created.plan.id, rateLimitKey: created.publicToken },
      unlimitedLimiter,
    );
    const inquiry = await db.inquiry.findFirstOrThrow({ where: { id: created.inquiryId } });
    expect(inquiry.salesStage).toBe(INQUIRY_SALES_STAGES.READY_TO_BOOK);
    expect(inquiry.status).toBe(INQUIRY_STATUSES.READY_FOR_HUMAN);
    expect(await db.booking.count({ where: { inquiryId: created.inquiryId } })).toBe(0);
    expect(await db.resourceReservation.count({ where: { inquiryId: created.inquiryId } })).toBe(0);
  });

  it("updates one pending booking when the selected proposal changes", async () => {
    const tenant = await provisionTenant("reprice");
    const bowling = await seedTypedResources(tenant.organizationId, tenant.locationId, "bowling-lane", "Bowling Lane", 2);
    const created = await createPlanInquiry(tenant.organization, [
      requirement({ type: bowling.type, quantityRule: RESOURCE_QUANTITY_RULES.FIXED, quantity: 1 }),
    ]);
    await reservePublicEventPlan(
      db,
      { token: created.publicToken, planId: created.plan.id, rateLimitKey: created.publicToken },
      unlimitedLimiter,
    );
    const original = await db.booking.findFirstOrThrow({ where: { inquiryId: created.inquiryId } });
    const current = await db.eventPlanRecommendation.findFirstOrThrow({ where: { id: created.plan.id } });
    await db.eventPlanRecommendation.update({
      where: { id: created.plan.id },
      data: {
        guestCount: 20,
        estimatedTotalCents: 150_000,
        payload: { ...(current.payload as object), guestCount: 20 },
      },
    });
    const updated = await upsertPendingBookingFromPlan(db, {
      organizationId: tenant.organizationId,
      inquiryId: created.inquiryId,
      planId: created.plan.id,
      actorUserProfileId: tenant.ctx.userId,
      source: "employee_save",
    });
    expect(updated.booking.id).toBe(original.id);
    expect(updated.booking.guestCount).toBe(20);
    expect(updated.booking.totalCents).toBe(150_000);
    expect(await db.booking.count({ where: { inquiryId: created.inquiryId } })).toBe(1);
    expect(await db.resourceReservation.count({ where: { inquiryId: created.inquiryId } })).toBe(0);
  });

  it("does not leave partial rows when composite inventory is insufficient", async () => {
    const tenant = await provisionTenant("short-axe");
    const bowling = await seedTypedResources(tenant.organizationId, tenant.locationId, "bowling-lane", "Bowling Lane", 8);
    const axe = await seedTypedResources(
      tenant.organizationId,
      tenant.locationId,
      "axe-throwing-lane",
      "Axe Throwing Lane",
      5,
    );
    const skybox = await seedTypedResources(tenant.organizationId, tenant.locationId, "skybox", "Skybox", 1);
    const mezzanine = await seedTypedResources(tenant.organizationId, tenant.locationId, "mezzanine", "Mezzanine", 1);
    const created = await createPlanInquiry(
      tenant.organization,
      [
        requirement({
          type: mezzanine.type,
          quantityRule: RESOURCE_QUANTITY_RULES.SPECIFIC_RESOURCE,
          quantity: 1,
          specificResourceId: mezzanine.resources[0]!.id,
        }),
        requirement({ type: bowling.type, quantityRule: RESOURCE_QUANTITY_RULES.ALL_OF_TYPE, quantity: 8 }),
        requirement({ type: axe.type, quantityRule: RESOURCE_QUANTITY_RULES.FIXED, quantity: 7 }),
        requirement({
          type: skybox.type,
          quantityRule: RESOURCE_QUANTITY_RULES.SPECIFIC_RESOURCE,
          quantity: 1,
          specificResourceId: skybox.resources[0]!.id,
        }),
      ],
      "Mezzanine",
    );
    await upsertPendingBookingFromPlan(db, {
      organizationId: tenant.organizationId,
      inquiryId: created.inquiryId,
      planId: created.plan.id,
      actorUserProfileId: tenant.ctx.userId,
      source: "employee_save",
    });
    await startWorkingInquiry(tenant.ctx, db, created.inquiryId);
    await expect(confirmInquiryBooking(tenant.ctx, db, created.inquiryId)).rejects.toBeInstanceOf(BookingError);
    expect(await db.resourceReservation.count({ where: { inquiryId: created.inquiryId, releasedAt: null } })).toBe(0);
    expect(await db.booking.findFirstOrThrow({ where: { inquiryId: created.inquiryId } })).toMatchObject({
      status: BOOKING_STATUSES.PENDING_PAYMENT,
    });
  });
});
