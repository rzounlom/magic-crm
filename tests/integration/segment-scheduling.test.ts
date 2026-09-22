import { afterAll, afterEach, describe, expect, it } from "vitest";

import { occupancyInstants, resolveSchedulingTimeZone } from "@/lib/inquiries/tenant-datetime";
import { createMemoryRateLimiter } from "@/lib/ai/rate-limiter";
import { SYSTEM_GROUP_KEYS } from "@/server/authorization/default-security-groups";
import { AuthorizationError, InquiryError } from "@/server/errors";
import { resolveRequestContext } from "@/server/request-context";
import { confirmInquiryBooking, listBookings } from "@/server/services/booking-service";
import { bookPublicEventPlan } from "@/server/services/event-plan-service";
import { createEmployeeManualInquiry, createPublicInquiry } from "@/server/services/inquiry-service";
import { checkInquiryAvailability, startWorkingInquiry } from "@/server/services/live-agent-service";
import { confirmPendingBooking, upsertPendingBookingFromPlan } from "@/server/services/pending-booking-service";
import { provisionOrganization } from "@/server/services/provision-organization";
import { getMasterScheduleDay } from "@/server/services/resource-schedule-service";
import { BOOKING_LIST_FILTERS, BOOKING_STATUSES } from "@/types/booking";
import { EVENT_PLAN_KINDS, INQUIRY_SOURCES } from "@/types/inquiry";
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
      clerkUserId: `user_seg_${suffix}_${crypto.randomUUID()}`,
      clerkOrganizationId: `clerk_org_seg_${suffix}_${crypto.randomUUID()}`,
      organizationName: `Segment ${suffix}`,
      organizationSlug: `segment-${suffix}-${crypto.randomUUID()}`,
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
  return { ...result, ctx, organization, locationId: organization.locations[0]?.id ?? null, profile };
}

async function addGroupUser(
  tenant: Awaited<ReturnType<typeof provisionTenant>>,
  systemKey: string,
  email: string,
) {
  const group = await db.securityGroup.findFirstOrThrow({
    where: { organizationId: tenant.organizationId, systemKey },
  });
  const profile = await db.userProfile.create({
    data: {
      organizationId: tenant.organizationId,
      clerkUserId: `user_${email}_${crypto.randomUUID()}`,
      email,
      firstName: "Other",
      lastName: "User",
    },
  });
  await db.securityGroupMember.create({
    data: {
      organizationId: tenant.organizationId,
      securityGroupId: group.id,
      userProfileId: profile.id,
    },
  });
  const ctx = await resolveRequestContext(
    { clerkUserId: profile.clerkUserId, clerkOrganizationId: tenant.organization.clerkOrganizationId },
    db,
  );
  return { profile, ctx };
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
  productId: string;
  name: string;
  specificResourceId?: string | null;
}): PlanResourceRequirement {
  return {
    knowledgeItemId: input.productId,
    knowledgeItemName: input.name,
    productId: input.productId,
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
  payload: {
    startTime: string;
    durationMinutes: number;
    itinerary: Array<{ startTime: string; endTime: string; label: string; productId?: string; startOffsetMinutes?: number; durationMinutes?: number }>;
    requirements: PlanResourceRequirement[];
    activities?: Array<{ knowledgeItemId: string; name: string; quantity: number; priceCents: number }>;
  },
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
      startTime: payload.startTime,
      guestCount: 20,
      guestMix: "mixed_ages",
      desiredDurationMinutes: payload.durationMinutes,
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
      title: "Recommended",
      sortOrder: 0,
      estimatedTotalCents: 100_000,
      currency: "USD",
      guestCount: 20,
      durationMinutes: payload.durationMinutes,
      customerFacingReason: "Test plan",
      availabilityValidated: true,
      availabilityStatus: "AVAILABLE",
      payload: {
        guestCount: 20,
        eventDate: "2026-10-15",
        startTime: payload.startTime,
        durationMinutes: payload.durationMinutes,
        activities: payload.activities ?? [
          { knowledgeItemId: "axe", name: "Axe Throwing", quantity: 1, priceCents: 50_000 },
          { knowledgeItemId: "bowl", name: "Bowling", quantity: 1, priceCents: 50_000 },
        ],
        dining: { label: "Food", priceCents: 0 },
        spaces: [],
        schedule: payload.itinerary.map((row) => `${row.startTime}–${row.endTime} ${row.label}`),
        itinerary: payload.itinerary,
        pricingComplete: true,
        resourceRequirements: payload.requirements,
      },
    },
  });
  return { ...created, plan };
}

