import { afterAll, afterEach, describe, expect, it } from "vitest";

import { createMemoryRateLimiter } from "@/lib/ai/rate-limiter";
import { InquiryError, ResourceError } from "@/server/errors";
import { resolveRequestContext } from "@/server/request-context";
import { authorizeOperatingHoursException } from "@/server/resources/hours-exception";
import { confirmInquiryBooking } from "@/server/services/booking-service";
import { getConfirmationReadiness } from "@/server/services/confirmation-readiness-service";
import { bookPublicEventPlan } from "@/server/services/event-plan-service";
import { getHoldReadiness } from "@/server/services/hold-readiness-service";
import { createPublicInquiry } from "@/server/services/inquiry-service";
import {
  savePendingEmployeeBooking,
  startWorkingInquiry,
} from "@/server/services/live-agent-service";
import { expireInquiryHoldsNow } from "@/server/services/proposal-hold-service";
import { provisionOrganization } from "@/server/services/provision-organization";
import {
  placeInquiryPlanHold,
  releaseInquiryHolds,
} from "@/server/services/resource-hold-service";
import { BOOKING_STATUSES, BOOKING_STATUS_LABELS } from "@/types/booking";
import { CONFIRMATION_READINESS_STATES } from "@/types/confirmation-readiness";
import type { EventPlanPayload } from "@/types/event-planner";
import { HOLD_READINESS_STATES } from "@/types/hold-readiness";
import { EVENT_PLAN_KINDS, INQUIRY_STATUSES } from "@/types/inquiry";
import {
  OPERATING_HOURS_EVALUATION_STATUSES,
  OPERATING_HOURS_EXCEPTION_PURPOSES,
  OPERATING_HOURS_VERIFICATION_STATUSES,
} from "@/types/operating-hours";
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
}, 120_000);

afterAll(async () => {
  await db.$disconnect();
});

async function provisionTenant(suffix: string) {
  const result = await provisionOrganization(
    {
      clerkUserId: `user_sbf3_${suffix}_${crypto.randomUUID()}`,
      clerkOrganizationId: `clerk_org_sbf3_${suffix}_${crypto.randomUUID()}`,
      organizationName: `SBF3 ${suffix}`,
      organizationSlug: `sbf3-${suffix}-${crypto.randomUUID()}`,
      isClerkOrganizationAdmin: true,
    },
    db,
  );
  createdOrganizationIds.push(result.organizationId);
  await db.organization.update({
    where: { id: result.organizationId },
    data: { timezone: "America/Indiana/Indianapolis" },
  });
  const organization = await db.organization.findFirstOrThrow({
    where: { id: result.organizationId },
    include: { locations: true },
  });
  if (organization.locations[0]) {
    await db.location.update({
      where: { id: organization.locations[0].id },
      data: { timezone: "America/Indiana/Indianapolis" },
    });
  }
  const profile = await db.userProfile.findFirstOrThrow({ where: { id: result.userProfileId } });
  const ctx = await resolveRequestContext(
    {
      clerkUserId: profile.clerkUserId,
      clerkOrganizationId: organization.clerkOrganizationId,
    },
    db,
  );
  return {
    ...result,
    ctx,
    organization,
    profile,
    locationId: organization.locations[0]?.id ?? null,
  };
}

async function seedLane(organizationId: string, locationId: string | null) {
  const type = await db.resourceType.create({
    data: {
      organizationId,
      locationId,
      slug: `lane-${crypto.randomUUID().slice(0, 8)}`,
      name: "Lane",
      inventoryConfigured: true,
      active: true,
    },
  });
  const resource = await db.resource.create({
    data: {
      organizationId,
      resourceTypeId: type.id,
      locationId,
      name: "Lane 1",
      displayOrder: 1,
      active: true,
    },
  });
  return { type, resource };
}

async function seedVerifiedOpenHours(
  organizationId: string,
  locationId: string,
  localDate: string,
) {
  const policy = await db.locationOperatingHoursPolicy.create({
    data: {
      organizationId,
      locationId,
      verificationStatus: OPERATING_HOURS_VERIFICATION_STATUSES.VERIFIED,
      approvedAt: new Date("2026-10-01T00:00:00.000Z"),
      approvedByNote: "SBF3 synthetic verified hours",
    },
  });
  const [y, m, d] = localDate.split("-").map(Number);
  const dayOfWeek = new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay();
  await db.locationOperatingHoursWindow.create({
    data: {
      organizationId,
      locationId,
      policyId: policy.id,
      dayOfWeek,
      startMinute: 10 * 60,
      endMinute: 22 * 60,
    },
  });
  return policy;
}

