import { afterAll, afterEach, describe, expect, it } from "vitest";

import { createMemoryRateLimiter } from "@/lib/ai/rate-limiter";
import { SYSTEM_GROUP_KEYS } from "@/server/authorization/default-security-groups";
import { AuthorizationError, BookingError, ResourceError } from "@/server/errors";
import { resolveRequestContext } from "@/server/request-context";
import {
  authorizeOperatingHoursException,
  revokeOperatingHoursException,
} from "@/server/resources/hours-exception";
import { getHoldReadiness } from "@/server/services/hold-readiness-service";
import { bookPublicEventPlan } from "@/server/services/event-plan-service";
import { createPublicInquiry } from "@/server/services/inquiry-service";
import { startWorkingInquiry } from "@/server/services/live-agent-service";
import { provisionOrganization } from "@/server/services/provision-organization";
import {
  placeInquiryPlanHold,
  placeManualHold,
  releaseInquiryHolds,
} from "@/server/services/resource-hold-service";
import { HOLD_READINESS_STATES } from "@/types/hold-readiness";
import { EVENT_PLAN_KINDS } from "@/types/inquiry";
import {
  OPERATING_HOURS_EVALUATION_STATUSES,
  OPERATING_HOURS_EXCEPTION_PURPOSES,
} from "@/types/operating-hours";
import {
  RESOURCE_QUANTITY_RULES,
  RESOURCE_RESERVATION_STATUSES,
  type PlanResourceRequirement,
} from "@/types/resource-schedule";
import { deleteTestOrganizations } from "../helpers/cleanup-test-organizations";
import { createTestPrismaClient } from "../helpers/test-database";
import { futureEventDate } from "../helpers/future-event-date";

const EVENT_DATE = futureEventDate(28);
const EVENT_DATE_PLUS_1 = futureEventDate(28 + 1);

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
      clerkUserId: `user_sbf2_${suffix}_${crypto.randomUUID()}`,
      clerkOrganizationId: `clerk_org_sbf2_${suffix}_${crypto.randomUUID()}`,
      organizationName: `SBF2 ${suffix}`,
      organizationSlug: `sbf2-${suffix}-${crypto.randomUUID()}`,
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

async function createHoldableInquiry(
  tenant: Awaited<ReturnType<typeof provisionTenant>>,
  type: { id: string; slug: string; name: string },
  opts?: { eventDate?: string; startTime?: string },
) {
  const eventDate = opts?.eventDate ?? EVENT_DATE;
  const startTime = opts?.startTime ?? "14:00";
  const email = `sbf2.${crypto.randomUUID()}@example.com`;
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
  return created;
}

