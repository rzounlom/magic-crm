import { afterAll, afterEach, describe, expect, it } from "vitest";

import { createMemoryRateLimiter } from "@/lib/ai/rate-limiter";
import { resolveStrictOccupancyInstants } from "@/lib/inquiries/strict-local-time";
import { SYSTEM_GROUP_KEYS } from "@/server/authorization/default-security-groups";
import { AuthorizationError, BookingError, ResourceError } from "@/server/errors";
import {
  authorizeOperatingHoursException,
  revokeOperatingHoursException,
} from "@/server/resources/hours-exception";
import { resolveRequestContext } from "@/server/request-context";
import { confirmInquiryBooking } from "@/server/services/booking-service";
import { bookPublicEventPlan } from "@/server/services/event-plan-service";
import { createPublicInquiry } from "@/server/services/inquiry-service";
import { startWorkingInquiry } from "@/server/services/live-agent-service";
import { confirmPendingBooking } from "@/server/services/pending-booking-service";
import { provisionOrganization } from "@/server/services/provision-organization";
import { placeManualHold } from "@/server/services/resource-hold-service";
import {
  OPERATING_HOURS_EVALUATION_STATUSES,
  OPERATING_HOURS_EXCEPTION_KINDS,
  OPERATING_HOURS_EXCEPTION_PURPOSES,
  OPERATING_HOURS_VERIFICATION_STATUSES,
  LOCAL_TIME_RESOLUTION_STATUSES,
} from "@/types/operating-hours";
import { BOOKING_STATUSES } from "@/types/booking";
import { EVENT_PLAN_KINDS } from "@/types/inquiry";
import {
  RESOURCE_QUANTITY_RULES,
  RESOURCE_RESERVATION_STATUSES,
  type PlanResourceRequirement,
} from "@/types/resource-schedule";
import { deleteTestOrganizations } from "../helpers/cleanup-test-organizations";
import { createTestPrismaClient } from "../helpers/test-database";
import { futureEventDate } from "../helpers/future-event-date";

const EVENT_DATE = futureEventDate(28);
const EVENT_DATE_PLUS_7 = futureEventDate(28 + 7);
const EVENT_DATE_PLUS_8 = futureEventDate(28 + 8);
const EVENT_DATE_PLUS_9 = futureEventDate(28 + 9);
const EVENT_DATE_PLUS_10 = futureEventDate(28 + 10);
const EVENT_DATE_PLUS_11 = futureEventDate(28 + 11);
const EVENT_DATE_PLUS_12 = futureEventDate(28 + 12);

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