function requirement(type: { id: string; slug: string; name: string }): PlanResourceRequirement {
  return {
    knowledgeItemId: type.id,
    knowledgeItemName: type.name,
    resourceTypeId: type.id,
    resourceTypeSlug: type.slug,
    resourceTypeName: type.name,
    quantityRule: RESOURCE_QUANTITY_RULES.FIXED,
    quantity: 1,
    guestsPerUnit: null,
    durationMinutes: 120,
    inventoryConfigured: true,
    requiresStaffConfiguration: false,
    specificResourceId: null,
    locationExclusive: false,
  };
}

async function createJourneyInquiry(
  tenant: Awaited<ReturnType<typeof provisionTenant>>,
  type: { id: string; slug: string; name: string },
  opts?: { eventDate?: string; startTime?: string },
) {
  const eventDate = opts?.eventDate ?? "2026-11-12";
  const startTime = opts?.startTime ?? "14:00";
  const email = `sbf3.${crypto.randomUUID()}@example.com`;
  const created = await createPublicInquiry(
    db,
    {
      organizationSlug: tenant.organization.slug,
      rateLimitKey: `${tenant.organization.slug}:${email}`,
      firstName: "Ada",
      lastName: "Lovelace",
      email,
      eventType: "Birthday Party",
      preferredDate: eventDate,
      startTime,
      guestCount: 8,
      guestMix: "mixed_ages",
      desiredDurationMinutes: 120,
      budgetBand: "1500_3000",
      eventGoal: "Celebration",
      diningPreference: "none",
      spacePreference: "no_preference",
      attractionInterestIds: [],
      submissionId: `sub_${crypto.randomUUID()}`,
    },
    undefined,
    unlimitedLimiter,
  );
  const plan = await db.eventPlanRecommendation.create({
    data: {
      organizationId: tenant.organizationId,
      inquiryId: created.inquiryId,
      kind: EVENT_PLAN_KINDS.RECOMMENDATION,
      tier: "best_fit",
      title: "Recommended",
      sortOrder: 0,
      estimatedTotalCents: 20_000,
      currency: "USD",
      guestCount: 8,
      durationMinutes: 120,
      customerFacingReason: "Test",
      availabilityValidated: true,
      availabilityStatus: "AVAILABLE",
      payload: {
        guestCount: 8,
        eventDate,
        startTime,
        durationMinutes: 120,
        activities: [{ knowledgeItemId: type.id, name: type.name, quantity: 1, priceCents: 20_000 }],
        dining: { label: "None", priceCents: 0 },
        spaces: [],
        schedule: [`${startTime} Lane`],
        itinerary: [
          {
            startTime,
            endTime: "16:00",
            label: type.name,
            productId: type.id,
            startOffsetMinutes: 0,
            durationMinutes: 120,
          },
        ],
        pricingComplete: true,
        resourceRequirements: [requirement(type)],
      },
    },
  });
  await bookPublicEventPlan(
    db,
    { token: created.publicToken, planId: plan.id, rateLimitKey: created.publicToken },
    unlimitedLimiter,
  );
  await startWorkingInquiry(tenant.ctx, db, created.inquiryId);
  return { ...created, plan, eventDate, startTime };
}