describe("SBF2 staff HOLD operations (TEST)", { timeout: 180_000 }, () => {
  it("authorizes PLACE_HOLD exceptions, places HOLD, and consumes only on success", async () => {
    const tenant = await provisionTenant("flow");
    const { type } = await seedLane(tenant.organizationId, tenant.locationId);
    const inquiry = await createHoldableInquiry(tenant, type);

    const readiness = await getHoldReadiness(tenant.ctx, db, inquiry.inquiryId);
    expect(readiness.state).toBe(HOLD_READINESS_STATES.BLOCKED_HOURS_UNCONFIGURED);
    expect(readiness.holdAttemptAllowed).toBe(false);
    expect(readiness.canAuthorizeHoursException).toBe(true);

    await expect(placeInquiryPlanHold(tenant.ctx, db, inquiry.inquiryId)).rejects.toMatchObject({
      code: "OPERATING_HOURS_UNRESOLVED",
    });

    const deskCtx = await addGroupUser(tenant, SYSTEM_GROUP_KEYS.FRONT_DESK, "desk-sbf2@example.com");
    await expect(
      authorizeOperatingHoursException(deskCtx, db, {
        organizationId: tenant.organizationId,
        locationId: tenant.locationId!,
        slotDate: EVENT_DATE,
        startMinute: 14 * 60,
        endMinute: 16 * 60,
        purpose: OPERATING_HOURS_EXCEPTION_PURPOSES.PLACE_HOLD,
        overriddenStatus: OPERATING_HOURS_EVALUATION_STATUSES.HOURS_UNCONFIGURED,
        reason: "Front desk must not authorize HOLD exceptions",
        inquiryId: inquiry.inquiryId,
      }),
    ).rejects.toBeInstanceOf(AuthorizationError);

    const other = await provisionTenant("other");
    await expect(
      authorizeOperatingHoursException(other.ctx, db, {
        organizationId: tenant.organizationId,
        locationId: tenant.locationId!,
        slotDate: EVENT_DATE,
        startMinute: 14 * 60,
        endMinute: 16 * 60,
        purpose: OPERATING_HOURS_EXCEPTION_PURPOSES.PLACE_HOLD,
        overriddenStatus: OPERATING_HOURS_EVALUATION_STATUSES.HOURS_UNCONFIGURED,
        reason: "Cross org forged location for HOLD",
        inquiryId: inquiry.inquiryId,
      }),
    ).rejects.toBeInstanceOf(BookingError);

    const confirmPurpose = await authorizeOperatingHoursException(tenant.ctx, db, {
      organizationId: tenant.organizationId,
      locationId: tenant.locationId!,
      slotDate: EVENT_DATE,
      startMinute: 14 * 60,
      endMinute: 16 * 60,
      purpose: OPERATING_HOURS_EXCEPTION_PURPOSES.CONFIRM_BOOKING,
      overriddenStatus: OPERATING_HOURS_EVALUATION_STATUSES.HOURS_UNCONFIGURED,
      reason: "Wrong purpose must not authorize HOLD",
      inquiryId: inquiry.inquiryId,
    });
    await expect(
      placeInquiryPlanHold(tenant.ctx, db, inquiry.inquiryId, confirmPurpose.id),
    ).rejects.toMatchObject({ code: "HOURS_EXCEPTION_INVALID" });

    const authorized = await authorizeOperatingHoursException(tenant.ctx, db, {
      organizationId: tenant.organizationId,
      locationId: tenant.locationId!,
      slotDate: EVENT_DATE,
      startMinute: 14 * 60,
      endMinute: 16 * 60,
      purpose: OPERATING_HOURS_EXCEPTION_PURPOSES.PLACE_HOLD,
      overriddenStatus: OPERATING_HOURS_EVALUATION_STATUSES.HOURS_UNCONFIGURED,
      reason: "Owner-approved after-hours proposal HOLD",
      inquiryId: inquiry.inquiryId,
    });

    const readyWithException = await getHoldReadiness(tenant.ctx, db, inquiry.inquiryId);
    expect(readyWithException.state).toBe(HOLD_READINESS_STATES.READY_WITH_EXCEPTION);
    expect(readyWithException.holdAttemptAllowed).toBe(true);
    expect(readyWithException.activeException?.id).toBe(authorized.id);

    await revokeOperatingHoursException(tenant.ctx, db, authorized.id);
    const afterRevoke = await getHoldReadiness(tenant.ctx, db, inquiry.inquiryId);
    expect(afterRevoke.state).toBe(HOLD_READINESS_STATES.BLOCKED_HOURS_UNCONFIGURED);

    const again = await authorizeOperatingHoursException(tenant.ctx, db, {
      organizationId: tenant.organizationId,
      locationId: tenant.locationId!,
      slotDate: EVENT_DATE,
      startMinute: 14 * 60,
      endMinute: 16 * 60,
      purpose: OPERATING_HOURS_EXCEPTION_PURPOSES.PLACE_HOLD,
      overriddenStatus: OPERATING_HOURS_EVALUATION_STATUSES.HOURS_UNCONFIGURED,
      reason: "Re-authorized after revoke for HOLD",
      inquiryId: inquiry.inquiryId,
    });

    const hold = await placeInquiryPlanHold(tenant.ctx, db, inquiry.inquiryId, again.id);
    expect(hold.resourceCount).toBeGreaterThan(0);
    expect(hold.expiresAt.getTime()).toBeGreaterThan(Date.now() + 23 * 60 * 60 * 1000);

    const consumed = await db.operatingHoursStaffException.findFirstOrThrow({ where: { id: again.id } });
    expect(consumed.consumedAt).not.toBeNull();

    const heldReadiness = await getHoldReadiness(tenant.ctx, db, inquiry.inquiryId);
    expect(heldReadiness.state).toBe(HOLD_READINESS_STATES.ALREADY_HELD);
    expect(heldReadiness.holdAttemptAllowed).toBe(false);

    await expect(
      placeInquiryPlanHold(tenant.ctx, db, inquiry.inquiryId),
    ).rejects.toBeInstanceOf(ResourceError);

    await releaseInquiryHolds(tenant.ctx, db, inquiry.inquiryId);
    const afterRelease = await db.resourceReservation.count({
      where: {
        inquiryId: inquiry.inquiryId,
        status: RESOURCE_RESERVATION_STATUSES.HOLD,
        releasedAt: null,
      },
    });
    expect(afterRelease).toBe(0);
  });

  it("keeps PLACE_HOLD exception unconsumed when inquiry HOLD fails on conflict", async () => {
    const tenant = await provisionTenant("preserve");
    const { type, resource } = await seedLane(tenant.organizationId, tenant.locationId);
    const inquiry = await createHoldableInquiry(tenant, type);
    await db.resourceReservation.create({
      data: {
        organizationId: tenant.organizationId,
        locationId: tenant.locationId,
        resourceId: resource.id,
        status: "BOOKED",
        sourceType: "MANUAL",
        slotDate: new Date(`${EVENT_DATE}T00:00:00.000Z`),
        startMinute: 14 * 60,
        endMinute: 16 * 60,
        startsAt: new Date(`${EVENT_DATE}T18:00:00.000Z`),
        endsAt: new Date(`${EVENT_DATE}T20:00:00.000Z`),
      },
    });
    const exception = await authorizeOperatingHoursException(tenant.ctx, db, {
      organizationId: tenant.organizationId,
      locationId: tenant.locationId!,
      slotDate: EVENT_DATE,
      startMinute: 14 * 60,
      endMinute: 16 * 60,
      purpose: OPERATING_HOURS_EXCEPTION_PURPOSES.PLACE_HOLD,
      overriddenStatus: OPERATING_HOURS_EVALUATION_STATUSES.HOURS_UNCONFIGURED,
      reason: "Must not burn on inquiry HOLD conflict",
      inquiryId: inquiry.inquiryId,
    });
    await expect(
      placeInquiryPlanHold(tenant.ctx, db, inquiry.inquiryId, exception.id),
    ).rejects.toBeInstanceOf(ResourceError);
    const stillOpen = await db.operatingHoursStaffException.findFirstOrThrow({
      where: { id: exception.id },
    });
    expect(stillOpen.consumedAt).toBeNull();
  });

  it("rejects fingerprint mismatch and expired exceptions for HOLD", async () => {
    const tenant = await provisionTenant("fingerprint");
    const { type } = await seedLane(tenant.organizationId, tenant.locationId);
    const inquiry = await createHoldableInquiry(tenant, type);

    const wrongWindow = await authorizeOperatingHoursException(tenant.ctx, db, {
      organizationId: tenant.organizationId,
      locationId: tenant.locationId!,
      slotDate: EVENT_DATE,
      startMinute: 10 * 60,
      endMinute: 12 * 60,
      purpose: OPERATING_HOURS_EXCEPTION_PURPOSES.PLACE_HOLD,
      overriddenStatus: OPERATING_HOURS_EVALUATION_STATUSES.HOURS_UNCONFIGURED,
      reason: "Wrong occupancy window for this inquiry",
      inquiryId: inquiry.inquiryId,
    });
    await expect(
      placeInquiryPlanHold(tenant.ctx, db, inquiry.inquiryId, wrongWindow.id),
    ).rejects.toMatchObject({ code: "HOURS_EXCEPTION_INVALID" });

    const expired = await authorizeOperatingHoursException(tenant.ctx, db, {
      organizationId: tenant.organizationId,
      locationId: tenant.locationId!,
      slotDate: EVENT_DATE,
      startMinute: 14 * 60,
      endMinute: 16 * 60,
      purpose: OPERATING_HOURS_EXCEPTION_PURPOSES.PLACE_HOLD,
      overriddenStatus: OPERATING_HOURS_EVALUATION_STATUSES.HOURS_UNCONFIGURED,
      reason: "Will expire before HOLD",
      inquiryId: inquiry.inquiryId,
      ttlMs: 1,
    });
    await new Promise((resolve) => setTimeout(resolve, 5));
    await expect(
      placeInquiryPlanHold(tenant.ctx, db, inquiry.inquiryId, expired.id),
    ).rejects.toMatchObject({ code: "HOURS_EXCEPTION_INVALID" });
  });

  it("rejects concurrent overlapping manual HOLDs under exclusion", async () => {
    const tenant = await provisionTenant("concurrent");
    const { resource } = await seedLane(tenant.organizationId, tenant.locationId);
    const exceptionA = await authorizeOperatingHoursException(tenant.ctx, db, {
      organizationId: tenant.organizationId,
      locationId: tenant.locationId!,
      slotDate: EVENT_DATE_PLUS_1,
      startMinute: 14 * 60,
      endMinute: 16 * 60,
      purpose: OPERATING_HOURS_EXCEPTION_PURPOSES.PLACE_HOLD,
      overriddenStatus: OPERATING_HOURS_EVALUATION_STATUSES.HOURS_UNCONFIGURED,
      reason: "Concurrent HOLD attempt A",
    });
    const exceptionB = await authorizeOperatingHoursException(tenant.ctx, db, {
      organizationId: tenant.organizationId,
      locationId: tenant.locationId!,
      slotDate: EVENT_DATE_PLUS_1,
      startMinute: 14 * 60,
      endMinute: 16 * 60,
      purpose: OPERATING_HOURS_EXCEPTION_PURPOSES.PLACE_HOLD,
      overriddenStatus: OPERATING_HOURS_EVALUATION_STATUSES.HOURS_UNCONFIGURED,
      reason: "Concurrent HOLD attempt B",
    });

    const results = await Promise.allSettled([
      placeManualHold(tenant.ctx, db, {
        resourceId: resource.id,
        date: EVENT_DATE_PLUS_1,
        startTime: "14:00",
        endTime: "16:00",
        hoursExceptionId: exceptionA.id,
      }),
      placeManualHold(tenant.ctx, db, {
        resourceId: resource.id,
        date: EVENT_DATE_PLUS_1,
        startTime: "14:00",
        endTime: "16:00",
        hoursExceptionId: exceptionB.id,
      }),
    ]);
    const fulfilled = results.filter((row) => row.status === "fulfilled");
    const rejected = results.filter((row) => row.status === "rejected");
    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);

    const active = await db.resourceReservation.count({
      where: {
        organizationId: tenant.organizationId,
        resourceId: resource.id,
        status: RESOURCE_RESERVATION_STATUSES.HOLD,
        releasedAt: null,
      },
    });
    expect(active).toBe(1);
  });
});
