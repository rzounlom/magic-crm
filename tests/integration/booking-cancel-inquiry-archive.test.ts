import { afterAll, afterEach, describe, expect, it } from "vitest";

import { createMemoryRateLimiter } from "@/lib/ai/rate-limiter";
import { SYSTEM_GROUP_KEYS } from "@/server/authorization/default-security-groups";
import { AuthorizationError, BookingError } from "@/server/errors";
import { resolveRequestContext } from "@/server/request-context";
import { locationHasExclusiveOccupancy } from "@/server/resources/location-exclusivity";
import { cancelBooking, confirmInquiryBooking, listBookings } from "@/server/services/booking-service";
import { reservePublicEventPlan } from "@/server/services/event-plan-service";
import {
  archiveInquiry,
  createPublicInquiry,
  listInquiries,
  unarchiveInquiry,
} from "@/server/services/inquiry-service";
import { startWorkingInquiry } from "@/server/services/live-agent-service";
import { upsertPendingBookingFromPlan } from "@/server/services/pending-booking-service";
import { provisionOrganization } from "@/server/services/provision-organization";
import { getMasterScheduleDay } from "@/server/services/resource-schedule-service";
import { BOOKING_LIST_FILTERS, BOOKING_STATUSES } from "@/types/booking";
import { EVENT_PLAN_KINDS, INQUIRY_LIST_VIEWS, INQUIRY_SALES_STAGES } from "@/types/inquiry";
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
      clerkUserId: `user_cancel_${suffix}_${crypto.randomUUID()}`,
      clerkOrganizationId: `clerk_org_cancel_${suffix}_${crypto.randomUUID()}`,
      organizationName: `Cancel ${suffix}`,
      organizationSlug: `cancel-${suffix}-${crypto.randomUUID()}`,
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
      clerkUserId: `user_${crypto.randomUUID()}`,
      defaultLocationId: tenant.locationId,
      email,
      firstName: email.split("@")[0] ?? "Staff",
      lastName: "Desk",
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
    {
      clerkUserId: profile.clerkUserId,
      clerkOrganizationId: tenant.organization.clerkOrganizationId,
    },
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
  title = "Cancel Plan",
  startTime = "18:00",
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
      startTime,
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
        startTime,
        durationMinutes: 180,
        activities: [{ knowledgeItemId: "bowl", name: "Bowling", quantity: 1, priceCents: 100_000 }],
        dining: { label: "Pizza", priceCents: 0 },
        spaces: [],
        schedule: [],
        itinerary: [{ startTime, endTime: "19:00", label: "Bowling" }],
        pricingComplete: true,
        depositPreviewCents: 30_000,
        resourceRequirements: requirements,
      },
    },
  });
  return { ...created, plan };
}

async function confirmPlan(
  tenant: Awaited<ReturnType<typeof provisionTenant>>,
  created: Awaited<ReturnType<typeof createPlanInquiry>>,
) {
  await reservePublicEventPlan(
    db,
    { token: created.publicToken, planId: created.plan.id, rateLimitKey: created.publicToken },
    unlimitedLimiter,
  );
  await startWorkingInquiry(tenant.ctx, db, created.inquiryId);
  return confirmInquiryBooking(tenant.ctx, db, created.inquiryId);
}

