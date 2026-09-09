import { afterAll, afterEach, describe, expect, it } from "vitest";

import { createMemoryRateLimiter } from "@/lib/ai/rate-limiter";
import { isLiveAgentQueueCandidate } from "@/lib/inquiries/live-agent-queue";
import { READY_FOR_HUMAN_REASONS } from "@/lib/inquiries/ready-for-human-reason";
import { SYSTEM_GROUP_KEYS } from "@/server/authorization/default-security-groups";
import { AuthorizationError, BookingError } from "@/server/errors";
import { resolveRequestContext } from "@/server/request-context";
import { confirmInquiryBooking, getBookingDetail, listBookings } from "@/server/services/booking-service";
import { getPublicEventPlanByToken, selectPublicEventPlan } from "@/server/services/event-plan-service";
import { createPublicInquiry, listInquiries } from "@/server/services/inquiry-service";
import {
  markInquiryReadyToFinalize,
  saveAgentWorkingPlan,
  startWorkingInquiry,
} from "@/server/services/live-agent-service";
import { provisionOrganization } from "@/server/services/provision-organization";
import { bulkCreateResources, createResourceType } from "@/server/services/resource-admin-service";
import { getMasterScheduleDay } from "@/server/services/resource-schedule-service";
import { placeInquiryPlanHold } from "@/server/services/resource-hold-service";
import { createSalesKnowledgeItem } from "@/server/services/sales-knowledge-service";
import { COMMUNICATION_KINDS, COMMUNICATION_STATUSES } from "@/types/communications";
import type { EventPlanPayload } from "@/types/event-planner";
import { BOOKING_STATUSES } from "@/types/booking";
import {
  EVENT_PLAN_KINDS,
  INQUIRY_STATUSES,
  INQUIRY_WORKFLOW_STAGES,
  SALES_KNOWLEDGE_TYPES,
} from "@/types/inquiry";
import { RESOURCE_RESERVATION_STATUSES } from "@/types/resource-schedule";
import { deleteTestOrganizations } from "../helpers/cleanup-test-organizations";
import { createTestPrismaClient } from "../helpers/test-database";

const db = createTestPrismaClient();
const createdOrganizationIds: string[] = [];
const unlimitedLimiter = createMemoryRateLimiter();

async function cleanup() {
  await deleteTestOrganizations(db, createdOrganizationIds);
  createdOrganizationIds.length = 0;
}

afterEach(cleanup);
afterAll(async () => {
  await db.$disconnect();
});