async function provisionTenant(suffix: string, timezone = "America/Indiana/Indianapolis") {
  const result = await provisionOrganization(
    {
      clerkUserId: `user_r2d4_${suffix}_${crypto.randomUUID()}`,
      clerkOrganizationId: `clerk_org_r2d4_${suffix}_${crypto.randomUUID()}`,
      organizationName: `R2D4 ${suffix}`,
      organizationSlug: `r2d4-${suffix}-${crypto.randomUUID()}`,
      isClerkOrganizationAdmin: true,
    },
    db,
  );
  createdOrganizationIds.push(result.organizationId);
  await db.organization.update({
    where: { id: result.organizationId },
    data: { timezone },
  });
  const organization = await db.organization.findFirstOrThrow({
    where: { id: result.organizationId },
    include: { locations: true },
  });
  const location = organization.locations[0];
  if (location) {
    await db.location.update({
      where: { id: location.id },
      data: { timezone },
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
    timeZone: timezone,
  };
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

async function seedLane(
  organizationId: string,
  locationId: string | null,
  count = 1,
) {
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
  const resources = [];
  for (let i = 1; i <= count; i += 1) {
    resources.push(
      await db.resource.create({
        data: {
          organizationId,
          resourceTypeId: type.id,
          locationId,
          name: count === 1 ? "Lane 1" : `Lane ${i}`,
          displayOrder: i,
          active: true,
        },
      }),
    );
  }
  return { type, resources };
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

async function createConfirmableInquiry(
  tenant: Awaited<ReturnType<typeof provisionTenant>>,
  type: { id: string; slug: string; name: string },
  input: {
    eventDate: string;
    startTime: string;
    durationMinutes?: number;
  },
) {
  const durationMinutes = input.durationMinutes ?? 120;
  const email = `r2d4.${crypto.randomUUID()}@example.com`;
  const created = await createPublicInquiry(
    db,
    {
      organizationSlug: tenant.organization.slug,
      rateLimitKey: `${tenant.organization.slug}:${email}`,
      firstName: "Ada",
      lastName: "Lovelace",
      email,
      eventType: "Birthday Party",
      preferredDate: input.eventDate,
      startTime: input.startTime,
      guestCount: 8,
      guestMix: "mixed_ages",
      desiredDurationMinutes: durationMinutes,
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
  const endMinute =
    Number(input.startTime.slice(0, 2)) * 60 +
    Number(input.startTime.slice(3, 5)) +
    durationMinutes;
  const endHour = Math.floor(endMinute / 60);
  const endMin = endMinute % 60;
  const endTime = `${String(endHour).padStart(2, "0")}:${String(endMin).padStart(2, "0")}`;
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
      durationMinutes,
      customerFacingReason: "Test",
      availabilityValidated: true,
      availabilityStatus: "AVAILABLE",
      payload: {
        guestCount: 8,
        eventDate: input.eventDate,
        startTime: input.startTime,
        durationMinutes,
        activities: [{ knowledgeItemId: type.id, name: type.name, quantity: 1, priceCents: 20_000 }],
        dining: { label: "None", priceCents: 0 },
        spaces: [],
        schedule: [`${input.startTime}–${endTime} ${type.name}`],
        itinerary: [
          {
            startTime: input.startTime,
            endTime,
            label: type.name,
            productId: type.id,
            startOffsetMinutes: 0,
            durationMinutes,
          },
        ],
        pricingComplete: true,
        resourceRequirements: [requirement(type)],
      },
    },
  });
  // bookPublicEventPlan selects the plan and creates the pending booking once.
  await bookPublicEventPlan(
    db,
    { token: created.publicToken, planId: plan.id, rateLimitKey: created.publicToken },
    unlimitedLimiter,
  );
  await startWorkingInquiry(tenant.ctx, db, created.inquiryId);
  return {
    ...created,
    plan,
    startMinute: Number(input.startTime.slice(0, 2)) * 60 + Number(input.startTime.slice(3, 5)),
    endMinute,
    durationMinutes,
  };
}

async function seedVerifiedClosedDay(
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
      approvedByNote: "R2D4 synthetic",
    },
  });
  // Civil YYYY-MM-DD day-of-week (UTC calendar arithmetic matches MagicCRM civil helper).
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
  await db.locationOperatingHoursException.create({
    data: {
      organizationId,
      locationId,
      policyId: policy.id,
      localDate: new Date(`${localDate}T00:00:00.000Z`),
      kind: OPERATING_HOURS_EXCEPTION_KINDS.CLOSED,
    },
  });
}

