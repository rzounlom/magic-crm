import { afterAll, afterEach, describe, expect, it } from "vitest";

import { SYSTEM_GROUP_KEYS } from "@/server/authorization/default-security-groups";
import { AuthorizationError, ResourceError } from "@/server/errors";
import { resolveRequestContext } from "@/server/request-context";
import { provisionOrganization } from "@/server/services/provision-organization";
import { createSalesKnowledgeItem } from "@/server/services/sales-knowledge-service";
import { selectPublicEventPlan } from "@/server/services/event-plan-service";
import { createPublicInquiry } from "@/server/services/inquiry-service";
import {
  bulkCreateResources,
  createResourceType,
  updateResource,
} from "@/server/services/resource-admin-service";
import {
  placeInquiryPlanHold,
  releaseInquiryHolds,
} from "@/server/services/resource-hold-service";
import { checkResourceAvailability, reserveResourcesInTransaction } from "@/server/services/resource-availability-service";
import { COMMUNICATION_KINDS } from "@/types/communications";
import {
  PLAN_AVAILABILITY_STATUSES,
  RESOURCE_RESERVATION_SOURCES,
  RESOURCE_RESERVATION_STATUSES,
} from "@/types/resource-schedule";
import { INQUIRY_STATUSES, SALES_KNOWLEDGE_TYPES } from "@/types/inquiry";
import { READY_FOR_HUMAN_REASONS } from "@/lib/inquiries/ready-for-human-reason";
import { createMemoryRateLimiter } from "@/lib/ai/rate-limiter";
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
  return { ...result, ctx, organization };
}