const SAMPLE_ITINERARY = [
  { startTime: "17:30", endTime: "18:30", label: "Food", productId: "food", startOffsetMinutes: 0, durationMinutes: 60 },
  { startTime: "18:30", endTime: "19:00", label: "Axe Throwing", productId: "axe", startOffsetMinutes: 60, durationMinutes: 30 },
  { startTime: "19:00", endTime: "20:00", label: "Bowling", productId: "bowl", startOffsetMinutes: 90, durationMinutes: 60 },
  { startTime: "20:00", endTime: "20:30", label: "Arcade", productId: "arcade", startOffsetMinutes: 150, durationMinutes: 30 },
];

const RECOMMENDED_HOUR_ITINERARY = [
  { startTime: "17:30", endTime: "18:30", label: "Fajita Bar", productId: "food", startOffsetMinutes: 0, durationMinutes: 60 },
  { startTime: "18:30", endTime: "19:30", label: "Axe Throwing - 60 Minutes", productId: "axe", startOffsetMinutes: 60, durationMinutes: 60 },
  { startTime: "19:30", endTime: "20:30", label: "Bowling - 1 Hour", productId: "bowl", startOffsetMinutes: 120, durationMinutes: 60 },
  { startTime: "20:30", endTime: "21:30", label: "1 Hour Unlimited Arcade Play", productId: "arcade", startOffsetMinutes: 180, durationMinutes: 60 },
];

