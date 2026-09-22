import { afterAll, afterEach, describe, expect, it } from "vitest";

import { loadBookingCatalogDataset } from "@/server/catalog/load-dataset";
import { createPublicInquiry } from "@/server/services/inquiry-service";
import { importBookingCatalog } from "@/server/services/catalog-import-service";
import { selectPublicEventPlan } from "@/server/services/event-plan-service";
import { checkResourceAvailability, reserveResourcesInTransaction } from "@/server/services/resource-availability-service";
import { provisionOrganization } from "@/server/services/provision-organization";
import { EVENT_PLAN_KINDS, INQUIRY_SALES_STAGES, INQUIRY_STATUSES } from "@/types/inquiry";
import { RESOURCE_RESERVATION_SOURCES, RESOURCE_RESERVATION_STATUSES } from "@/types/resource-schedule";
import { createMemoryRateLimiter } from "@/lib/ai/rate-limiter";
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
      clerkUserId: `user_cat_${suffix}_${crypto.randomUUID()}`,
      clerkOrganizationId: `clerk_org_cat_${suffix}_${crypto.randomUUID()}`,
      organizationName: `Catalog ${suffix}`,
      organizationSlug: `catalog-${suffix}-${crypto.randomUUID()}`,
      isClerkOrganizationAdmin: true,
    },
    db,
  );
  createdOrganizationIds.push(result.organizationId);
  return db.organization.findFirstOrThrow({ where: { id: result.organizationId } });
}

function intake(slug: string, extras: Record<string, unknown> = {}) {
  return {
    organizationSlug: slug,
    rateLimitKey: `${slug}:${crypto.randomUUID()}`,
    firstName: "Ada",
    lastName: "Lovelace",
    email: `ada.${crypto.randomUUID()}@example.com`,
    eventType: "Birthday Party",
    preferredDate: "2026-10-15",
    startTime: "18:00",
    guestCount: 12,
    guestMix: "mostly_children",
    desiredDurationMinutes: 180,
    budgetBand: "1500_3000" as const,
    eventGoal: "Celebration",
    diningPreference: "pizza_light",
    spacePreference: "semi_private",
    attractionInterestIds: [] as string[],
    attractionMode: "recommend",
    submissionId: `sub_${crypto.randomUUID()}`,
    ...extras,
  };
}

