import { afterAll, afterEach, describe, expect, it } from "vitest";

import { createMemoryRateLimiter } from "@/lib/ai/rate-limiter";
import { SYSTEM_GROUP_KEYS } from "@/server/authorization/default-security-groups";
import { AuthorizationError, BookingError } from "@/server/errors";
import { resolveRequestContext } from "@/server/request-context";
import {
  authorizeOperatingHoursException,
  revokeOperatingHoursException,
} from "@/server/resources/hours-exception";
import { confirmInquiryBooking } from "@/server/services/booking-service";
import { getConfirmationReadiness } from "@/server/services/confirmation-readiness-service";
import { bookPublicEventPlan } from "@/server/services/event-plan-service";
import { createPublicInquiry } from "@/server/services/inquiry-service";
import { startWorkingInquiry } from "@/server/services/live-agent-service";
import { provisionOrganization } from "@/server/services/provision-organization";
import { CONFIRMATION_READINESS_STATES } from "@/types/confirmation-readiness";
import { EVENT_PLAN_KINDS } from "@/types/inquiry";
import {
  OPERATING_HOURS_EVALUATION_STATUSES,
  OPERATING_HOURS_EXCEPTION_PURPOSES,
} from "@/types/operating-hours";
import {
  RESOURCE_QUANTITY_RULES,
  type PlanResourceRequirement,
} from "@/types/resource-schedule";
import { BOOKING_STATUSES } from "@/types/booking";
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
      clerkUserId: `user_sbf1_${suffix}_${crypto.randomUUID()}`,
      clerkOrganizationId: `clerk_org_sbf1_${suffix}_${crypto.randomUUID()}`,
      organizationName: `SBF1 ${suffix}`,
      organizationSlug: `sbf1-${suffix}-${crypto.randomUUID()}`,
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
      firstName: "Desk",
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
  return resolveRequestContext(
    {
      clerkUserId: profile.clerkUserId,
      clerkOrganizationId: tenant.organization.clerkOrganizationId,
    },
    db,
  );
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
  await db.resource.create({
    data: {
      organizationId,
      resourceTypeId: type.id,
      locationId,
      name: "Lane 1",
      displayOrder: 1,
      active: true,
    },
  });
  return type;
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
) {
  const email = `sbf1.${crypto.randomUUID()}@example.com`;
  const created = await createPublicInquiry(
    db,
    {
      organizationSlug: tenant.organization.slug,
      rateLimitKey: `${tenant.organization.slug}:${email}`,
      firstName: "Ada",
      lastName: "Lovelace",
      email,
      eventType: "Birthday Party",
      preferredDate: "2026-10-22",
      startTime: "14:00",
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
        eventDate: "2026-10-22",
        startTime: "14:00",
        durationMinutes: 120,
        activities: [{ knowledgeItemId: type.id, name: type.name, quantity: 1, priceCents: 20_000 }],
        dining: { label: "None", priceCents: 0 },
        spaces: [],
        schedule: ["14:00–16:00 Lane"],
        itinerary: [
          {
            startTime: "14:00",
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
  return created;
}

describe("SBF1 staff confirmation operations (TEST)", { timeout: 180_000 }, () => {
  it("surfaces unconfigured hours and authorizes/revokes/consumes exceptions through the action path", async () => {
    const tenant = await provisionTenant("flow");
    const type = await seedLane(tenant.organizationId, tenant.locationId);
    const inquiry = await createConfirmableInquiry(tenant, type);

    const readiness = await getConfirmationReadiness(tenant.ctx, db, inquiry.inquiryId);
    expect(readiness.state).toBe(CONFIRMATION_READINESS_STATES.BLOCKED_HOURS_UNCONFIGURED);
    expect(readiness.confirmAttemptAllowed).toBe(false);
    expect(readiness.canAuthorizeHoursException).toBe(true);

    await expect(
      confirmInquiryBooking(tenant.ctx, db, inquiry.inquiryId),
    ).rejects.toMatchObject({ code: "OPERATING_HOURS_UNRESOLVED" });

    const deskCtx = await addGroupUser(tenant, SYSTEM_GROUP_KEYS.FRONT_DESK, "desk-sbf1@example.com");
    await expect(
      authorizeOperatingHoursException(deskCtx, db, {
        organizationId: tenant.organizationId,
        locationId: tenant.locationId!,
        slotDate: "2026-10-22",
        startMinute: 14 * 60,
        endMinute: 16 * 60,
        purpose: OPERATING_HOURS_EXCEPTION_PURPOSES.CONFIRM_BOOKING,
        overriddenStatus: OPERATING_HOURS_EVALUATION_STATUSES.HOURS_UNCONFIGURED,
        reason: "Front desk must not authorize this",
        inquiryId: inquiry.inquiryId,
      }),
    ).rejects.toBeInstanceOf(AuthorizationError);

    const other = await provisionTenant("other");
    await expect(
      authorizeOperatingHoursException(other.ctx, db, {
        organizationId: tenant.organizationId,
        locationId: tenant.locationId!,
        slotDate: "2026-10-22",
        startMinute: 14 * 60,
        endMinute: 16 * 60,
        purpose: OPERATING_HOURS_EXCEPTION_PURPOSES.CONFIRM_BOOKING,
        overriddenStatus: OPERATING_HOURS_EVALUATION_STATUSES.HOURS_UNCONFIGURED,
        reason: "Cross org forged location",
        inquiryId: inquiry.inquiryId,
      }),
    ).rejects.toBeInstanceOf(BookingError);

    await expect(
      authorizeOperatingHoursException(tenant.ctx, db, {
        organizationId: tenant.organizationId,
        locationId: tenant.locationId!,
        slotDate: "2026-10-22",
        startMinute: 14 * 60,
        endMinute: 16 * 60,
        purpose: OPERATING_HOURS_EXCEPTION_PURPOSES.CONFIRM_BOOKING,
        overriddenStatus: OPERATING_HOURS_EVALUATION_STATUSES.HOURS_UNCONFIGURED,
        reason: "short",
        inquiryId: inquiry.inquiryId,
      }),
    ).rejects.toMatchObject({ code: "HOURS_EXCEPTION_INVALID" });

    const authorized = await authorizeOperatingHoursException(tenant.ctx, db, {
      organizationId: tenant.organizationId,
      locationId: tenant.locationId!,
      slotDate: "2026-10-22",
      startMinute: 14 * 60,
      endMinute: 16 * 60,
      purpose: OPERATING_HOURS_EXCEPTION_PURPOSES.CONFIRM_BOOKING,
      overriddenStatus: OPERATING_HOURS_EVALUATION_STATUSES.HOURS_UNCONFIGURED,
      reason: "Owner-approved after-hours birthday confirmation",
      inquiryId: inquiry.inquiryId,
    });

    const readyWithException = await getConfirmationReadiness(tenant.ctx, db, inquiry.inquiryId);
    expect(readyWithException.state).toBe(CONFIRMATION_READINESS_STATES.READY_WITH_EXCEPTION);
    expect(readyWithException.confirmAttemptAllowed).toBe(true);
    expect(readyWithException.activeException?.id).toBe(authorized.id);

    await revokeOperatingHoursException(tenant.ctx, db, authorized.id);
    const afterRevoke = await getConfirmationReadiness(tenant.ctx, db, inquiry.inquiryId);
    expect(afterRevoke.state).toBe(CONFIRMATION_READINESS_STATES.BLOCKED_HOURS_UNCONFIGURED);

    const again = await authorizeOperatingHoursException(tenant.ctx, db, {
      organizationId: tenant.organizationId,
      locationId: tenant.locationId!,
      slotDate: "2026-10-22",
      startMinute: 14 * 60,
      endMinute: 16 * 60,
      purpose: OPERATING_HOURS_EXCEPTION_PURPOSES.CONFIRM_BOOKING,
      overriddenStatus: OPERATING_HOURS_EVALUATION_STATUSES.HOURS_UNCONFIGURED,
      reason: "Re-authorized after revoke for confirmation",
      inquiryId: inquiry.inquiryId,
    });

    await expect(
      confirmInquiryBooking(tenant.ctx, db, inquiry.inquiryId, null, authorized.id),
    ).rejects.toMatchObject({ code: "HOURS_EXCEPTION_INVALID" });

    const confirmed = await confirmInquiryBooking(tenant.ctx, db, inquiry.inquiryId, null, again.id);
    expect(confirmed.created).toBe(true);
    expect(confirmed.booking.status).toBe(BOOKING_STATUSES.CONFIRMED);

    const consumed = await db.operatingHoursStaffException.findFirstOrThrow({ where: { id: again.id } });
    expect(consumed.consumedAt).not.toBeNull();

    const againConfirm = await confirmInquiryBooking(tenant.ctx, db, inquiry.inquiryId, null, again.id);
    expect(againConfirm.created).toBe(false);
    expect(againConfirm.booking.status).toBe(BOOKING_STATUSES.CONFIRMED);
  });

  it("keeps exception unconsumed when confirmation fails on resource conflict", async () => {
    const tenant = await provisionTenant("preserve");
    const type = await seedLane(tenant.organizationId, tenant.locationId);
    const inquiry = await createConfirmableInquiry(tenant, type);
    const resource = await db.resource.findFirstOrThrow({
      where: { organizationId: tenant.organizationId, resourceTypeId: type.id },
    });
    await db.resourceReservation.create({
      data: {
        organizationId: tenant.organizationId,
        locationId: tenant.locationId,
        resourceId: resource.id,
        status: "BOOKED",
        sourceType: "MANUAL",
        slotDate: new Date("2026-10-22T00:00:00.000Z"),
        startMinute: 14 * 60,
        endMinute: 16 * 60,
        startsAt: new Date("2026-10-22T18:00:00.000Z"),
        endsAt: new Date("2026-10-22T20:00:00.000Z"),
      },
    });
    const exception = await authorizeOperatingHoursException(tenant.ctx, db, {
      organizationId: tenant.organizationId,
      locationId: tenant.locationId!,
      slotDate: "2026-10-22",
      startMinute: 14 * 60,
      endMinute: 16 * 60,
      purpose: OPERATING_HOURS_EXCEPTION_PURPOSES.CONFIRM_BOOKING,
      overriddenStatus: OPERATING_HOURS_EVALUATION_STATUSES.HOURS_UNCONFIGURED,
      reason: "Must not burn on conflict",
      inquiryId: inquiry.inquiryId,
    });
    await expect(
      confirmInquiryBooking(tenant.ctx, db, inquiry.inquiryId, null, exception.id),
    ).rejects.toBeInstanceOf(BookingError);
    const stillOpen = await db.operatingHoursStaffException.findFirstOrThrow({
      where: { id: exception.id },
    });
    expect(stillOpen.consumedAt).toBeNull();
    const booking = await db.booking.findFirst({ where: { inquiryId: inquiry.inquiryId } });
    expect(booking?.status).not.toBe(BOOKING_STATUSES.CONFIRMED);
  });
});