describe("SBF3 end-to-end staff booking journey (TEST)", { timeout: 240_000 }, () => {
  it("runs inquiry → plan → HOLD → confirmed booking under verified hours", async () => {
    const tenant = await provisionTenant("hold-confirm");
    const { type } = await seedLane(tenant.organizationId, tenant.locationId);
    const inquiry = await createJourneyInquiry(tenant, type, {
      eventDate: "2026-11-12",
      startTime: "14:00",
    });
    await seedVerifiedOpenHours(tenant.organizationId, tenant.locationId!, "2026-11-12");

    const pending = await savePendingEmployeeBooking(tenant.ctx, db, inquiry.inquiryId);
    expect(pending.booking.status).toBe(BOOKING_STATUSES.PENDING_PAYMENT);
    expect(BOOKING_STATUS_LABELS[BOOKING_STATUSES.PENDING_PAYMENT]).toBe("Pending confirmation");
    expect(pending.booking.paymentConfirmedExternallyAt).toBeNull();

    const holdReady = await getHoldReadiness(tenant.ctx, db, inquiry.inquiryId);
    expect(holdReady.state).toBe(HOLD_READINESS_STATES.NEEDS_FINAL_VALIDATION);
    expect(holdReady.holdAttemptAllowed).toBe(true);

    const hold = await placeInquiryPlanHold(tenant.ctx, db, inquiry.inquiryId);
    expect(hold.resourceCount).toBeGreaterThan(0);

    const confirmReady = await getConfirmationReadiness(tenant.ctx, db, inquiry.inquiryId);
    expect(confirmReady.state).toBe(CONFIRMATION_READINESS_STATES.NEEDS_FINAL_VALIDATION);
    expect(confirmReady.confirmAttemptAllowed).toBe(true);

    const confirmed = await confirmInquiryBooking(tenant.ctx, db, inquiry.inquiryId);
    expect(confirmed.created).toBe(true);
    expect(confirmed.booking.status).toBe(BOOKING_STATUSES.CONFIRMED);

    const inquiryRow = await db.inquiry.findFirstOrThrow({ where: { id: inquiry.inquiryId } });
    expect(inquiryRow.status).toBe(INQUIRY_STATUSES.BOOKED);

    const holdsLeft = await db.resourceReservation.count({
      where: {
        inquiryId: inquiry.inquiryId,
        status: RESOURCE_RESERVATION_STATUSES.HOLD,
        releasedAt: null,
      },
    });
    expect(holdsLeft).toBe(0);

    const bookedRows = await db.resourceReservation.count({
      where: {
        bookingId: confirmed.booking.id,
        status: RESOURCE_RESERVATION_STATUSES.BOOKED,
        releasedAt: null,
      },
    });
    expect(bookedRows).toBeGreaterThan(0);

    // Confirm may attest external payment outside MagicCRM; there is still no processor capture.
    expect(confirmed.booking.status).toBe(BOOKING_STATUSES.CONFIRMED);
    const again = await confirmInquiryBooking(tenant.ctx, db, inquiry.inquiryId);
    expect(again.created).toBe(false);
    expect(again.booking.status).toBe(BOOKING_STATUSES.CONFIRMED);
  });

  it("confirms a pending booking without a HOLD under verified hours", async () => {
    const tenant = await provisionTenant("no-hold");
    const { type } = await seedLane(tenant.organizationId, tenant.locationId);
    const inquiry = await createJourneyInquiry(tenant, type, {
      eventDate: "2026-11-13",
      startTime: "15:00",
    });
    await seedVerifiedOpenHours(tenant.organizationId, tenant.locationId!, "2026-11-13");
    await savePendingEmployeeBooking(tenant.ctx, db, inquiry.inquiryId);

    const confirmed = await confirmInquiryBooking(tenant.ctx, db, inquiry.inquiryId);
    expect(confirmed.created).toBe(true);
    expect(confirmed.booking.status).toBe(BOOKING_STATUSES.CONFIRMED);
  });

  it("confirms after expired or released HOLDs without orphan occupancy", async () => {
    const tenant = await provisionTenant("hold-lifecycle");
    const { type } = await seedLane(tenant.organizationId, tenant.locationId);
    const inquiry = await createJourneyInquiry(tenant, type, {
      eventDate: "2026-11-14",
      startTime: "14:00",
    });
    await seedVerifiedOpenHours(tenant.organizationId, tenant.locationId!, "2026-11-14");

    await placeInquiryPlanHold(tenant.ctx, db, inquiry.inquiryId);
    await expireInquiryHoldsNow(db, {
      organizationId: tenant.organizationId,
      inquiryId: inquiry.inquiryId,
      now: new Date(Date.now() + 25 * 60 * 60 * 1000),
    });
    const afterExpire = await getHoldReadiness(tenant.ctx, db, inquiry.inquiryId);
    expect(afterExpire.state).not.toBe(HOLD_READINESS_STATES.ALREADY_HELD);

    const confirmedAfterExpire = await confirmInquiryBooking(tenant.ctx, db, inquiry.inquiryId);
    expect(confirmedAfterExpire.created).toBe(true);

    const tenant2 = await provisionTenant("hold-release");
    const seeded2 = await seedLane(tenant2.organizationId, tenant2.locationId);
    const inquiry2 = await createJourneyInquiry(tenant2, seeded2.type, {
      eventDate: "2026-11-15",
      startTime: "14:00",
    });
    await seedVerifiedOpenHours(tenant2.organizationId, tenant2.locationId!, "2026-11-15");
    await placeInquiryPlanHold(tenant2.ctx, db, inquiry2.inquiryId);
    await releaseInquiryHolds(tenant2.ctx, db, inquiry2.inquiryId);
    const confirmedAfterRelease = await confirmInquiryBooking(tenant2.ctx, db, inquiry2.inquiryId);
    expect(confirmedAfterRelease.created).toBe(true);
    const orphanHolds = await db.resourceReservation.count({
      where: {
        inquiryId: inquiry2.inquiryId,
        status: RESOURCE_RESERVATION_STATUSES.HOLD,
        releasedAt: null,
      },
    });
    expect(orphanHolds).toBe(0);
  });

  it("rejects resource conflicts and keeps PLACE_HOLD exceptions purpose-specific", async () => {
    const tenant = await provisionTenant("conflict");
    const { type, resource } = await seedLane(tenant.organizationId, tenant.locationId);
    const inquiry = await createJourneyInquiry(tenant, type, {
      eventDate: "2026-11-16",
      startTime: "14:00",
    });
    // Unconfigured hours — authorize PLACE_HOLD, then block resource.
    const placeHoldEx = await authorizeOperatingHoursException(tenant.ctx, db, {
      organizationId: tenant.organizationId,
      locationId: tenant.locationId!,
      slotDate: "2026-11-16",
      startMinute: 14 * 60,
      endMinute: 16 * 60,
      purpose: OPERATING_HOURS_EXCEPTION_PURPOSES.PLACE_HOLD,
      overriddenStatus: OPERATING_HOURS_EVALUATION_STATUSES.HOURS_UNCONFIGURED,
      reason: "HOLD exception for conflict path",
      inquiryId: inquiry.inquiryId,
    });
    await db.resourceReservation.create({
      data: {
        organizationId: tenant.organizationId,
        locationId: tenant.locationId,
        resourceId: resource.id,
        status: RESOURCE_RESERVATION_STATUSES.BOOKED,
        sourceType: "MANUAL",
        slotDate: new Date("2026-11-16T00:00:00.000Z"),
        startMinute: 14 * 60,
        endMinute: 16 * 60,
        startsAt: new Date("2026-11-16T19:00:00.000Z"),
        endsAt: new Date("2026-11-16T21:00:00.000Z"),
      },
    });
    await expect(
      placeInquiryPlanHold(tenant.ctx, db, inquiry.inquiryId, placeHoldEx.id),
    ).rejects.toBeInstanceOf(ResourceError);
    const stillOpen = await db.operatingHoursStaffException.findFirstOrThrow({
      where: { id: placeHoldEx.id },
    });
    expect(stillOpen.consumedAt).toBeNull();

    await expect(
      confirmInquiryBooking(tenant.ctx, db, inquiry.inquiryId, null, placeHoldEx.id),
    ).rejects.toMatchObject({ code: "HOURS_EXCEPTION_INVALID" });
  });

  it("invalidates a stale CONFIRM_BOOKING exception after plan time change", async () => {
    const tenant = await provisionTenant("stale-ex");
    const { type } = await seedLane(tenant.organizationId, tenant.locationId);
    const inquiry = await createJourneyInquiry(tenant, type, {
      eventDate: "2026-11-17",
      startTime: "14:00",
    });
    const exception = await authorizeOperatingHoursException(tenant.ctx, db, {
      organizationId: tenant.organizationId,
      locationId: tenant.locationId!,
      slotDate: "2026-11-17",
      startMinute: 14 * 60,
      endMinute: 16 * 60,
      purpose: OPERATING_HOURS_EXCEPTION_PURPOSES.CONFIRM_BOOKING,
      overriddenStatus: OPERATING_HOURS_EVALUATION_STATUSES.HOURS_UNCONFIGURED,
      reason: "Will become stale after plan edit",
      inquiryId: inquiry.inquiryId,
    });

    const working = await db.eventPlanRecommendation.findFirstOrThrow({
      where: {
        inquiryId: inquiry.inquiryId,
        organizationId: tenant.organizationId,
        kind: EVENT_PLAN_KINDS.AGENT_WORKING,
      },
    });
    const payload = working.payload as EventPlanPayload;
    await db.eventPlanRecommendation.update({
      where: { id: working.id },
      data: {
        payload: {
          ...payload,
          startTime: "16:00",
          itinerary: [
            {
              startTime: "16:00",
              endTime: "18:00",
              label: type.name,
              productId: type.id,
              startOffsetMinutes: 0,
              durationMinutes: 120,
            },
          ],
          schedule: ["16:00 Lane"],
        },
      },
    });

    await expect(
      confirmInquiryBooking(tenant.ctx, db, inquiry.inquiryId, null, exception.id),
    ).rejects.toMatchObject({ code: "HOURS_EXCEPTION_INVALID" });
  });

  it("denies cross-tenant confirmation and hold placement", async () => {
    const tenantA = await provisionTenant("tenant-a");
    const tenantB = await provisionTenant("tenant-b");
    const { type } = await seedLane(tenantA.organizationId, tenantA.locationId);
    const inquiry = await createJourneyInquiry(tenantA, type);

    await expect(confirmInquiryBooking(tenantB.ctx, db, inquiry.inquiryId)).rejects.toBeInstanceOf(
      InquiryError,
    );
    await expect(placeInquiryPlanHold(tenantB.ctx, db, inquiry.inquiryId)).rejects.toBeInstanceOf(
      ResourceError,
    );
    await expect(getHoldReadiness(tenantB.ctx, db, inquiry.inquiryId)).rejects.toBeInstanceOf(
      InquiryError,
    );
  });

  it("releases mismatched HOLDs when confirming with a revised plan window", async () => {
    const tenant = await provisionTenant("mismatch-hold");
    const { type } = await seedLane(tenant.organizationId, tenant.locationId);
    const inquiry = await createJourneyInquiry(tenant, type, {
      eventDate: "2026-11-18",
      startTime: "14:00",
    });
    await seedVerifiedOpenHours(tenant.organizationId, tenant.locationId!, "2026-11-18");
    await placeInquiryPlanHold(tenant.ctx, db, inquiry.inquiryId);

    const working = await db.eventPlanRecommendation.findFirstOrThrow({
      where: {
        inquiryId: inquiry.inquiryId,
        organizationId: tenant.organizationId,
        kind: EVENT_PLAN_KINDS.AGENT_WORKING,
      },
    });
    const payload = working.payload as EventPlanPayload;
    await db.eventPlanRecommendation.update({
      where: { id: working.id },
      data: {
        payload: {
          ...payload,
          startTime: "16:00",
          itinerary: [
            {
              startTime: "16:00",
              endTime: "18:00",
              label: type.name,
              productId: type.id,
              startOffsetMinutes: 0,
              durationMinutes: 120,
            },
          ],
          schedule: ["16:00 Lane"],
          resourceRequirements: (payload.resourceRequirements ?? []).map((row) => ({
            ...row,
            windowStartTime: "16:00",
            windowEndTime: "18:00",
          })),
        },
      },
    });

    const confirmed = await confirmInquiryBooking(tenant.ctx, db, inquiry.inquiryId);
    expect(confirmed.created).toBe(true);

    const activeHolds = await db.resourceReservation.findMany({
      where: {
        inquiryId: inquiry.inquiryId,
        status: RESOURCE_RESERVATION_STATUSES.HOLD,
        releasedAt: null,
      },
    });
    expect(activeHolds).toHaveLength(0);

    const booked = await db.resourceReservation.findMany({
      where: {
        bookingId: confirmed.booking.id,
        status: RESOURCE_RESERVATION_STATUSES.BOOKED,
        releasedAt: null,
      },
    });
    expect(booked.length).toBeGreaterThan(0);
    expect(booked.every((row) => row.startMinute === 16 * 60)).toBe(true);
  });
});