async function provisionTenant(suffix: string) {
  const result = await provisionOrganization(
    {
      clerkUserId: `user_${suffix}_${crypto.randomUUID()}`,
      clerkOrganizationId: `clerk_org_${suffix}_${crypto.randomUUID()}`,
      organizationName: `Fun ${suffix}`,
      organizationSlug: `fun-${suffix}-${crypto.randomUUID()}`,
      isClerkOrganizationAdmin: true,
    },
    db,
  );
  createdOrganizationIds.push(result.organizationId);
  const organization = await db.organization.findFirstOrThrow({ where: { id: result.organizationId } });
  const profile = await db.userProfile.findFirstOrThrow({ where: { id: result.userProfileId } });
  const ctx = await resolveRequestContext(
    {
      clerkUserId: profile.clerkUserId,
      clerkOrganizationId: organization.clerkOrganizationId,
    },
    db,
  );
  return { ...result, ctx, organization, profile };
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
      firstName: email.split("@")[0] ?? "Agent",
      lastName: "Staff",
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

async function seedBowling(tenant: Awaited<ReturnType<typeof provisionTenant>>, laneCount: number) {
  await createSalesKnowledgeItem(tenant.ctx, db, {
    type: SALES_KNOWLEDGE_TYPES.ATTRACTION,
    name: "Bowling",
    shortDescription: "Bowling",
    details: "Up to 6 bowlers per lane.",
    priceText: "$10/person",
    maxGuests: 6,
    durationMinutes: 60,
    active: true,
  });
  const type = await createResourceType(tenant.ctx, db, { name: "Bowling Lane", slug: "bowling-lane" });
  await bulkCreateResources(tenant.ctx, db, {
    resourceTypeId: type.id,
    count: laneCount,
    namePattern: "Bowling Lane {n}",
  });
  return type;
}

async function submitAndSelect(
  tenant: Awaited<ReturnType<typeof provisionTenant>>,
  email: string,
  guestCount = 12,
) {
  const created = await createPublicInquiry(
    db,
    {
      organizationSlug: tenant.organization.slug,
      rateLimitKey: `${tenant.organization.slug}:${email}`,
      firstName: "Ada",
      lastName: "Lovelace",
      customerGroupName: "Apex Robotics",
      email,
      eventType: "Corporate Event",
      preferredDate: "2026-10-15",
      startTime: "18:00",
      guestCount,
      guestMix: "mostly_adults",
      desiredDurationMinutes: 180,
      budgetBand: "3000_5000",
      eventGoal: "Employee Appreciation",
      diningPreference: "none",
      spacePreference: "no_preference",
      attractionInterestIds: [],
      submissionId: `sub_${crypto.randomUUID()}`,
    },
    undefined,
    unlimitedLimiter,
  );
  const plans = await db.eventPlanRecommendation.findMany({ where: { inquiryId: created.inquiryId } });
  const plan = plans.find((row) => row.availabilityValidated) ?? plans[0]!;
  await selectPublicEventPlan(
    db,
    { token: created.publicToken, planId: plan.id, rateLimitKey: `${email}-select` },
    unlimitedLimiter,
  );
  return { created, plan };
}

function workingInput(payload: EventPlanPayload) {
  return {
    eventDate: payload.eventDate,
    startTime: payload.startTime,
    durationMinutes: payload.durationMinutes,
    guestCount: payload.guestCount,
    activityIds: payload.activities.map((row) => row.knowledgeItemId),
    activityQuantities: Object.fromEntries(payload.activities.map((row) => [row.knowledgeItemId, row.quantity])),
    diningKnowledgeItemId: payload.dining.knowledgeItemId ?? null,
    spaceKnowledgeItemId: payload.spaces[0]?.knowledgeItemId ?? null,
    scheduleLines: payload.schedule,
    rotations: payload.rotations ?? [],
  };
}

async function prepareReadyToFinalize(
  tenant: Awaited<ReturnType<typeof provisionTenant>>,
  email: string,
  guestCount = 18,
) {
  const type = await seedBowling(tenant, 4);
  const { created, plan } = await submitAndSelect(tenant, email, 12);
  await startWorkingInquiry(tenant.ctx, db, created.inquiryId);
  const draft = await db.eventPlanRecommendation.findFirstOrThrow({
    where: { inquiryId: created.inquiryId, kind: EVENT_PLAN_KINDS.AGENT_WORKING },
  });
  const payload = draft.payload as EventPlanPayload;
  await saveAgentWorkingPlan(tenant.ctx, db, created.inquiryId, {
    ...workingInput(payload),
    guestCount,
  });
  await placeInquiryPlanHold(tenant.ctx, db, created.inquiryId);
  const inquiry = await db.inquiry.findFirstOrThrow({ where: { id: created.inquiryId } });
  await markInquiryReadyToFinalize(tenant.ctx, db, created.inquiryId, inquiry.updatedAt.toISOString());
  return { created, plan, type, originalGuestCount: plan.guestCount };
}

describe("confirmed booking conversion (postgres)", { timeout: 45_000 }, () => {
  it("converts a ready-to-finalize working version into one Booking and BOOKED resources", async () => {
    const tenant = await provisionTenant("bk-ok");
    const { created, plan, type } = await prepareReadyToFinalize(tenant, "bk-ok@example.com", 18);
    const selectedBefore = await db.eventPlanRecommendation.findFirstOrThrow({ where: { id: plan.id } });

    const first = await confirmInquiryBooking(tenant.ctx, db, created.inquiryId);
    expect(first.created).toBe(true);
    expect(first.booking.status).toBe(BOOKING_STATUSES.CONFIRMED);
    expect(first.booking.guestCount).toBe(18);
    expect(first.booking.bookingNumber).toMatch(/^[A-Z0-9]{3}-2026-\d{5}$/);
    expect(first.booking.agentWorkingPlanId).toBeTruthy();
    expect(first.booking.selectedEventPlanId).toBe(plan.id);

    const inquiry = await db.inquiry.findFirstOrThrow({ where: { id: created.inquiryId } });
    expect(inquiry.status).toBe(INQUIRY_STATUSES.BOOKED);
    expect(inquiry.workflowStage).toBeNull();

    const reservations = await db.resourceReservation.findMany({
      where: { organizationId: tenant.organizationId, inquiryId: created.inquiryId, releasedAt: null },
    });
    expect(reservations.length).toBeGreaterThan(0);
    expect(reservations.every((row) => row.status === RESOURCE_RESERVATION_STATUSES.BOOKED)).toBe(true);
    expect(reservations.every((row) => row.bookingId === first.booking.id)).toBe(true);
    expect(reservations.every((row) => row.expiresAt == null)).toBe(true);

    const selectedAfter = await db.eventPlanRecommendation.findFirstOrThrow({ where: { id: plan.id } });
    expect(selectedAfter.payload).toEqual(selectedBefore.payload);
    expect(selectedAfter.guestCount).toBe(selectedBefore.guestCount);

    const queued = await listInquiries(tenant.ctx, db);
    expect(queued.some((row) => row.id === created.inquiryId && isLiveAgentQueueCandidate(row))).toBe(false);
    expect(queued.some((row) => row.id === created.inquiryId && row.status === INQUIRY_STATUSES.BOOKED)).toBe(true);

    const listed = await listBookings(tenant.ctx, db, { filter: "upcoming" });
    expect(listed.some((row) => row.id === first.booking.id)).toBe(true);

    const detail = await getBookingDetail(tenant.ctx, db, first.booking.id);
    expect(detail?.guestCount).toBe(18);
    expect(detail?.lineItems.length).toBeGreaterThan(0);

    const schedule = await getMasterScheduleDay(tenant.ctx, db, {
      date: "2026-10-15",
      resourceTypeId: type.id,
    });
    expect(schedule?.reservations.some((row) => row.status === RESOURCE_RESERVATION_STATUSES.BOOKED && row.bookingId === first.booking.id)).toBe(true);

    const comms = await db.communicationEvent.findMany({
      where: { organizationId: tenant.organizationId, kind: COMMUNICATION_KINDS.BOOKING_CONFIRMATION },
    });
    expect(comms).toHaveLength(1);
    expect(comms[0]?.status).toBe(COMMUNICATION_STATUSES.SKIPPED);
    expect(comms[0]?.bookingId).toBe(first.booking.id);

    const publicView = await getPublicEventPlanByToken(db, created.publicToken);
    expect(publicView.booking?.bookingNumber).toBe(first.booking.bookingNumber);

    const duplicate = await confirmInquiryBooking(tenant.ctx, db, created.inquiryId);
    expect(duplicate.created).toBe(false);
    expect(duplicate.booking.id).toBe(first.booking.id);
    expect(
      await db.booking.count({ where: { organizationId: tenant.organizationId, inquiryId: created.inquiryId } }),
    ).toBe(1);
  });

  it("blocks confirmation when a finite requirement has no active hold", async () => {
    const tenant = await provisionTenant("bk-hold");
    await seedBowling(tenant, 4);
    const { created } = await submitAndSelect(tenant, "bk-hold@example.com");
    await startWorkingInquiry(tenant.ctx, db, created.inquiryId);
    const draft = await db.eventPlanRecommendation.findFirstOrThrow({
      where: { inquiryId: created.inquiryId, kind: EVENT_PLAN_KINDS.AGENT_WORKING },
    });
    await saveAgentWorkingPlan(tenant.ctx, db, created.inquiryId, workingInput(draft.payload as EventPlanPayload));
    await expect(confirmInquiryBooking(tenant.ctx, db, created.inquiryId)).rejects.toBeInstanceOf(BookingError);
    expect(await db.booking.count({ where: { organizationId: tenant.organizationId } })).toBe(0);
    expect(
      await db.resourceReservation.count({
        where: { organizationId: tenant.organizationId, status: RESOURCE_RESERVATION_STATUSES.BOOKED },
      }),
    ).toBe(0);
  });

  it("blocks expired holds without converting anything", async () => {
    const tenant = await provisionTenant("bk-exp");
    const { created } = await prepareReadyToFinalize(tenant, "bk-exp@example.com");
    await db.resourceReservation.updateMany({
      where: { organizationId: tenant.organizationId, inquiryId: created.inquiryId },
      data: { expiresAt: new Date("2000-01-01T00:00:00.000Z") },
    });
    await expect(confirmInquiryBooking(tenant.ctx, db, created.inquiryId)).rejects.toMatchObject({
      code: "HOLD_EXPIRED",
    });
    expect(await db.booking.count({ where: { organizationId: tenant.organizationId } })).toBe(0);
    expect(
      await db.inquiry.findFirstOrThrow({ where: { id: created.inquiryId } }),
    ).toMatchObject({ status: INQUIRY_STATUSES.READY_FOR_HUMAN, workflowStage: INQUIRY_WORKFLOW_STAGES.READY_TO_FINALIZE });
    expect(
      await db.resourceReservation.count({
        where: { inquiryId: created.inquiryId, status: RESOURCE_RESERVATION_STATUSES.BOOKED },
      }),
    ).toBe(0);
  });

  it("blocks an availability conflict without creating a booking", async () => {
    const tenant = await provisionTenant("bk-av");
    const { created } = await prepareReadyToFinalize(tenant, "bk-av@example.com");
    await db.resource.updateMany({
      where: { organizationId: tenant.organizationId },
      data: { active: false },
    });
    await expect(confirmInquiryBooking(tenant.ctx, db, created.inquiryId)).rejects.toMatchObject({
      code: "AVAILABILITY_CONFLICT",
    });
    expect(await db.booking.count({ where: { organizationId: tenant.organizationId } })).toBe(0);
    expect(
      await db.inquiry.findFirstOrThrow({ where: { id: created.inquiryId } }),
    ).toMatchObject({ status: INQUIRY_STATUSES.READY_FOR_HUMAN });
  });

  it("rolls back when reservation conversion fails", async () => {
    const tenant = await provisionTenant("bk-roll");
    const { created } = await prepareReadyToFinalize(tenant, "bk-roll@example.com");
    const failing = db.$extends({
      query: {
        resourceReservation: {
          async updateMany({ args, query }) {
            if (args.data && typeof args.data === "object" && "status" in args.data && args.data.status === "BOOKED") {
              throw new Error("simulated conversion failure");
            }
            return query(args);
          },
        },
      },
    });
    await expect(
      confirmInquiryBooking(tenant.ctx, failing as unknown as typeof db, created.inquiryId),
    ).rejects.toThrow(/simulated conversion failure/);
    expect(await db.booking.count({ where: { organizationId: tenant.organizationId } })).toBe(0);
    expect(
      await db.resourceReservation.count({
        where: { inquiryId: created.inquiryId, status: RESOURCE_RESERVATION_STATUSES.BOOKED },
      }),
    ).toBe(0);
    expect(
      await db.inquiry.findFirstOrThrow({ where: { id: created.inquiryId } }),
    ).toMatchObject({ status: INQUIRY_STATUSES.READY_FOR_HUMAN });
    expect(
      await db.communicationEvent.count({
        where: { organizationId: tenant.organizationId, kind: COMMUNICATION_KINDS.BOOKING_CONFIRMATION },
      }),
    ).toBe(0);
  });

  it("lets only one of two concurrent confirms succeed", async () => {
    const tenant = await provisionTenant("bk-race");
    const { created } = await prepareReadyToFinalize(tenant, "bk-race@example.com");
    const other = await addGroupUser(tenant, SYSTEM_GROUP_KEYS.EVENT_SALES, "second-bk@example.com");
    const results = await Promise.allSettled([
      confirmInquiryBooking(tenant.ctx, db, created.inquiryId),
      confirmInquiryBooking(other.ctx, db, created.inquiryId),
    ]);
    const fulfilled = results.filter((row) => row.status === "fulfilled");
    expect(fulfilled.length).toBeGreaterThanOrEqual(1);
    const bookings = await db.booking.findMany({ where: { organizationId: tenant.organizationId } });
    expect(bookings).toHaveLength(1);
    const createdFlags = fulfilled
      .map((row) => (row.status === "fulfilled" ? row.value.created : false))
      .filter(Boolean);
    expect(createdFlags.length).toBeLessThanOrEqual(1);
    const inquiry = await db.inquiry.findFirstOrThrow({ where: { id: created.inquiryId } });
    expect(inquiry.status).toBe(INQUIRY_STATUSES.BOOKED);
  });

  it("rejects Front Desk confirmation", async () => {
    const tenant = await provisionTenant("bk-desk");
    const { created } = await prepareReadyToFinalize(tenant, "bk-desk@example.com");
    const desk = await addGroupUser(tenant, SYSTEM_GROUP_KEYS.FRONT_DESK, "desk-bk@example.com");
    await expect(confirmInquiryBooking(desk.ctx, db, created.inquiryId)).rejects.toBeInstanceOf(AuthorizationError);
    expect(await db.booking.count({ where: { organizationId: tenant.organizationId } })).toBe(0);
  });

  it("does not emit booking.confirmed when confirmation is blocked", async () => {
    const tenant = await provisionTenant("bk-skip");
    await seedBowling(tenant, 4);
    const { created } = await submitAndSelect(tenant, "bk-skip@example.com");
    await startWorkingInquiry(tenant.ctx, db, created.inquiryId);
    await expect(confirmInquiryBooking(tenant.ctx, db, created.inquiryId)).rejects.toBeInstanceOf(BookingError);
    expect(
      await db.communicationEvent.count({
        where: { organizationId: tenant.organizationId, kind: COMMUNICATION_KINDS.BOOKING_CONFIRMATION },
      }),
    ).toBe(0);
    expect(created.inquiryId).toBeTruthy();
    expect(READY_FOR_HUMAN_REASONS.CUSTOMER_SELECTED_PLAN).toBe("CUSTOMER_SELECTED_PLAN");
  });
});
