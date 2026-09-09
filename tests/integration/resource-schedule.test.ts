import { afterAll, afterEach, describe, expect, it } from "vitest";

import { resolveRequestContext } from "@/server/request-context";
import { provisionOrganization } from "@/server/services/provision-organization";
import { createSalesKnowledgeItem } from "@/server/services/sales-knowledge-service";
import { selectPublicEventPlan } from "@/server/services/event-plan-service";
import { createPublicInquiry } from "@/server/services/inquiry-service";
import { checkResourceAvailability, reserveResourcesInTransaction } from "@/server/services/resource-availability-service";
import { syncResourceCatalogFromKnowledge } from "@/server/resources/sync-from-knowledge";
import { COMMUNICATION_KINDS, COMMUNICATION_STATUSES } from "@/types/communications";
import { RESOURCE_RESERVATION_SOURCES, RESOURCE_RESERVATION_STATUSES } from "@/types/resource-schedule";
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

describe("finite resource schedule (postgres)", () => {
  it("keeps recommendations unvalidated until numbered inventory exists, and never books on selection", async () => {
    const tenant = await provisionTenant("res");
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

    const synced = await syncResourceCatalogFromKnowledge(db, tenant.organizationId);
    expect(synced.resourceTypes).toBeGreaterThan(0);
    const bowlingType = await db.resourceType.findFirstOrThrow({
      where: { organizationId: tenant.organizationId, slug: "bowling-lane" },
    });
    expect(bowlingType.inventoryConfigured).toBe(false);
    expect(await db.resource.count({ where: { organizationId: tenant.organizationId } })).toBe(0);

    const created = await createPublicInquiry(
      db,
      {
        organizationSlug: tenant.organization.slug,
        rateLimitKey: `${tenant.organization.slug}:res@example.com`,
        firstName: "Ada",
        lastName: "Lovelace",
        email: "res@example.com",
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

    const plans = await db.eventPlanRecommendation.findMany({ where: { inquiryId: created.inquiryId } });
    expect(plans.length).toBeGreaterThan(0);
    expect(plans.every((row) => row.availabilityValidated === false)).toBe(true);
    expect(await db.resourceReservation.count({ where: { organizationId: tenant.organizationId } })).toBe(0);

    const selected = await selectPublicEventPlan(
      db,
      { token: created.publicToken, planId: plans[0]!.id, rateLimitKey: "res-select" },
      unlimitedLimiter,
    );
    expect(selected.inquiry.status).toBe(INQUIRY_STATUSES.READY_FOR_HUMAN);
    expect(selected.inquiry.humanHandoffReason).toBe(READY_FOR_HUMAN_REASONS.CUSTOMER_SELECTED_PLAN);
    expect(await db.resourceReservation.count({ where: { organizationId: tenant.organizationId } })).toBe(0);

    const comms = await db.communicationEvent.findMany({
      where: { organizationId: tenant.organizationId, inquiryId: created.inquiryId },
    });
    expect(comms).toHaveLength(1);
    expect(comms[0]?.kind).toBe(COMMUNICATION_KINDS.PLAN_SELECTION_CONFIRMATION);
    expect(comms[0]?.status).toBe(COMMUNICATION_STATUSES.SKIPPED);
  });

  it("isolates numbered inventory by tenant and rejects overlapping reservations", async () => {
    const a = await provisionTenant("lane-a");
    const b = await provisionTenant("lane-b");
    const typeA = await db.resourceType.create({
      data: {
        organizationId: a.organizationId,
        name: "Bowling Lane",
        slug: "bowling-lane",
        inventoryConfigured: true,
      },
    });
    await db.resourceType.create({
      data: {
        organizationId: b.organizationId,
        name: "Bowling Lane",
        slug: "bowling-lane",
        inventoryConfigured: false,
      },
    });
    const lane = await db.resource.create({
      data: {
        organizationId: a.organizationId,
        resourceTypeId: typeA.id,
        name: "Bowling Lane 1",
        displayOrder: 1,
      },
    });

    const otherTypes = await db.resourceType.findMany({ where: { organizationId: b.organizationId } });
    expect(otherTypes.every((row) => row.organizationId === b.organizationId)).toBe(true);
    expect(await db.resource.count({ where: { organizationId: b.organizationId } })).toBe(0);

    await reserveResourcesInTransaction(db, {
      organizationId: a.organizationId,
      status: RESOURCE_RESERVATION_STATUSES.BOOKED,
      sourceType: RESOURCE_RESERVATION_SOURCES.MANUAL,
      slotDate: "2026-10-15",
      startMinute: 18 * 60,
      endMinute: 20 * 60,
      resourceIds: [lane.id],
    });

    const availability = await checkResourceAvailability(db, {
      organizationId: a.organizationId,
      date: "2026-10-15",
      startTime: "18:00",
      durationMinutes: 120,
      resourceRequirements: [
        {
          knowledgeItemId: "bowl",
          knowledgeItemName: "Bowling",
          resourceTypeId: typeA.id,
          resourceTypeSlug: "bowling-lane",
          resourceTypeName: "Bowling Lane",
          quantityRule: "PER_GUESTS",
          quantity: 1,
          guestsPerUnit: 6,
          durationMinutes: 120,
          inventoryConfigured: true,
          requiresStaffConfiguration: false,
        },
      ],
    });
    expect(availability.validated).toBe(false);
    expect(availability.available).toBe(false);

    const stillBusy = await checkResourceAvailability(db, {
      organizationId: a.organizationId,
      date: "2026-10-15",
      startTime: "18:00",
      durationMinutes: 120,
      excludeInquiryId: "inquiry_from_another_flow",
      resourceRequirements: [
        {
          knowledgeItemId: "bowl",
          knowledgeItemName: "Bowling",
          resourceTypeId: typeA.id,
          resourceTypeSlug: "bowling-lane",
          resourceTypeName: "Bowling Lane",
          quantityRule: "PER_GUESTS",
          quantity: 1,
          guestsPerUnit: 6,
          durationMinutes: 120,
          inventoryConfigured: true,
          requiresStaffConfiguration: false,
        },
      ],
    });
    expect(stillBusy.available).toBe(false);

    await expect(
      reserveResourcesInTransaction(db, {
        organizationId: a.organizationId,
        status: RESOURCE_RESERVATION_STATUSES.HOLD,
        sourceType: RESOURCE_RESERVATION_SOURCES.INQUIRY,
        slotDate: "2026-10-15",
        startMinute: 18 * 60,
        endMinute: 19 * 60,
        resourceIds: [lane.id],
      }),
    ).rejects.toThrow();
  });

  it("treats expired holds as available and missing inventory as not validated", async () => {
    const tenant = await provisionTenant("expired");
    const type = await db.resourceType.create({
      data: {
        organizationId: tenant.organizationId,
        name: "Bowling Lane",
        slug: "bowling-lane",
        inventoryConfigured: true,
      },
    });
    const lane = await db.resource.create({
      data: {
        organizationId: tenant.organizationId,
        resourceTypeId: type.id,
        name: "Bowling Lane 1",
        displayOrder: 1,
      },
    });
    await db.resourceReservation.create({
      data: {
        organizationId: tenant.organizationId,
        resourceId: lane.id,
        status: RESOURCE_RESERVATION_STATUSES.HOLD,
        slotDate: new Date("2026-10-15T00:00:00.000Z"),
        startMinute: 18 * 60,
        endMinute: 20 * 60,
        sourceType: RESOURCE_RESERVATION_SOURCES.MANUAL,
        expiresAt: new Date("2020-01-01T00:00:00.000Z"),
      },
    });
    const requirement = {
      knowledgeItemId: "bowl",
      knowledgeItemName: "Bowling",
      resourceTypeId: type.id,
      resourceTypeSlug: "bowling-lane",
      resourceTypeName: "Bowling Lane",
      quantityRule: "PER_GUESTS" as const,
      quantity: 1,
      guestsPerUnit: 6,
      durationMinutes: 120,
      inventoryConfigured: true,
      requiresStaffConfiguration: false,
    };
    const expired = await checkResourceAvailability(db, {
      organizationId: tenant.organizationId,
      date: "2026-10-15",
      startTime: "18:00",
      durationMinutes: 120,
      resourceRequirements: [requirement],
    });
    expect(expired.validated).toBe(true);
    expect(expired.available).toBe(true);
    await reserveResourcesInTransaction(db, {
      organizationId: tenant.organizationId,
      status: RESOURCE_RESERVATION_STATUSES.HOLD,
      sourceType: RESOURCE_RESERVATION_SOURCES.MANUAL,
      slotDate: "2026-10-15",
      startMinute: 18 * 60,
      endMinute: 20 * 60,
      resourceIds: [lane.id],
    });
    expect(
      await db.resourceReservation.count({
        where: { resourceId: lane.id, releasedAt: null, status: RESOURCE_RESERVATION_STATUSES.HOLD },
      }),
    ).toBe(1);

    const unconfiguredType = await db.resourceType.create({
      data: {
        organizationId: tenant.organizationId,
        name: "Party Room",
        slug: "party-room",
        inventoryConfigured: false,
      },
    });
    const missing = await checkResourceAvailability(db, {
      organizationId: tenant.organizationId,
      date: "2026-10-15",
      startTime: "18:00",
      durationMinutes: 120,
      resourceRequirements: [
        {
          ...requirement,
          resourceTypeId: unconfiguredType.id,
          resourceTypeSlug: "party-room",
          resourceTypeName: "Party Room",
          inventoryConfigured: false,
          requiresStaffConfiguration: true,
          quantity: 1,
        },
      ],
    });
    expect(missing.validated).toBe(false);
    expect(missing.available).toBe(true);
    expect(missing.types[0]?.conflict).toBe(false);
  });
});