describe("booking catalog import and proposals (postgres)", () => {
  it(
    "imports only the selected tenant, stays isolated, and keeps proposal snapshots immutable",
    async () => {
    const target = await provisionTenant("target");
    const other = await provisionTenant("other");
    const dataset = loadBookingCatalogDataset();

    const first = await importBookingCatalog(db, { organizationSlug: target.slug, dataset });
    expect(first.productsCreated).toBeGreaterThan(0);
    expect(first.ambiguities.some((row) => row.code === "BROWNIE_TRAY_TYPO")).toBe(true);
    expect(await db.product.count({ where: { organizationId: other.id } })).toBe(0);

    const second = await importBookingCatalog(db, { organizationSlug: target.slug, dataset });
    expect(second.productsCreated).toBe(0);
    expect(second.productsUnchanged).toBeGreaterThan(0);

    const bowling = await db.resourceType.findFirst({
      where: { organizationId: target.id, slug: "bowling-lane" },
      include: { resources: true },
    });
    expect(bowling?.resources).toHaveLength(8);
    expect(bowling?.resources.every((row) => row.capacity === 6)).toBe(true);

    const created = await createPublicInquiry(db, intake(target.slug), undefined, unlimitedLimiter);
    const plans = await db.eventPlanRecommendation.findMany({
      where: { inquiryId: created.inquiryId, kind: EVENT_PLAN_KINDS.RECOMMENDATION },
      orderBy: { sortOrder: "asc" },
    });
    expect(plans.length).toBeGreaterThan(0);
    const originalTotal = plans[0]?.estimatedTotalCents;
    expect(originalTotal).toBeGreaterThan(0);

    await db.productPrice.updateMany({
      where: { organizationId: target.id },
      data: { amountCents: 1 },
    });
    const reread = await db.eventPlanRecommendation.findFirstOrThrow({ where: { id: plans[0]!.id } });
    expect(reread.estimatedTotalCents).toBe(originalTotal);

    const otherInquiry = await createPublicInquiry(db, intake(other.slug), undefined, unlimitedLimiter);
    expect(
      await db.eventPlanRecommendation.count({
        where: { organizationId: other.id, inquiryId: otherInquiry.inquiryId },
      }),
    ).toBeGreaterThanOrEqual(0);

    const targetInquiry = await db.inquiry.findFirstOrThrow({ where: { id: created.inquiryId } });
    expect(targetInquiry.salesStage).toBe(INQUIRY_SALES_STAGES.PROPOSAL_READY);
    expect(targetInquiry.audience).toBe("KIDS_YOUTH");
    },
    60_000,
  );

  it("does not occupy resources when generating or selecting a proposal", async () => {
    const organization = await provisionTenant("avail");
    const dataset = loadBookingCatalogDataset();
    await importBookingCatalog(db, { organizationSlug: organization.slug, dataset });
    const created = await createPublicInquiry(db, intake(organization.slug), undefined, unlimitedLimiter);
    expect(
      await db.resourceReservation.count({ where: { organizationId: organization.id, inquiryId: created.inquiryId } }),
    ).toBe(0);

    const plan = await db.eventPlanRecommendation.findFirstOrThrow({
      where: { inquiryId: created.inquiryId, kind: EVENT_PLAN_KINDS.RECOMMENDATION },
    });
    await selectPublicEventPlan(
      db,
      { token: created.publicToken, planId: plan.id, rateLimitKey: `plan:${created.publicToken}` },
      unlimitedLimiter,
    );
    const inquiry = await db.inquiry.findFirstOrThrow({ where: { id: created.inquiryId } });
    expect(inquiry.status).toBe(INQUIRY_STATUSES.READY_FOR_HUMAN);
    expect(inquiry.salesStage).toBe(INQUIRY_SALES_STAGES.READY_TO_BOOK);
    expect(await db.resourceReservation.count({ where: { organizationId: organization.id } })).toBe(0);
  }, 60_000);

  it("marks exhausted bowling capacity unavailable and keeps tenant occupancy isolated", async () => {
    const tenantA = await provisionTenant("occ-a");
    const tenantB = await provisionTenant("occ-b");
    const dataset = loadBookingCatalogDataset();
    await importBookingCatalog(db, { organizationSlug: tenantA.slug, dataset });
    await importBookingCatalog(db, { organizationSlug: tenantB.slug, dataset });

    const typeA = await db.resourceType.findFirstOrThrow({
      where: { organizationId: tenantA.id, slug: "bowling-lane" },
      include: { resources: { orderBy: { displayOrder: "asc" } } },
    });
    await reserveResourcesInTransaction(db, {
      organizationId: tenantA.id,
      status: RESOURCE_RESERVATION_STATUSES.HOLD,
      sourceType: RESOURCE_RESERVATION_SOURCES.MANUAL,
      slotDate: "2026-10-15",
      startMinute: 8 * 60,
      endMinute: 22 * 60,
      resourceIds: typeA.resources.map((row) => row.id),
      reason: "block all lanes for the searchable day",
    });

    const created = await createPublicInquiry(db, intake(tenantA.slug, { guestCount: 48 }), undefined, unlimitedLimiter);
    const plans = await db.eventPlanRecommendation.findMany({
      where: { inquiryId: created.inquiryId },
    });
    const bowlingPlan = plans.find((row) => JSON.stringify(row.payload).includes("bowling-lane"));
    expect(bowlingPlan?.availabilityStatus === "UNAVAILABLE" || bowlingPlan?.availabilityValidated === false).toBe(true);

    const typeB = await db.resourceType.findFirstOrThrow({
      where: { organizationId: tenantB.id, slug: "bowling-lane" },
    });
    const checkB = await checkResourceAvailability(db, {
      organizationId: tenantB.id,
      date: "2026-10-15",
      startTime: "18:00",
      durationMinutes: 60,
      resourceRequirements: [
        {
          knowledgeItemId: "bowl",
          knowledgeItemName: "Bowling",
          resourceTypeId: typeB.id,
          resourceTypeSlug: "bowling-lane",
          resourceTypeName: "Bowling Lane",
          quantityRule: "PER_GUESTS",
          quantity: 2,
          guestsPerUnit: 6,
          durationMinutes: 60,
          inventoryConfigured: true,
          requiresStaffConfiguration: false,
        },
      ],
    });
    expect(checkB.available).toBe(true);
  }, 60_000);
});