describe("resource management (postgres)", () => {
  it("lets an admin bulk-create resources and forbids a front-desk employee", async () => {
    const tenant = await provisionTenant("admin-res");
    const type = await createResourceType(tenant.ctx, db, { name: "Bowling Lane" });
    const created = await bulkCreateResources(tenant.ctx, db, {
      resourceTypeId: type.id,
      count: 3,
      namePattern: "Bowling Lane {n}",
    });
    expect(created).toBe(3);
    expect(await db.resource.count({ where: { organizationId: tenant.organizationId, active: true } })).toBe(3);
    const first = await db.resource.findFirstOrThrow({
      where: { organizationId: tenant.organizationId, resourceTypeId: type.id },
      orderBy: { displayOrder: "asc" },
    });
    await updateResource(tenant.ctx, db, first.id, {
      name: first.name,
      displayOrder: first.displayOrder,
      capacity: first.capacity,
      active: false,
    });
    expect(await db.resource.count({ where: { organizationId: tenant.organizationId, active: true } })).toBe(2);
    const refreshed = await db.resourceType.findFirstOrThrow({ where: { id: type.id } });
    expect(refreshed.inventoryConfigured).toBe(true);

    const frontDesk = await db.securityGroup.findFirstOrThrow({
      where: { organizationId: tenant.organizationId, systemKey: SYSTEM_GROUP_KEYS.FRONT_DESK },
    });
    const desk = await db.userProfile.create({
      data: {
        organizationId: tenant.organizationId,
        clerkUserId: `desk_${crypto.randomUUID()}`,
        defaultLocationId: tenant.locationId,
        email: "desk@example.com",
      },
    });
    await db.securityGroupMember.create({
      data: {
        organizationId: tenant.organizationId,
        securityGroupId: frontDesk.id,
        userProfileId: desk.id,
      },
    });
    const deskCtx = await resolveRequestContext(
      {
        clerkUserId: desk.clerkUserId,
        clerkOrganizationId: tenant.organization.clerkOrganizationId,
      },
      db,
    );
    await expect(createResourceType(deskCtx, db, { name: "Axe Lane" })).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("validates a two-lane recommendation, records availability change on select, and holds transactionally", async () => {
    const tenant = await provisionTenant("hold-flow");
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
    await createSalesKnowledgeItem(tenant.ctx, db, {
      type: SALES_KNOWLEDGE_TYPES.ATTRACTION,
      name: "Laser Tag",
      shortDescription: "Laser Tag",
      details: "Laser tag arena.",
      priceText: "$8/person",
      active: true,
    });
    const type = await createResourceType(tenant.ctx, db, { name: "Bowling Lane", slug: "bowling-lane" });
    await bulkCreateResources(tenant.ctx, db, {
      resourceTypeId: type.id,
      count: 2,
      namePattern: "Bowling Lane {n}",
    });

    const created = await createPublicInquiry(
      db,
      {
        organizationSlug: tenant.organization.slug,
        rateLimitKey: `${tenant.organization.slug}:hold@example.com`,
        firstName: "Ada",
        lastName: "Lovelace",
        email: "hold@example.com",
        eventType: "Birthday Party",
        preferredDate: "2026-10-15",
        startTime: "18:00",
        guestCount: 12,
        guestMix: "mostly_adults",
        desiredDurationMinutes: 180,
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

    const bowlingPlans = await db.eventPlanRecommendation.findMany({ where: { inquiryId: created.inquiryId } });
    const validatedPlan = bowlingPlans.find((row) => row.availabilityValidated) ?? bowlingPlans[0]!;
    expect(validatedPlan.availabilityValidated).toBe(true);

    const lanes = await db.resource.findMany({
      where: { organizationId: tenant.organizationId, resourceTypeId: type.id },
      orderBy: { displayOrder: "asc" },
    });
    await reserveResourcesInTransaction(db, {
      organizationId: tenant.organizationId,
      status: RESOURCE_RESERVATION_STATUSES.HOLD,
      sourceType: RESOURCE_RESERVATION_SOURCES.MANUAL,
      slotDate: "2026-10-15",
      startMinute: 18 * 60,
      endMinute: 21 * 60,
      resourceIds: lanes.map((row) => row.id),
    });

    const commsBeforeSelect = await db.communicationEvent.count({
      where: { organizationId: tenant.organizationId },
    });
    const selected = await selectPublicEventPlan(
      db,
      { token: created.publicToken, planId: validatedPlan.id, rateLimitKey: "hold-select" },
      unlimitedLimiter,
    );
    expect(selected.inquiry.status).toBe(INQUIRY_STATUSES.READY_FOR_HUMAN);
    expect(selected.inquiry.humanHandoffReason).toBe(READY_FOR_HUMAN_REASONS.CUSTOMER_SELECTED_PLAN);
    expect(selected.availabilityStatus).toBe(PLAN_AVAILABILITY_STATUSES.AVAILABILITY_CHANGED);
    expect(
      await db.resourceReservation.count({
        where: {
          organizationId: tenant.organizationId,
          inquiryId: created.inquiryId,
        },
      }),
    ).toBe(0);
    expect(
      await db.resourceReservation.count({
        where: {
          organizationId: tenant.organizationId,
          status: RESOURCE_RESERVATION_STATUSES.BOOKED,
        },
      }),
    ).toBe(0);
    const existingHoldIds = lanes.map((row) => row.id);
    expect(
      await db.resourceReservation.count({
        where: {
          organizationId: tenant.organizationId,
          resourceId: { in: existingHoldIds },
          releasedAt: null,
          status: RESOURCE_RESERVATION_STATUSES.HOLD,
        },
      }),
    ).toBe(2);

    await db.resourceReservation.updateMany({
      where: { organizationId: tenant.organizationId, inquiryId: null },
      data: { releasedAt: new Date() },
    });

    await reserveResourcesInTransaction(db, {
      organizationId: tenant.organizationId,
      status: RESOURCE_RESERVATION_STATUSES.HOLD,
      sourceType: RESOURCE_RESERVATION_SOURCES.MANUAL,
      slotDate: "2026-10-15",
      startMinute: 18 * 60,
      endMinute: 21 * 60,
      resourceIds: [lanes[0]!.id],
    });
    await expect(placeInquiryPlanHold(tenant.ctx, db, created.inquiryId)).rejects.toBeInstanceOf(ResourceError);
    expect(
      await db.resourceReservation.count({
        where: { organizationId: tenant.organizationId, inquiryId: created.inquiryId },
      }),
    ).toBe(0);

    await db.resourceReservation.updateMany({
      where: { organizationId: tenant.organizationId, inquiryId: null },
      data: { releasedAt: new Date() },
    });

    const commsBeforeHold = await db.communicationEvent.count({
      where: { organizationId: tenant.organizationId },
    });
    await placeInquiryPlanHold(tenant.ctx, db, created.inquiryId);
    const held = await db.resourceReservation.findMany({
      where: { organizationId: tenant.organizationId, inquiryId: created.inquiryId, releasedAt: null },
    });
    expect(held.length).toBeGreaterThan(0);
    expect(held.every((row) => row.status === RESOURCE_RESERVATION_STATUSES.HOLD)).toBe(true);
    expect(await db.communicationEvent.count({ where: { organizationId: tenant.organizationId } })).toBe(
      commsBeforeHold,
    );
    expect(commsBeforeSelect).toBeLessThanOrEqual(commsBeforeHold);
    expect(
      await db.communicationEvent.count({
        where: {
          organizationId: tenant.organizationId,
          kind: COMMUNICATION_KINDS.BOOKING_CONFIRMATION,
        },
      }),
    ).toBe(0);

    await releaseInquiryHolds(tenant.ctx, db, created.inquiryId);
    const afterRelease = await checkResourceAvailability(db, {
      organizationId: tenant.organizationId,
      date: "2026-10-15",
      startTime: "18:00",
      durationMinutes: 180,
      resourceRequirements: [
        {
          knowledgeItemId: "bowl",
          knowledgeItemName: "Bowling",
          resourceTypeId: type.id,
          resourceTypeSlug: "bowling-lane",
          resourceTypeName: "Bowling Lane",
          quantityRule: "PER_GUESTS",
          quantity: 2,
          guestsPerUnit: 6,
          durationMinutes: 180,
          inventoryConfigured: true,
          requiresStaffConfiguration: false,
        },
      ],
    });
    expect(afterRelease.available).toBe(true);
  });
});