describe("segment-level scheduling (postgres)", { timeout: 60_000 }, () => {
  it("occupies axe and bowling only during their itinerary segments", async () => {
    const tenant = await provisionTenant("occ");
    const axe = await seedTypedResources(tenant.organizationId, tenant.locationId, "axe-throwing-lane", "Axe Throwing Lane", 2);
    const bowling = await seedTypedResources(tenant.organizationId, tenant.locationId, "bowling-lane", "Bowling Lane", 2);
    const created = await createPlanInquiry(tenant.organization, {
      startTime: "17:30",
      durationMinutes: 180,
      itinerary: SAMPLE_ITINERARY,
      requirements: [
        requirement({ type: axe.type, quantityRule: RESOURCE_QUANTITY_RULES.FIXED, quantity: 1, productId: "axe", name: "Axe Throwing" }),
        requirement({ type: bowling.type, quantityRule: RESOURCE_QUANTITY_RULES.FIXED, quantity: 1, productId: "bowl", name: "Bowling" }),
      ],
    });
    await bookPublicEventPlan(
      db,
      { token: created.publicToken, planId: created.plan.id, rateLimitKey: created.publicToken },
      unlimitedLimiter,
    );
    await startWorkingInquiry(tenant.ctx, db, created.inquiryId);
    const confirmed = await confirmInquiryBooking(tenant.ctx, db, created.inquiryId);
    expect(confirmed.created).toBe(true);
    const reservations = await db.resourceReservation.findMany({
      where: { bookingId: confirmed.booking.id, status: RESOURCE_RESERVATION_STATUSES.BOOKED },
      include: { resource: { include: { resourceType: true } } },
    });
    const axeRows = reservations.filter((row) => row.resource.resourceType.slug === "axe-throwing-lane");
    const bowlRows = reservations.filter((row) => row.resource.resourceType.slug === "bowling-lane");
    expect(axeRows).toHaveLength(1);
    expect(axeRows[0]?.startMinute).toBe(18 * 60 + 30);
    expect(axeRows[0]?.endMinute).toBe(19 * 60);
    expect(bowlRows).toHaveLength(1);
    expect(bowlRows[0]?.startMinute).toBe(19 * 60);
    expect(bowlRows[0]?.endMinute).toBe(20 * 60);
    const zone = resolveSchedulingTimeZone({ organizationTimeZone: tenant.organization.timezone });
    const axeWindow = occupancyInstants({
      slotDate: "2026-10-15",
      startMinute: 18 * 60 + 30,
      endMinute: 19 * 60,
      timeZone: zone,
    });
    const bowlWindow = occupancyInstants({
      slotDate: "2026-10-15",
      startMinute: 19 * 60,
      endMinute: 20 * 60,
      timeZone: zone,
    });
    expect(axeRows[0]?.startsAt?.toISOString()).toBe(axeWindow.startsAt.toISOString());
    expect(axeRows[0]?.endsAt?.toISOString()).toBe(axeWindow.endsAt.toISOString());
    expect(bowlRows[0]?.startsAt?.toISOString()).toBe(bowlWindow.startsAt.toISOString());
    expect(bowlRows[0]?.endsAt?.toISOString()).toBe(bowlWindow.endsAt.toISOString());
    const axeDay = await getMasterScheduleDay(tenant.ctx, db, { date: "2026-10-15", resourceTypeId: axe.type.id });
    expect(axeDay?.reservations.map((row) => [row.startMinute, row.endMinute])).toEqual([[18 * 60 + 30, 19 * 60]]);
    const bowlDay = await getMasterScheduleDay(tenant.ctx, db, { date: "2026-10-15", resourceTypeId: bowling.type.id });
    expect(bowlDay?.reservations.map((row) => [row.startMinute, row.endMinute])).toEqual([[19 * 60, 20 * 60]]);
  });

  it("persists 60-minute axe and bowling windows and occupies two 30-minute schedule cells", async () => {
    const tenant = await provisionTenant("hour");
    const axe = await seedTypedResources(tenant.organizationId, tenant.locationId, "axe-throwing-lane", "Axe Throwing Lane", 7);
    const bowling = await seedTypedResources(tenant.organizationId, tenant.locationId, "bowling-lane", "Bowling Lane", 8);
    const created = await createPlanInquiry(tenant.organization, {
      startTime: "17:30",
      durationMinutes: 240,
      itinerary: RECOMMENDED_HOUR_ITINERARY,
      activities: [
        { knowledgeItemId: "axe", name: "Axe Throwing - 60 Minutes", quantity: 1, priceCents: 50_000 },
        { knowledgeItemId: "bowl", name: "Bowling - 1 Hour", quantity: 4, priceCents: 50_000 },
        { knowledgeItemId: "arcade", name: "1 Hour Unlimited Arcade Play", quantity: 20, priceCents: 0 },
      ],
      requirements: [
        requirement({ type: axe.type, quantityRule: RESOURCE_QUANTITY_RULES.FIXED, quantity: 3, productId: "axe", name: "Axe Throwing" }),
        requirement({ type: bowling.type, quantityRule: RESOURCE_QUANTITY_RULES.FIXED, quantity: 4, productId: "bowl", name: "Bowling" }),
      ],
    });
    await bookPublicEventPlan(
      db,
      { token: created.publicToken, planId: created.plan.id, rateLimitKey: created.publicToken },
      unlimitedLimiter,
    );
    await startWorkingInquiry(tenant.ctx, db, created.inquiryId);
    const confirmed = await confirmInquiryBooking(tenant.ctx, db, created.inquiryId);
    const reservations = await db.resourceReservation.findMany({
      where: { bookingId: confirmed.booking.id, status: RESOURCE_RESERVATION_STATUSES.BOOKED, releasedAt: null },
      include: { resource: { include: { resourceType: true } } },
    });
    const axeRows = reservations.filter((row) => row.resource.resourceType.slug === "axe-throwing-lane");
    const bowlRows = reservations.filter((row) => row.resource.resourceType.slug === "bowling-lane");
    expect(axeRows).toHaveLength(3);
    expect(bowlRows).toHaveLength(4);
    expect(axeRows.every((row) => row.startMinute === 18 * 60 + 30 && row.endMinute === 19 * 60 + 30)).toBe(true);
    expect(bowlRows.every((row) => row.startMinute === 19 * 60 + 30 && row.endMinute === 20 * 60 + 30)).toBe(true);
    const zone = resolveSchedulingTimeZone({ organizationTimeZone: tenant.organization.timezone });
    const axeWindow = occupancyInstants({
      slotDate: "2026-10-15",
      startMinute: 18 * 60 + 30,
      endMinute: 19 * 60 + 30,
      timeZone: zone,
    });
    expect(axeRows[0]?.startsAt?.toISOString()).toBe(axeWindow.startsAt.toISOString());
    expect(axeRows[0]?.endsAt?.toISOString()).toBe(axeWindow.endsAt.toISOString());
    const axeDay = await getMasterScheduleDay(tenant.ctx, db, { date: "2026-10-15", resourceTypeId: axe.type.id });
    expect(axeDay?.reservations).toHaveLength(3);
    expect(axeDay?.reservations.every((row) => row.startMinute === 18 * 60 + 30 && row.endMinute === 19 * 60 + 30)).toBe(true);
    expect(axeDay?.slotMinutes).toBe(30);
  });

  it("treats an itinerary as unavailable when only one segment conflicts", async () => {
    const tenant = await provisionTenant("multi");
    const axe = await seedTypedResources(tenant.organizationId, tenant.locationId, "axe-throwing-lane", "Axe Throwing Lane", 1);
    const bowling = await seedTypedResources(tenant.organizationId, tenant.locationId, "bowling-lane", "Bowling Lane", 2);
    const first = await createPlanInquiry(tenant.organization, {
      startTime: "17:30",
      durationMinutes: 180,
      itinerary: SAMPLE_ITINERARY,
      requirements: [
        requirement({ type: axe.type, quantityRule: RESOURCE_QUANTITY_RULES.FIXED, quantity: 1, productId: "axe", name: "Axe Throwing" }),
      ],
    });
    await bookPublicEventPlan(db, { token: first.publicToken, planId: first.plan.id, rateLimitKey: first.publicToken }, unlimitedLimiter);
    await startWorkingInquiry(tenant.ctx, db, first.inquiryId);
    await confirmInquiryBooking(tenant.ctx, db, first.inquiryId);

    const second = await createPlanInquiry(tenant.organization, {
      startTime: "17:30",
      durationMinutes: 180,
      itinerary: SAMPLE_ITINERARY,
      requirements: [
        requirement({ type: axe.type, quantityRule: RESOURCE_QUANTITY_RULES.FIXED, quantity: 1, productId: "axe", name: "Axe Throwing" }),
        requirement({ type: bowling.type, quantityRule: RESOURCE_QUANTITY_RULES.FIXED, quantity: 1, productId: "bowl", name: "Bowling" }),
      ],
    });
    await db.inquiry.update({
      where: { id: second.inquiryId },
      data: { selectedEventPlanId: second.plan.id },
    });
    await startWorkingInquiry(tenant.ctx, db, second.inquiryId);
    const check = await checkInquiryAvailability(tenant.ctx, db, second.inquiryId);
    expect(check.available).toBe(false);
    expect(check.result.types.some((row) => row.resourceTypeSlug === "axe-throwing-lane" && row.conflict)).toBe(true);
  });

  it("blocks Book Now after a conflicting booking is confirmed against the same snapshot", async () => {
    const tenant = await provisionTenant("stale");
    const bowling = await seedTypedResources(tenant.organizationId, tenant.locationId, "bowling-lane", "Bowling Lane", 1);
    const first = await createPlanInquiry(tenant.organization, {
      startTime: "17:30",
      durationMinutes: 180,
      itinerary: SAMPLE_ITINERARY,
      requirements: [
        requirement({ type: bowling.type, quantityRule: RESOURCE_QUANTITY_RULES.FIXED, quantity: 1, productId: "bowl", name: "Bowling" }),
      ],
    });
    const second = await createPlanInquiry(tenant.organization, {
      startTime: "17:30",
      durationMinutes: 180,
      itinerary: SAMPLE_ITINERARY,
      requirements: [
        requirement({ type: bowling.type, quantityRule: RESOURCE_QUANTITY_RULES.FIXED, quantity: 1, productId: "bowl", name: "Bowling" }),
      ],
    });
    await bookPublicEventPlan(db, { token: first.publicToken, planId: first.plan.id, rateLimitKey: first.publicToken }, unlimitedLimiter);
    await startWorkingInquiry(tenant.ctx, db, first.inquiryId);
    await confirmInquiryBooking(tenant.ctx, db, first.inquiryId);
    await expect(
      bookPublicEventPlan(db, { token: second.publicToken, planId: second.plan.id, rateLimitKey: second.publicToken }, unlimitedLimiter),
    ).rejects.toBeInstanceOf(InquiryError);
    expect(await db.booking.count({ where: { inquiryId: second.inquiryId } })).toBe(0);
  });

  it("occupies Mezzanine composites only during the mezzanine segment", async () => {
    const tenant = await provisionTenant("mezz-seg");
    const bowling = await seedTypedResources(tenant.organizationId, tenant.locationId, "bowling-lane", "Bowling Lane", 8);
    const axe = await seedTypedResources(tenant.organizationId, tenant.locationId, "axe-throwing-lane", "Axe Throwing Lane", 8);
    const skybox = await seedTypedResources(tenant.organizationId, tenant.locationId, "skybox", "Skybox", 1);
    const mezzanine = await seedTypedResources(tenant.organizationId, tenant.locationId, "mezzanine", "Mezzanine", 1);
    const created = await createPlanInquiry(tenant.organization, {
      startTime: "17:00",
      durationMinutes: 240,
      itinerary: [
        { startTime: "17:00", endTime: "18:00", label: "Food", productId: "food", startOffsetMinutes: 0, durationMinutes: 60 },
        { startTime: "18:00", endTime: "21:00", label: "Mezzanine", productId: "mezz", startOffsetMinutes: 60, durationMinutes: 180 },
      ],
      activities: [{ knowledgeItemId: "mezz", name: "Mezzanine", quantity: 1, priceCents: 100_000 }],
      requirements: [
        requirement({
          type: mezzanine.type,
          quantityRule: RESOURCE_QUANTITY_RULES.SPECIFIC_RESOURCE,
          quantity: 1,
          productId: "mezz",
          name: "Mezzanine",
          specificResourceId: mezzanine.resources[0]!.id,
        }),
        requirement({ type: bowling.type, quantityRule: RESOURCE_QUANTITY_RULES.ALL_OF_TYPE, quantity: 8, productId: "mezz", name: "Mezzanine" }),
        requirement({ type: axe.type, quantityRule: RESOURCE_QUANTITY_RULES.FIXED, quantity: 7, productId: "mezz", name: "Mezzanine" }),
        requirement({
          type: skybox.type,
          quantityRule: RESOURCE_QUANTITY_RULES.SPECIFIC_RESOURCE,
          quantity: 1,
          productId: "mezz",
          name: "Mezzanine",
          specificResourceId: skybox.resources[0]!.id,
        }),
      ],
    });
    await bookPublicEventPlan(db, { token: created.publicToken, planId: created.plan.id, rateLimitKey: created.publicToken }, unlimitedLimiter);
    await startWorkingInquiry(tenant.ctx, db, created.inquiryId);
    const confirmed = await confirmInquiryBooking(tenant.ctx, db, created.inquiryId);
    const reservations = await db.resourceReservation.findMany({
      where: { bookingId: confirmed.booking.id, status: RESOURCE_RESERVATION_STATUSES.BOOKED },
    });
    expect(reservations.length).toBe(8 + 7 + 1 + 1);
    expect(reservations.every((row) => row.startMinute === 18 * 60 && row.endMinute === 21 * 60)).toBe(true);
  });

  it("applies location-exclusive occupancy only during the exclusive segment", async () => {
    const tenant = await provisionTenant("excl");
    const exclusive = await seedTypedResources(tenant.organizationId, tenant.locationId, "full-facility", "Full Facility", 1);
    const bowling = await seedTypedResources(tenant.organizationId, tenant.locationId, "bowling-lane", "Bowling Lane", 2);
    const created = await createPlanInquiry(tenant.organization, {
      startTime: "17:00",
      durationMinutes: 300,
      itinerary: [
        { startTime: "17:00", endTime: "18:00", label: "Food", productId: "food", startOffsetMinutes: 0, durationMinutes: 60 },
        { startTime: "18:00", endTime: "21:00", label: "Private facility", productId: "facility", startOffsetMinutes: 60, durationMinutes: 180 },
      ],
      activities: [{ knowledgeItemId: "facility", name: "Private facility", quantity: 1, priceCents: 100_000 }],
      requirements: [
        requirement({
          type: exclusive.type,
          quantityRule: RESOURCE_QUANTITY_RULES.LOCATION_EXCLUSIVE,
          quantity: 1,
          productId: "facility",
          name: "Private facility",
        }),
      ],
    });
    await bookPublicEventPlan(db, { token: created.publicToken, planId: created.plan.id, rateLimitKey: created.publicToken }, unlimitedLimiter);
    await startWorkingInquiry(tenant.ctx, db, created.inquiryId);
    const confirmed = await confirmInquiryBooking(tenant.ctx, db, created.inquiryId);
    const reservations = await db.resourceReservation.findMany({
      where: { bookingId: confirmed.booking.id, status: RESOURCE_RESERVATION_STATUSES.BOOKED },
    });
    expect(reservations.length).toBeGreaterThan(1);
    expect(reservations.every((row) => row.startMinute === 18 * 60 && row.endMinute === 21 * 60)).toBe(true);
    const bowlDay = await getMasterScheduleDay(tenant.ctx, db, { date: "2026-10-15", resourceTypeId: bowling.type.id });
    expect(bowlDay?.reservations.every((row) => row.startMinute === 18 * 60 && row.endMinute === 21 * 60)).toBe(true);
  });

  it("lets an employee create a manual pending booking without a public conversation", async () => {
    const tenant = await provisionTenant("emp");
    const bowling = await seedTypedResources(tenant.organizationId, tenant.locationId, "bowling-lane", "Bowling Lane", 2);
    const created = await createEmployeeManualInquiry(tenant.ctx, db, {
      firstName: "Jane",
      lastName: "Agent",
      customerGroupName: "Manual Group",
      email: `manual.${crypto.randomUUID()}@example.com`,
      eventType: "Private Group",
      preferredDate: "2026-10-15",
      startTime: "17:30",
      guestCount: 20,
      guestMix: "mixed_ages",
      desiredDurationMinutes: 180,
      diningPreference: "pizza_light",
      spacePreference: "no_preference",
      locationId: tenant.locationId,
    });
    const inquiry = await db.inquiry.findFirstOrThrow({ where: { id: created.inquiryId } });
    expect(inquiry.source).toBe(INQUIRY_SOURCES.EMPLOYEE);
    expect(await db.conversation.count({ where: { inquiryId: inquiry.id } })).toBe(0);
    const payload = {
      guestCount: 20,
      eventDate: "2026-10-15",
      startTime: "17:30",
      durationMinutes: 180,
      activities: [{ knowledgeItemId: "bowl", name: "Bowling", quantity: 1, priceCents: 80_000 }],
      dining: { label: "Pizza", priceCents: 0 },
      spaces: [],
      schedule: [],
      itinerary: SAMPLE_ITINERARY,
      pricingComplete: true,
      lineItems: [
        {
          productId: "bowl",
          slug: "bowl",
          name: "Bowling",
          kind: "ATTRACTION",
          quantity: 1,
          unitPriceCents: 80_000,
          totalCents: 80_000,
        },
      ],
      resourceRequirements: [
        requirement({
          type: bowling.type,
          quantityRule: RESOURCE_QUANTITY_RULES.FIXED,
          quantity: 1,
          productId: "bowl",
          name: "Bowling",
        }),
      ],
    };
    const existingPlan = await db.eventPlanRecommendation.findFirst({
      where: { inquiryId: inquiry.id, kind: EVENT_PLAN_KINDS.RECOMMENDATION },
    });
    const plan = existingPlan
      ? await db.eventPlanRecommendation.update({
          where: { id: existingPlan.id },
          data: {
            availabilityValidated: true,
            availabilityStatus: "AVAILABLE",
            estimatedTotalCents: 80_000,
            payload,
          },
        })
      : await db.eventPlanRecommendation.create({
          data: {
            organizationId: tenant.organizationId,
            inquiryId: inquiry.id,
            kind: EVENT_PLAN_KINDS.RECOMMENDATION,
            tier: "best_fit",
            title: "Recommended",
            sortOrder: 0,
            estimatedTotalCents: 80_000,
            currency: "USD",
            guestCount: 20,
            durationMinutes: 180,
            customerFacingReason: "Manual",
            availabilityValidated: true,
            availabilityStatus: "AVAILABLE",
            payload,
          },
        });
    await db.inquiry.update({
      where: { id: inquiry.id },
      data: { selectedEventPlanId: plan.id, agentWorkingPlanId: null },
    });
    await db.eventPlanRecommendation.deleteMany({
      where: { inquiryId: inquiry.id, kind: EVENT_PLAN_KINDS.AGENT_WORKING },
    });
    await startWorkingInquiry(tenant.ctx, db, inquiry.id);
    const check = await checkInquiryAvailability(tenant.ctx, db, inquiry.id);
    expect(check.available).toBe(true);
    expect(await db.resourceReservation.count({ where: { inquiryId: inquiry.id } })).toBe(0);
    const pending = await upsertPendingBookingFromPlan(db, {
      organizationId: tenant.organizationId,
      inquiryId: inquiry.id,
      planId: plan.id,
      actorUserProfileId: tenant.userProfileId,
      source: "employee_save",
    });
    expect(pending.booking.status).toBe(BOOKING_STATUSES.PENDING_PAYMENT);
    expect(await db.resourceReservation.count({ where: { inquiryId: inquiry.id } })).toBe(0);
    const listedPending = await listBookings(tenant.ctx, db, {
      filter: BOOKING_LIST_FILTERS.PENDING,
      search: "Manual Group",
    });
    expect(listedPending.some((row) => row.id === pending.booking.id)).toBe(true);
    const confirmed = await confirmInquiryBooking(tenant.ctx, db, inquiry.id);
    expect(confirmed.booking.status).toBe(BOOKING_STATUSES.CONFIRMED);
    const bowlDay = await getMasterScheduleDay(tenant.ctx, db, {
      date: "2026-10-15",
      resourceTypeId: bowling.type.id,
    });
    expect(bowlDay?.reservations.some((row) => row.startMinute === 19 * 60 && row.endMinute === 20 * 60)).toBe(true);
  });

  it("rejects Front Desk manual booking creation and tenant-B location ids", async () => {
    const tenant = await provisionTenant("auth");
    const other = await provisionTenant("other");
    const desk = await addGroupUser(tenant, SYSTEM_GROUP_KEYS.FRONT_DESK, "desk-seg@example.com");
    await expect(
      createEmployeeManualInquiry(desk.ctx, db, {
        firstName: "No",
        lastName: "Access",
        email: `desk.${crypto.randomUUID()}@example.com`,
        eventType: "Private Group",
        preferredDate: "2026-10-15",
        startTime: "17:30",
        guestCount: 10,
        desiredDurationMinutes: 180,
      }),
    ).rejects.toBeInstanceOf(AuthorizationError);
    await expect(
      createEmployeeManualInquiry(tenant.ctx, db, {
        firstName: "Cross",
        lastName: "Tenant",
        email: `cross.${crypto.randomUUID()}@example.com`,
        eventType: "Private Group",
        preferredDate: "2026-10-15",
        startTime: "17:30",
        guestCount: 10,
        desiredDurationMinutes: 180,
        locationId: other.locationId,
      }),
    ).rejects.toBeInstanceOf(InquiryError);
  });

  it("confirms after Check Availability without a stale inquiry error", async () => {
    const tenant = await provisionTenant("stale-ok");
    const bowling = await seedTypedResources(tenant.organizationId, tenant.locationId, "bowling-lane", "Bowling Lane", 2);
    const created = await createPlanInquiry(tenant.organization, {
      startTime: "17:30",
      durationMinutes: 180,
      itinerary: SAMPLE_ITINERARY,
      requirements: [
        requirement({ type: bowling.type, quantityRule: RESOURCE_QUANTITY_RULES.FIXED, quantity: 1, productId: "bowl", name: "Bowling" }),
      ],
    });
    await bookPublicEventPlan(db, { token: created.publicToken, planId: created.plan.id, rateLimitKey: created.publicToken }, unlimitedLimiter);
    await startWorkingInquiry(tenant.ctx, db, created.inquiryId);
    const before = await db.inquiry.findFirstOrThrow({ where: { id: created.inquiryId } });
    await checkInquiryAvailability(tenant.ctx, db, created.inquiryId);
    const confirmed = await confirmPendingBooking(db, {
      organizationId: tenant.organizationId,
      inquiryId: created.inquiryId,
      actorUserProfileId: tenant.userProfileId,
      attestExternalPayment: true,
    });
    expect(confirmed.created || confirmed.booking.status === BOOKING_STATUSES.CONFIRMED).toBe(true);
    expect(before.id).toBe(created.inquiryId);
  });
});