describe("R2D.4 booking transaction safety (TEST)", { timeout: 180_000 }, () => {
  it("consumes a staff exception atomically with successful confirmation", async () => {
    const tenant = await provisionTenant("e2e");
    const { type } = await seedLane(tenant.organizationId, tenant.locationId, 1);
    const inquiry = await createConfirmableInquiry(tenant, type, {
      eventDate: EVENT_DATE_PLUS_7,
      startTime: "14:00",
    });

    await expect(
      confirmInquiryBooking(tenant.ctx, db, inquiry.inquiryId),
    ).rejects.toMatchObject({ code: "OPERATING_HOURS_UNRESOLVED" });

    const exception = await authorizeOperatingHoursException(tenant.ctx, db, {
      organizationId: tenant.organizationId,
      locationId: tenant.locationId!,
      slotDate: EVENT_DATE_PLUS_7,
      startMinute: inquiry.startMinute,
      endMinute: inquiry.endMinute,
      purpose: OPERATING_HOURS_EXCEPTION_PURPOSES.CONFIRM_BOOKING,
      overriddenStatus: OPERATING_HOURS_EVALUATION_STATUSES.HOURS_UNCONFIGURED,
      reason: "Owner-approved after-hours birthday confirmation",
      inquiryId: inquiry.inquiryId,
    });

    const confirmed = await confirmInquiryBooking(
      tenant.ctx,
      db,
      inquiry.inquiryId,
      null,
      exception.id,
    );
    expect(confirmed.created).toBe(true);
    expect(confirmed.booking.status).toBe(BOOKING_STATUSES.CONFIRMED);

    const consumed = await db.operatingHoursStaffException.findFirstOrThrow({
      where: { id: exception.id },
    });
    expect(consumed.consumedAt).not.toBeNull();

    await expect(
      confirmInquiryBooking(tenant.ctx, db, inquiry.inquiryId, null, exception.id),
    ).resolves.toMatchObject({ created: false });

    const audits = await db.auditLog.findMany({
      where: {
        organizationId: tenant.organizationId,
        action: {
          in: [
            "scheduling.hours_exception_authorized",
            "scheduling.hours_exception_consumed",
            "booking.confirmed",
          ],
        },
      },
    });
    expect(audits.some((row) => row.action === "scheduling.hours_exception_authorized")).toBe(true);
    expect(audits.some((row) => row.action === "scheduling.hours_exception_consumed")).toBe(true);
    expect(audits.some((row) => row.action === "booking.confirmed")).toBe(true);
  });

  it("rolls back exception consumption when reservation insert fails", async () => {
    const tenant = await provisionTenant("rollback");
    const { type, resources } = await seedLane(tenant.organizationId, tenant.locationId, 1);
    const inquiry = await createConfirmableInquiry(tenant, type, {
      eventDate: EVENT_DATE_PLUS_7,
      startTime: "15:00",
    });
    const instants = resolveStrictOccupancyInstants({
      slotDate: EVENT_DATE_PLUS_7,
      startMinute: inquiry.startMinute,
      endMinute: inquiry.endMinute,
      timeZone: tenant.timeZone,
    });
    expect(instants.status).toBe(LOCAL_TIME_RESOLUTION_STATUSES.VALID);
    if (instants.status !== LOCAL_TIME_RESOLUTION_STATUSES.VALID) {
      return;
    }
    await db.resourceReservation.create({
      data: {
        organizationId: tenant.organizationId,
        locationId: tenant.locationId,
        resourceId: resources[0]!.id,
        status: RESOURCE_RESERVATION_STATUSES.BOOKED,
        sourceType: "MANUAL",
        slotDate: new Date(`${EVENT_DATE_PLUS_7}T00:00:00.000Z`),
        startMinute: inquiry.startMinute,
        endMinute: inquiry.endMinute,
        startsAt: instants.startsAt,
        endsAt: instants.endsAt,
      },
    });

    const exception = await authorizeOperatingHoursException(tenant.ctx, db, {
      organizationId: tenant.organizationId,
      locationId: tenant.locationId!,
      slotDate: EVENT_DATE_PLUS_7,
      startMinute: inquiry.startMinute,
      endMinute: inquiry.endMinute,
      purpose: OPERATING_HOURS_EXCEPTION_PURPOSES.CONFIRM_BOOKING,
      overriddenStatus: OPERATING_HOURS_EVALUATION_STATUSES.HOURS_UNCONFIGURED,
      reason: "Must not burn on conflict path",
      inquiryId: inquiry.inquiryId,
    });

    await expect(
      confirmInquiryBooking(tenant.ctx, db, inquiry.inquiryId, null, exception.id),
    ).rejects.toBeInstanceOf(BookingError);

    const stillOpen = await db.operatingHoursStaffException.findFirstOrThrow({
      where: { id: exception.id },
    });
    expect(stillOpen.consumedAt).toBeNull();
    const booking = await db.booking.findFirst({
      where: { inquiryId: inquiry.inquiryId },
    });
    expect(booking?.status).not.toBe(BOOKING_STATUSES.CONFIRMED);
  });

  it("allows only one concurrent consumer of the same exception", async () => {
    const tenant = await provisionTenant("race-ex");
    const { type } = await seedLane(tenant.organizationId, tenant.locationId, 2);
    const a = await createConfirmableInquiry(tenant, type, {
      eventDate: EVENT_DATE_PLUS_8,
      startTime: "14:00",
    });
    const b = await createConfirmableInquiry(tenant, type, {
      eventDate: EVENT_DATE_PLUS_8,
      startTime: "14:00",
    });
    const exception = await authorizeOperatingHoursException(tenant.ctx, db, {
      organizationId: tenant.organizationId,
      locationId: tenant.locationId!,
      slotDate: EVENT_DATE_PLUS_8,
      startMinute: a.startMinute,
      endMinute: a.endMinute,
      purpose: OPERATING_HOURS_EXCEPTION_PURPOSES.CONFIRM_BOOKING,
      overriddenStatus: OPERATING_HOURS_EVALUATION_STATUSES.HOURS_UNCONFIGURED,
      reason: "Shared fingerprint concurrency probe",
    });

    // Separate clients: Neon pooler cannot run two interactive transactions on one connection.
    const dbA = createTestPrismaClient();
    const dbB = createTestPrismaClient();
    try {
      const results = await Promise.allSettled([
        confirmPendingBooking(dbA, {
          organizationId: tenant.organizationId,
          inquiryId: a.inquiryId,
          actorUserProfileId: tenant.userProfileId,
          attestExternalPayment: true,
          hoursExceptionId: exception.id,
        }),
        confirmPendingBooking(dbB, {
          organizationId: tenant.organizationId,
          inquiryId: b.inquiryId,
          actorUserProfileId: tenant.userProfileId,
          attestExternalPayment: true,
          hoursExceptionId: exception.id,
        }),
      ]);

      const confirmed = results.filter(
        (row) =>
          row.status === "fulfilled" &&
          (row.value.created || row.value.booking.status === BOOKING_STATUSES.CONFIRMED),
      );
      const rejected = results.filter((row) => row.status === "rejected");
      expect(confirmed.length).toBe(1);
      expect(rejected.length).toBe(1);

      const consumed = await db.operatingHoursStaffException.findFirstOrThrow({
        where: { id: exception.id },
      });
      expect(consumed.consumedAt).not.toBeNull();
      const confirmedCount = await db.booking.count({
        where: {
          organizationId: tenant.organizationId,
          status: BOOKING_STATUSES.CONFIRMED,
          inquiryId: { in: [a.inquiryId, b.inquiryId] },
        },
      });
      expect(confirmedCount).toBe(1);
    } finally {
      await dbA.$disconnect();
      await dbB.$disconnect();
    }
  });

  it("rejects revoked, expired, purpose-mismatched, and cross-tenant exceptions", async () => {
    const tenant = await provisionTenant("authz");
    const other = await provisionTenant("other");
    const desk = await addGroupUser(tenant, SYSTEM_GROUP_KEYS.FRONT_DESK, "desk-r2d4@example.com");
    const { type } = await seedLane(tenant.organizationId, tenant.locationId, 1);
    const inquiry = await createConfirmableInquiry(tenant, type, {
      eventDate: EVENT_DATE_PLUS_9,
      startTime: "16:00",
    });

    await expect(
      authorizeOperatingHoursException(desk.ctx, db, {
        organizationId: tenant.organizationId,
        locationId: tenant.locationId!,
        slotDate: EVENT_DATE_PLUS_9,
        startMinute: inquiry.startMinute,
        endMinute: inquiry.endMinute,
        purpose: OPERATING_HOURS_EXCEPTION_PURPOSES.CONFIRM_BOOKING,
        overriddenStatus: OPERATING_HOURS_EVALUATION_STATUSES.HOURS_UNCONFIGURED,
        reason: "Front desk must not authorize",
      }),
    ).rejects.toBeInstanceOf(AuthorizationError);

    await expect(
      authorizeOperatingHoursException(other.ctx, db, {
        organizationId: tenant.organizationId,
        locationId: tenant.locationId!,
        slotDate: EVENT_DATE_PLUS_9,
        startMinute: inquiry.startMinute,
        endMinute: inquiry.endMinute,
        purpose: OPERATING_HOURS_EXCEPTION_PURPOSES.CONFIRM_BOOKING,
        overriddenStatus: OPERATING_HOURS_EVALUATION_STATUSES.HOURS_UNCONFIGURED,
        reason: "Cross-org forged location must fail",
      }),
    ).rejects.toBeInstanceOf(BookingError);

    const holdPurpose = await authorizeOperatingHoursException(tenant.ctx, db, {
      organizationId: tenant.organizationId,
      locationId: tenant.locationId!,
      slotDate: EVENT_DATE_PLUS_9,
      startMinute: inquiry.startMinute,
      endMinute: inquiry.endMinute,
      purpose: OPERATING_HOURS_EXCEPTION_PURPOSES.PLACE_HOLD,
      overriddenStatus: OPERATING_HOURS_EVALUATION_STATUSES.HOURS_UNCONFIGURED,
      reason: "HOLD purpose cannot confirm booking",
      inquiryId: inquiry.inquiryId,
    });
    await expect(
      confirmInquiryBooking(tenant.ctx, db, inquiry.inquiryId, null, holdPurpose.id),
    ).rejects.toMatchObject({ code: "HOURS_EXCEPTION_INVALID" });

    const revoked = await authorizeOperatingHoursException(tenant.ctx, db, {
      organizationId: tenant.organizationId,
      locationId: tenant.locationId!,
      slotDate: EVENT_DATE_PLUS_9,
      startMinute: inquiry.startMinute,
      endMinute: inquiry.endMinute,
      purpose: OPERATING_HOURS_EXCEPTION_PURPOSES.CONFIRM_BOOKING,
      overriddenStatus: OPERATING_HOURS_EVALUATION_STATUSES.HOURS_UNCONFIGURED,
      reason: "Will be revoked before use",
      inquiryId: inquiry.inquiryId,
    });
    await revokeOperatingHoursException(tenant.ctx, db, revoked.id);
    await expect(
      confirmInquiryBooking(tenant.ctx, db, inquiry.inquiryId, null, revoked.id),
    ).rejects.toMatchObject({ code: "HOURS_EXCEPTION_INVALID" });

    const expired = await authorizeOperatingHoursException(tenant.ctx, db, {
      organizationId: tenant.organizationId,
      locationId: tenant.locationId!,
      slotDate: EVENT_DATE_PLUS_9,
      startMinute: inquiry.startMinute,
      endMinute: inquiry.endMinute,
      purpose: OPERATING_HOURS_EXCEPTION_PURPOSES.CONFIRM_BOOKING,
      overriddenStatus: OPERATING_HOURS_EVALUATION_STATUSES.HOURS_UNCONFIGURED,
      reason: "Short TTL expiry path",
      inquiryId: inquiry.inquiryId,
      ttlMs: 1,
    });
    await new Promise((resolve) => setTimeout(resolve, 5));
    await expect(
      confirmInquiryBooking(tenant.ctx, db, inquiry.inquiryId, null, expired.id),
    ).rejects.toMatchObject({ code: "HOURS_EXCEPTION_INVALID" });

    const wrongTime = await authorizeOperatingHoursException(tenant.ctx, db, {
      organizationId: tenant.organizationId,
      locationId: tenant.locationId!,
      slotDate: EVENT_DATE_PLUS_9,
      startMinute: inquiry.startMinute + 30,
      endMinute: inquiry.endMinute + 30,
      purpose: OPERATING_HOURS_EXCEPTION_PURPOSES.CONFIRM_BOOKING,
      overriddenStatus: OPERATING_HOURS_EVALUATION_STATUSES.HOURS_UNCONFIGURED,
      reason: "Fingerprint time mismatch",
      inquiryId: inquiry.inquiryId,
    });
    await expect(
      confirmInquiryBooking(tenant.ctx, db, inquiry.inquiryId, null, wrongTime.id),
    ).rejects.toMatchObject({ code: "HOURS_EXCEPTION_INVALID" });

    // Forged client-supplied staff identity is not trusted — permission lookup fails closed.
    await expect(
      authorizeOperatingHoursException(
        {
          userId: "forged-user",
          clerkUserId: "forged",
          organizationId: tenant.organizationId,
          clerkOrganizationId: tenant.organization.clerkOrganizationId ?? "clerk_forged",
        },
        db,
        {
          organizationId: tenant.organizationId,
          locationId: tenant.locationId!,
          slotDate: EVENT_DATE_PLUS_9,
          startMinute: inquiry.startMinute,
          endMinute: inquiry.endMinute,
          purpose: OPERATING_HOURS_EXCEPTION_PURPOSES.CONFIRM_BOOKING,
          overriddenStatus: OPERATING_HOURS_EVALUATION_STATUSES.HOURS_UNCONFIGURED,
          reason: "Forged staff identity must fail permission lookup",
        },
      ),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("authorizes CLOSED-day confirmation with a matching exception and not without", async () => {
    const tenant = await provisionTenant("closed");
    const { type } = await seedLane(tenant.organizationId, tenant.locationId, 1);
    // Pending may be created while hours are unconfigured; close the day before confirm.
    const inquiry = await createConfirmableInquiry(tenant, type, {
      eventDate: EVENT_DATE,
      startTime: "14:00",
    });
    await seedVerifiedClosedDay(tenant.organizationId, tenant.locationId!, EVENT_DATE);

    await expect(
      confirmInquiryBooking(tenant.ctx, db, inquiry.inquiryId),
    ).rejects.toMatchObject({ code: "OUTSIDE_OPERATING_HOURS" });

    const exception = await authorizeOperatingHoursException(tenant.ctx, db, {
      organizationId: tenant.organizationId,
      locationId: tenant.locationId!,
      slotDate: EVENT_DATE,
      startMinute: inquiry.startMinute,
      endMinute: inquiry.endMinute,
      purpose: OPERATING_HOURS_EXCEPTION_PURPOSES.CONFIRM_BOOKING,
      overriddenStatus: OPERATING_HOURS_EVALUATION_STATUSES.OUTSIDE_HOURS,
      reason: "Approved private buyout on closed Thursday",
      inquiryId: inquiry.inquiryId,
    });
    const confirmed = await confirmInquiryBooking(
      tenant.ctx,
      db,
      inquiry.inquiryId,
      null,
      exception.id,
    );
    expect(confirmed.created).toBe(true);
  });

  it("enforces DB exclusion across midnight and does not depend on session TimeZone", async () => {
    const indiana = await provisionTenant("tz-in", "America/Indiana/Indianapolis");
    const pacific = await provisionTenant("tz-la", "America/Los_Angeles");
    const { resources: indianaResources } = await seedLane(indiana.organizationId, indiana.locationId, 1);
    const { resources: pacificResources } = await seedLane(pacific.organizationId, pacific.locationId, 1);

    const overnight = resolveStrictOccupancyInstants({
      slotDate: EVENT_DATE_PLUS_10,
      startMinute: 23 * 60,
      endMinute: 25 * 60,
      timeZone: "America/Indiana/Indianapolis",
    });
    const morning = resolveStrictOccupancyInstants({
      slotDate: EVENT_DATE_PLUS_11,
      startMinute: 30,
      endMinute: 90,
      timeZone: "America/Indiana/Indianapolis",
    });
    const backToBack = resolveStrictOccupancyInstants({
      slotDate: EVENT_DATE_PLUS_11,
      startMinute: 60,
      endMinute: 120,
      timeZone: "America/Indiana/Indianapolis",
    });
    expect(overnight.status).toBe(LOCAL_TIME_RESOLUTION_STATUSES.VALID);
    expect(morning.status).toBe(LOCAL_TIME_RESOLUTION_STATUSES.VALID);
    expect(backToBack.status).toBe(LOCAL_TIME_RESOLUTION_STATUSES.VALID);
    if (
      overnight.status !== LOCAL_TIME_RESOLUTION_STATUSES.VALID ||
      morning.status !== LOCAL_TIME_RESOLUTION_STATUSES.VALID ||
      backToBack.status !== LOCAL_TIME_RESOLUTION_STATUSES.VALID
    ) {
      return;
    }

    await db.$executeRawUnsafe(`SET TIME ZONE 'America/Los_Angeles'`);
    try {
      await db.resourceReservation.create({
        data: {
          organizationId: indiana.organizationId,
          locationId: indiana.locationId,
          resourceId: indianaResources[0]!.id,
          status: RESOURCE_RESERVATION_STATUSES.BOOKED,
          sourceType: "MANUAL",
          slotDate: new Date(`${EVENT_DATE_PLUS_10}T00:00:00.000Z`),
          startMinute: 23 * 60,
          endMinute: 25 * 60,
          startsAt: overnight.startsAt,
          endsAt: overnight.endsAt,
        },
      });
      await expect(
        db.resourceReservation.create({
          data: {
            organizationId: indiana.organizationId,
            locationId: indiana.locationId,
            resourceId: indianaResources[0]!.id,
            status: RESOURCE_RESERVATION_STATUSES.BOOKED,
            sourceType: "MANUAL",
            slotDate: new Date(`${EVENT_DATE_PLUS_11}T00:00:00.000Z`),
            startMinute: 30,
            endMinute: 90,
            startsAt: morning.startsAt,
            endsAt: morning.endsAt,
          },
        }),
      ).rejects.toThrow();

      await db.resourceReservation.create({
        data: {
          organizationId: indiana.organizationId,
          locationId: indiana.locationId,
          resourceId: indianaResources[0]!.id,
          status: RESOURCE_RESERVATION_STATUSES.BOOKED,
          sourceType: "MANUAL",
          slotDate: new Date(`${EVENT_DATE_PLUS_11}T00:00:00.000Z`),
          startMinute: 60,
          endMinute: 120,
          startsAt: backToBack.startsAt,
          endsAt: backToBack.endsAt,
        },
      });

      // Different organization + resource: no cross-tenant exclusion collision.
      const pacificWindow = resolveStrictOccupancyInstants({
        slotDate: EVENT_DATE_PLUS_10,
        startMinute: 23 * 60,
        endMinute: 25 * 60,
        timeZone: "America/Los_Angeles",
      });
      expect(pacificWindow.status).toBe(LOCAL_TIME_RESOLUTION_STATUSES.VALID);
      if (pacificWindow.status === LOCAL_TIME_RESOLUTION_STATUSES.VALID) {
        await db.resourceReservation.create({
          data: {
            organizationId: pacific.organizationId,
            locationId: pacific.locationId,
            resourceId: pacificResources[0]!.id,
            status: RESOURCE_RESERVATION_STATUSES.BOOKED,
            sourceType: "MANUAL",
            slotDate: new Date(`${EVENT_DATE_PLUS_10}T00:00:00.000Z`),
            startMinute: 23 * 60,
            endMinute: 25 * 60,
            startsAt: pacificWindow.startsAt,
            endsAt: pacificWindow.endsAt,
          },
        });
      }

      const typeRow = await db.$queryRawUnsafe<Array<{ data_type: string }>>(
        `SELECT data_type FROM information_schema.columns
         WHERE table_name = 'resource_reservations' AND column_name = 'startsAt'`,
      );
      expect(typeRow[0]?.data_type).toBe("timestamp without time zone");

      const cancelled = await db.resourceReservation.create({
        data: {
          organizationId: indiana.organizationId,
          locationId: indiana.locationId,
          resourceId: indianaResources[0]!.id,
          status: RESOURCE_RESERVATION_STATUSES.BOOKED,
          sourceType: "MANUAL",
          slotDate: new Date(`${EVENT_DATE_PLUS_12}T00:00:00.000Z`),
          startMinute: 10 * 60,
          endMinute: 11 * 60,
          startsAt: new Date(`${EVENT_DATE_PLUS_12}T14:00:00.000Z`),
          endsAt: new Date(`${EVENT_DATE_PLUS_12}T15:00:00.000Z`),
          releasedAt: new Date(),
        },
      });
      await db.resourceReservation.create({
        data: {
          organizationId: indiana.organizationId,
          locationId: indiana.locationId,
          resourceId: indianaResources[0]!.id,
          status: RESOURCE_RESERVATION_STATUSES.BOOKED,
          sourceType: "MANUAL",
          slotDate: new Date(`${EVENT_DATE_PLUS_12}T00:00:00.000Z`),
          startMinute: 10 * 60,
          endMinute: 11 * 60,
          startsAt: new Date(`${EVENT_DATE_PLUS_12}T14:00:00.000Z`),
          endsAt: new Date(`${EVENT_DATE_PLUS_12}T15:00:00.000Z`),
        },
      });
      expect(cancelled.releasedAt).not.toBeNull();
    } finally {
      await db.$executeRawUnsafe(`SET TIME ZONE 'UTC'`);
    }
  });

  it("lets at most one of two concurrent overlapping overnight reservation inserts succeed", async () => {
    const tenant = await provisionTenant("race-ov");
    const { resources } = await seedLane(tenant.organizationId, tenant.locationId, 1);
    const overnight = resolveStrictOccupancyInstants({
      slotDate: EVENT_DATE_PLUS_10,
      startMinute: 23 * 60,
      endMinute: 25 * 60,
      timeZone: tenant.timeZone,
    });
    const overlap = resolveStrictOccupancyInstants({
      slotDate: EVENT_DATE_PLUS_10,
      startMinute: 23 * 60 + 30,
      endMinute: 25 * 60 + 30,
      timeZone: tenant.timeZone,
    });
    expect(overnight.status).toBe(LOCAL_TIME_RESOLUTION_STATUSES.VALID);
    expect(overlap.status).toBe(LOCAL_TIME_RESOLUTION_STATUSES.VALID);
    if (
      overnight.status !== LOCAL_TIME_RESOLUTION_STATUSES.VALID ||
      overlap.status !== LOCAL_TIME_RESOLUTION_STATUSES.VALID
    ) {
      return;
    }

    const dbA = createTestPrismaClient();
    const dbB = createTestPrismaClient();
    try {
      const results = await Promise.allSettled([
        dbA.resourceReservation.create({
          data: {
            organizationId: tenant.organizationId,
            locationId: tenant.locationId,
            resourceId: resources[0]!.id,
            status: RESOURCE_RESERVATION_STATUSES.BOOKED,
            sourceType: "MANUAL",
            slotDate: new Date(`${EVENT_DATE_PLUS_10}T00:00:00.000Z`),
            startMinute: 23 * 60,
            endMinute: 25 * 60,
            startsAt: overnight.startsAt,
            endsAt: overnight.endsAt,
          },
        }),
        dbB.resourceReservation.create({
          data: {
            organizationId: tenant.organizationId,
            locationId: tenant.locationId,
            resourceId: resources[0]!.id,
            status: RESOURCE_RESERVATION_STATUSES.BOOKED,
            sourceType: "MANUAL",
            slotDate: new Date(`${EVENT_DATE_PLUS_10}T00:00:00.000Z`),
            startMinute: 23 * 60 + 30,
            endMinute: 25 * 60 + 30,
            startsAt: overlap.startsAt,
            endsAt: overlap.endsAt,
          },
        }),
      ]);
      const succeeded = results.filter((row) => row.status === "fulfilled");
      const failed = results.filter((row) => row.status === "rejected");
      expect(succeeded).toHaveLength(1);
      expect(failed).toHaveLength(1);
      expect(await db.resourceReservation.count({
        where: {
          organizationId: tenant.organizationId,
          resourceId: resources[0]!.id,
          releasedAt: null,
          status: RESOURCE_RESERVATION_STATUSES.BOOKED,
        },
      })).toBe(1);
    } finally {
      await dbA.$disconnect();
      await dbB.$disconnect();
    }

    // Confirm path: second overnight-overlapping inquiry cannot confirm after the first.
    const { type } = await seedLane(tenant.organizationId, tenant.locationId, 1);
    const first = await createConfirmableInquiry(tenant, type, {
      eventDate: EVENT_DATE_PLUS_10,
      startTime: "23:00",
      durationMinutes: 120,
    });
    const second = await createConfirmableInquiry(tenant, type, {
      eventDate: EVENT_DATE_PLUS_10,
      startTime: "23:30",
      durationMinutes: 120,
    });
    const exFirst = await authorizeOperatingHoursException(tenant.ctx, db, {
      organizationId: tenant.organizationId,
      locationId: tenant.locationId!,
      slotDate: EVENT_DATE_PLUS_10,
      startMinute: first.startMinute,
      endMinute: first.endMinute,
      purpose: OPERATING_HOURS_EXCEPTION_PURPOSES.CONFIRM_BOOKING,
      overriddenStatus: OPERATING_HOURS_EVALUATION_STATUSES.HOURS_UNCONFIGURED,
      reason: "Overnight sequential winner",
      inquiryId: first.inquiryId,
    });
    const exSecond = await authorizeOperatingHoursException(tenant.ctx, db, {
      organizationId: tenant.organizationId,
      locationId: tenant.locationId!,
      slotDate: EVENT_DATE_PLUS_10,
      startMinute: second.startMinute,
      endMinute: second.endMinute,
      purpose: OPERATING_HOURS_EXCEPTION_PURPOSES.CONFIRM_BOOKING,
      overriddenStatus: OPERATING_HOURS_EVALUATION_STATUSES.HOURS_UNCONFIGURED,
      reason: "Overnight sequential loser",
      inquiryId: second.inquiryId,
    });
    const confirmed = await confirmPendingBooking(db, {
      organizationId: tenant.organizationId,
      inquiryId: first.inquiryId,
      actorUserProfileId: tenant.userProfileId,
      attestExternalPayment: true,
      hoursExceptionId: exFirst.id,
    });
    expect(confirmed.created).toBe(true);
    await expect(
      confirmPendingBooking(db, {
        organizationId: tenant.organizationId,
        inquiryId: second.inquiryId,
        actorUserProfileId: tenant.userProfileId,
        attestExternalPayment: true,
        hoursExceptionId: exSecond.id,
      }),
    ).rejects.toBeInstanceOf(BookingError);
    const loser = await db.operatingHoursStaffException.findFirstOrThrow({
      where: { id: exSecond.id },
    });
    expect(loser.consumedAt).toBeNull();
  });

  it("does not consume a PLACE_HOLD exception when the resource is unavailable", async () => {
    const tenant = await provisionTenant("hold-fail");
    const { resources } = await seedLane(tenant.organizationId, tenant.locationId, 1);
    const instants = resolveStrictOccupancyInstants({
      slotDate: EVENT_DATE_PLUS_7,
      startMinute: 14 * 60,
      endMinute: 16 * 60,
      timeZone: tenant.timeZone,
    });
    expect(instants.status).toBe(LOCAL_TIME_RESOLUTION_STATUSES.VALID);
    if (instants.status !== LOCAL_TIME_RESOLUTION_STATUSES.VALID) {
      return;
    }
    await db.resourceReservation.create({
      data: {
        organizationId: tenant.organizationId,
        locationId: tenant.locationId,
        resourceId: resources[0]!.id,
        status: RESOURCE_RESERVATION_STATUSES.BOOKED,
        sourceType: "MANUAL",
        slotDate: new Date(`${EVENT_DATE_PLUS_7}T00:00:00.000Z`),
        startMinute: 14 * 60,
        endMinute: 16 * 60,
        startsAt: instants.startsAt,
        endsAt: instants.endsAt,
      },
    });
    const exception = await authorizeOperatingHoursException(tenant.ctx, db, {
      organizationId: tenant.organizationId,
      locationId: tenant.locationId!,
      slotDate: EVENT_DATE_PLUS_7,
      startMinute: 14 * 60,
      endMinute: 16 * 60,
      purpose: OPERATING_HOURS_EXCEPTION_PURPOSES.PLACE_HOLD,
      overriddenStatus: OPERATING_HOURS_EVALUATION_STATUSES.HOURS_UNCONFIGURED,
      reason: "Manual hold conflict must not consume",
    });
    await expect(
      placeManualHold(tenant.ctx, db, {
        resourceId: resources[0]!.id,
        date: EVENT_DATE_PLUS_7,
        startTime: "14:00",
        endTime: "16:00",
        hoursExceptionId: exception.id,
      }),
    ).rejects.toBeInstanceOf(ResourceError);
    const stillOpen = await db.operatingHoursStaffException.findFirstOrThrow({
      where: { id: exception.id },
    });
    expect(stillOpen.consumedAt).toBeNull();
  });
});