describe("booking cancellation and inquiry archive (postgres)", { timeout: 120_000 }, () => {
  it("cancels a pending booking with zero occupancy", async () => {
    const tenant = await provisionTenant("pending");
    const bowling = await seedTypedResources(tenant.organizationId, tenant.locationId, "bowling-lane", "Bowling Lane", 1);
    const created = await createPlanInquiry(tenant.organization, [
      requirement({ type: bowling.type, quantityRule: RESOURCE_QUANTITY_RULES.FIXED, quantity: 1 }),
    ]);
    await reservePublicEventPlan(
      db,
      { token: created.publicToken, planId: created.plan.id, rateLimitKey: created.publicToken },
      unlimitedLimiter,
    );
    const cancelled = await cancelBooking(tenant.ctx, db, { inquiryId: created.inquiryId });
    expect(cancelled.booking.status).toBe(BOOKING_STATUSES.CANCELLED);
    expect(cancelled.releasedCount).toBe(0);
    expect(
      await db.resourceReservation.count({
        where: { organizationId: tenant.organizationId, inquiryId: created.inquiryId, releasedAt: null },
      }),
    ).toBe(0);
    const inquiry = await db.inquiry.findFirstOrThrow({ where: { id: created.inquiryId } });
    expect(inquiry.salesStage).toBe(INQUIRY_SALES_STAGES.CLOSED);
    expect(inquiry.archivedAt).toBeNull();
  });

  it("cancels a confirmed booking and frees the Master Schedule while keeping reservation rows", async () => {
    const tenant = await provisionTenant("simple");
    const bowling = await seedTypedResources(tenant.organizationId, tenant.locationId, "bowling-lane", "Bowling Lane", 1);
    const created = await createPlanInquiry(tenant.organization, [
      requirement({ type: bowling.type, quantityRule: RESOURCE_QUANTITY_RULES.FIXED, quantity: 1 }),
    ]);
    const confirmed = await confirmPlan(tenant, created);
    expect(confirmed.booking.status).toBe(BOOKING_STATUSES.CONFIRMED);
    const before = await getMasterScheduleDay(tenant.ctx, db, {
      date: "2026-10-15",
      resourceTypeId: bowling.type.id,
    });
    expect(before?.reservations.filter((row) => row.status === RESOURCE_RESERVATION_STATUSES.BOOKED)).toHaveLength(1);

    const cancelled = await cancelBooking(tenant.ctx, db, { bookingId: confirmed.booking.id });
    expect(cancelled.booking.status).toBe(BOOKING_STATUSES.CANCELLED);
    expect(cancelled.releasedCount).toBeGreaterThan(0);

    const rows = await db.resourceReservation.findMany({
      where: { organizationId: tenant.organizationId, bookingId: confirmed.booking.id },
    });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.releasedAt != null)).toBe(true);

    const after = await getMasterScheduleDay(tenant.ctx, db, {
      date: "2026-10-15",
      resourceTypeId: bowling.type.id,
    });
    expect(after?.reservations.filter((row) => row.status === RESOURCE_RESERVATION_STATUSES.BOOKED)).toHaveLength(0);

    const upcoming = await listBookings(tenant.ctx, db, { filter: BOOKING_LIST_FILTERS.UPCOMING });
    expect(upcoming.some((row) => row.id === confirmed.booking.id)).toBe(false);
    const past = await listBookings(tenant.ctx, db, { filter: BOOKING_LIST_FILTERS.PAST });
    expect(past.some((row) => row.id === confirmed.booking.id)).toBe(true);

    const audits = await db.auditLog.findMany({
      where: { organizationId: tenant.organizationId, resourceId: confirmed.booking.id },
    });
    expect(audits.some((row) => row.action === "booking.cancelled")).toBe(true);
    expect(audits.some((row) => row.action === "resource_reservations.released_for_cancellation")).toBe(true);
  });

  it("releases every Mezzanine composite reservation for the cancelled booking", async () => {
    const tenant = await provisionTenant("mezz");
    const bowling = await seedTypedResources(tenant.organizationId, tenant.locationId, "bowling-lane", "Bowling Lane", 8);
    const axe = await seedTypedResources(
      tenant.organizationId,
      tenant.locationId,
      "axe-throwing-lane",
      "Axe Throwing Lane",
      8,
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
    const confirmed = await confirmPlan(tenant, created);
    expect(
      await db.resourceReservation.count({
        where: { organizationId: tenant.organizationId, bookingId: confirmed.booking.id, releasedAt: null },
      }),
    ).toBe(8 + 7 + 1 + 1);

    await cancelBooking(tenant.ctx, db, { bookingId: confirmed.booking.id });
    expect(
      await db.resourceReservation.count({
        where: { organizationId: tenant.organizationId, bookingId: confirmed.booking.id, releasedAt: null },
      }),
    ).toBe(0);
    expect(
      await db.resourceReservation.count({
        where: { organizationId: tenant.organizationId, bookingId: confirmed.booking.id },
      }),
    ).toBe(17);
  });

  it("releases Full Facility exclusive occupancy on cancel", async () => {
    const tenant = await provisionTenant("full");
    const bowling = await seedTypedResources(tenant.organizationId, tenant.locationId, "bowling-lane", "Bowling Lane", 2);
    const extra = await seedTypedResources(tenant.organizationId, tenant.locationId, "laser-tag-arena", "Laser Tag Arena", 1);
    const fullFacility = await seedTypedResources(
      tenant.organizationId,
      tenant.locationId,
      "full-facility",
      "Full Facility",
      1,
    );
    const created = await createPlanInquiry(
      tenant.organization,
      [
        requirement({
          type: fullFacility.type,
          quantityRule: RESOURCE_QUANTITY_RULES.LOCATION_EXCLUSIVE,
          quantity: 1,
        }),
      ],
      "Full Facility",
    );
    const confirmed = await confirmPlan(tenant, created);
    expect(
      await db.resourceReservation.count({
        where: {
          organizationId: tenant.organizationId,
          bookingId: confirmed.booking.id,
          releasedAt: null,
        },
      }),
    ).toBe(bowling.resources.length + extra.resources.length + fullFacility.resources.length);

    await cancelBooking(tenant.ctx, db, { bookingId: confirmed.booking.id });
    expect(
      await db.resourceReservation.count({
        where: { organizationId: tenant.organizationId, bookingId: confirmed.booking.id, releasedAt: null },
      }),
    ).toBe(0);
    expect(
      await locationHasExclusiveOccupancy(db, {
        organizationId: tenant.organizationId,
        locationId: tenant.locationId!,
        window: { slotDate: "2026-10-15", startMinute: 18 * 60, endMinute: 19 * 60 },
      }),
    ).toBe(false);

    const next = await createPlanInquiry(
      tenant.organization,
      [
        requirement({
          type: fullFacility.type,
          quantityRule: RESOURCE_QUANTITY_RULES.LOCATION_EXCLUSIVE,
          quantity: 1,
        }),
      ],
      "Full Facility after cancel",
    );
    const rebooked = await confirmPlan(tenant, next);
    expect(rebooked.booking.status).toBe(BOOKING_STATUSES.CONFIRMED);
    expect(rebooked.conflict).toBeNull();
  });

  it("hides archived inquiries from the default list and restores them on unarchive", async () => {
    const tenant = await provisionTenant("archive");
    const created = await createPublicInquiry(
      db,
      {
        organizationSlug: tenant.organization.slug,
        rateLimitKey: `${tenant.organization.slug}:${crypto.randomUUID()}`,
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

    const newer = await createPublicInquiry(
      db,
      {
        organizationSlug: tenant.organization.slug,
        rateLimitKey: `${tenant.organization.slug}:${crypto.randomUUID()}`,
        firstName: "Grace",
        lastName: "Hopper",
        email: `grace.${crypto.randomUUID()}@example.com`,
        eventType: "Birthday Party",
        preferredDate: "2026-10-20",
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

    await archiveInquiry(tenant.ctx, db, created.inquiryId);
    await archiveInquiry(tenant.ctx, db, newer.inquiryId);
    const active = await listInquiries(tenant.ctx, db);
    expect(active.some((row) => row.id === created.inquiryId || row.id === newer.inquiryId)).toBe(false);
    const archived = await listInquiries(tenant.ctx, db, { view: INQUIRY_LIST_VIEWS.ARCHIVED });
    expect(archived.map((row) => row.id)).toEqual([newer.inquiryId, created.inquiryId]);

    await unarchiveInquiry(tenant.ctx, db, created.inquiryId);
    const restored = await listInquiries(tenant.ctx, db);
    expect(restored.some((row) => row.id === created.inquiryId)).toBe(true);
  });

  it("does not cancel an active booking when the inquiry is archived", async () => {
    const tenant = await provisionTenant("keep-book");
    const bowling = await seedTypedResources(tenant.organizationId, tenant.locationId, "bowling-lane", "Bowling Lane", 1);
    const created = await createPlanInquiry(tenant.organization, [
      requirement({ type: bowling.type, quantityRule: RESOURCE_QUANTITY_RULES.FIXED, quantity: 1 }),
    ]);
    const confirmed = await confirmPlan(tenant, created);
    await archiveInquiry(tenant.ctx, db, created.inquiryId);
    const booking = await db.booking.findFirstOrThrow({ where: { id: confirmed.booking.id } });
    expect(booking.status).toBe(BOOKING_STATUSES.CONFIRMED);
    expect(
      await db.resourceReservation.count({
        where: { bookingId: confirmed.booking.id, releasedAt: null },
      }),
    ).toBeGreaterThan(0);
    const inquiry = await db.inquiry.findFirstOrThrow({ where: { id: created.inquiryId } });
    expect(inquiry.archivedAt).not.toBeNull();
  });

  it("scopes cancel and archive to the actor tenant", async () => {
    const tenantA = await provisionTenant("ten-a");
    const tenantB = await provisionTenant("ten-b");
    const bowling = await seedTypedResources(tenantA.organizationId, tenantA.locationId, "bowling-lane", "Bowling Lane", 1);
    const created = await createPlanInquiry(tenantA.organization, [
      requirement({ type: bowling.type, quantityRule: RESOURCE_QUANTITY_RULES.FIXED, quantity: 1 }),
    ]);
    const confirmed = await confirmPlan(tenantA, created);

    await expect(cancelBooking(tenantB.ctx, db, { bookingId: confirmed.booking.id })).rejects.toBeInstanceOf(
      BookingError,
    );
    await expect(archiveInquiry(tenantB.ctx, db, created.inquiryId)).rejects.toMatchObject({ code: "INQUIRY_NOT_FOUND" });

    const booking = await db.booking.findFirstOrThrow({ where: { id: confirmed.booking.id } });
    expect(booking.status).toBe(BOOKING_STATUSES.CONFIRMED);
  });

  it("rejects cancel and archive from unauthorized employees", async () => {
    const tenant = await provisionTenant("unauth");
    const bowling = await seedTypedResources(tenant.organizationId, tenant.locationId, "bowling-lane", "Bowling Lane", 1);
    const created = await createPlanInquiry(tenant.organization, [
      requirement({ type: bowling.type, quantityRule: RESOURCE_QUANTITY_RULES.FIXED, quantity: 1 }),
    ]);
    const confirmed = await confirmPlan(tenant, created);
    const desk = await addGroupUser(tenant, SYSTEM_GROUP_KEYS.FRONT_DESK, `desk.${crypto.randomUUID()}@example.com`);

    await expect(cancelBooking(desk.ctx, db, { bookingId: confirmed.booking.id })).rejects.toBeInstanceOf(
      AuthorizationError,
    );
    await expect(archiveInquiry(desk.ctx, db, created.inquiryId)).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("lets a payment-conflict pending booking be edited, retried, or cancelled", async () => {
    const tenant = await provisionTenant("conflict");
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
    await startWorkingInquiry(tenant.ctx, db, first.inquiryId);
    const occupied = await confirmInquiryBooking(tenant.ctx, db, first.inquiryId);
    expect(occupied.booking.status).toBe(BOOKING_STATUSES.CONFIRMED);

    await startWorkingInquiry(tenant.ctx, db, second.inquiryId);
    await expect(confirmInquiryBooking(tenant.ctx, db, second.inquiryId)).rejects.toMatchObject({
      code: "AVAILABILITY_CONFLICT",
    });
    const stuckBooking = await db.booking.findFirstOrThrow({ where: { inquiryId: second.inquiryId } });
    expect(stuckBooking.status).toBe(BOOKING_STATUSES.PENDING_PAYMENT);
    expect(stuckBooking.availabilityConflictAt).toBeTruthy();
    expect(stuckBooking.paymentConfirmedExternallyAt).toBeTruthy();

    const working = await db.eventPlanRecommendation.findFirstOrThrow({
      where: { inquiryId: second.inquiryId, kind: EVENT_PLAN_KINDS.AGENT_WORKING },
    });
    await db.eventPlanRecommendation.update({
      where: { id: working.id },
      data: {
        payload: {
          ...(working.payload as object),
          startTime: "14:00",
          itinerary: [{ startTime: "14:00", endTime: "15:00", label: "Bowling" }],
        },
      },
    });
    await upsertPendingBookingFromPlan(db, {
      organizationId: tenant.organizationId,
      inquiryId: second.inquiryId,
      planId: working.id,
      actorUserProfileId: tenant.ctx.userId,
      source: "employee_save",
    });
    const retried = await confirmInquiryBooking(tenant.ctx, db, second.inquiryId);
    expect(retried.conflict).toBeNull();
    expect(retried.booking.status).toBe(BOOKING_STATUSES.CONFIRMED);

    const cancelled = await cancelBooking(tenant.ctx, db, { inquiryId: second.inquiryId });
    expect(cancelled.booking.status).toBe(BOOKING_STATUSES.CANCELLED);
    expect(
      await db.resourceReservation.count({
        where: { organizationId: tenant.organizationId, inquiryId: second.inquiryId, releasedAt: null },
      }),
    ).toBe(0);
  });

  it("does not cancel completed bookings", async () => {
    const tenant = await provisionTenant("completed");
    const bowling = await seedTypedResources(tenant.organizationId, tenant.locationId, "bowling-lane", "Bowling Lane", 1);
    const created = await createPlanInquiry(tenant.organization, [
      requirement({ type: bowling.type, quantityRule: RESOURCE_QUANTITY_RULES.FIXED, quantity: 1 }),
    ]);
    const confirmed = await confirmPlan(tenant, created);
    await db.booking.update({
      where: { id: confirmed.booking.id },
      data: { status: BOOKING_STATUSES.COMPLETED },
    });
    await expect(cancelBooking(tenant.ctx, db, { bookingId: confirmed.booking.id })).rejects.toMatchObject({
      code: "BOOKING_NOT_CANCELLABLE",
    });
  });
});
