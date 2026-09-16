import { afterAll, afterEach, describe, expect, it } from "vitest";

import { createMemoryRateLimiter } from "@/lib/ai/rate-limiter";
import { loadCatalogForProposal } from "@/server/catalog/load-for-proposal";
import { createPublicInquiry } from "@/server/services/inquiry-service";
import { importBookingCatalog } from "@/server/services/catalog-import-service";
import { checkResourceAvailability, reserveResourcesInTransaction } from "@/server/services/resource-availability-service";
import { provisionOrganization } from "@/server/services/provision-organization";
import { EVENT_PLAN_KINDS } from "@/types/inquiry";
import { RESOURCE_RESERVATION_SOURCES, RESOURCE_RESERVATION_STATUSES } from "@/types/resource-schedule";
import { deleteTestOrganizations } from "../helpers/cleanup-test-organizations";
import { createTestPrismaClient } from "../helpers/test-database";
import { TENANT_ALPHA_DATASET, TENANT_BETA_DATASET } from "../fixtures/tenant-alpha-beta-catalogs";

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

async function provisionNamed(name: string) {
  const result = await provisionOrganization(
    {
      clerkUserId: `user_${name}_${crypto.randomUUID()}`,
      clerkOrganizationId: `clerk_org_${name}_${crypto.randomUUID()}`,
      organizationName: name,
      organizationSlug: `${name.toLowerCase().replace(/\s+/g, "-")}-${crypto.randomUUID()}`,
      isClerkOrganizationAdmin: true,
    },
    db,
  );
  createdOrganizationIds.push(result.organizationId);
  return db.organization.findFirstOrThrow({
    where: { id: result.organizationId },
    include: { locations: true },
  });
}

function intake(slug: string, extras: Record<string, unknown> = {}) {
  return {
    organizationSlug: slug,
    rateLimitKey: `${slug}:${crypto.randomUUID()}`,
    firstName: "Ada",
    lastName: "Lovelace",
    email: `ada.${crypto.randomUUID()}@example.com`,
    eventType: "Private Group",
    preferredDate: "2026-10-15",
    startTime: "18:00",
    guestCount: 12,
    guestMix: "mostly_adults",
    desiredDurationMinutes: 120,
    budgetBand: "1500_3000" as const,
    eventGoal: "Team Building",
    diningPreference: "pizza_light",
    spacePreference: "no_preference",
    attractionInterestIds: [] as string[],
    attractionMode: "recommend",
    submissionId: `sub_${crypto.randomUUID()}`,
    ...extras,
  };
}

describe("catalog tenant isolation (postgres)", () => {
  it(
    "runs the same engines against Tenant Alpha and Tenant Beta configuration",
    async () => {
      const alpha = await provisionNamed("Tenant Alpha");
      const beta = await provisionNamed("Tenant Beta");
      await importBookingCatalog(db, { organizationSlug: alpha.slug, dataset: TENANT_ALPHA_DATASET });
      await importBookingCatalog(db, { organizationSlug: beta.slug, dataset: TENANT_BETA_DATASET });

      const alphaLanes = await db.resource.findMany({
        where: { organizationId: alpha.id, resourceType: { slug: "bowling-lane" } },
      });
      const betaLanes = await db.resource.findMany({
        where: { organizationId: beta.id, resourceType: { slug: "bowling-lane" } },
      });
      expect(alphaLanes).toHaveLength(8);
      expect(alphaLanes.every((row) => row.capacity === 6)).toBe(true);
      expect(betaLanes).toHaveLength(2);
      expect(betaLanes.every((row) => row.capacity === 5)).toBe(true);
      expect(await db.resourceType.count({ where: { organizationId: beta.id, slug: "axe-bay" } })).toBe(0);

      const alphaInquiry = await createPublicInquiry(
        db,
        intake(alpha.slug, { guestCount: 30, guestMix: "mostly_adults" }),
        undefined,
        unlimitedLimiter,
      );
      const betaInquiry = await createPublicInquiry(
        db,
        intake(beta.slug, { guestCount: 10, guestMix: "mostly_adults" }),
        undefined,
        unlimitedLimiter,
      );
      const alphaRow = await db.inquiry.findFirstOrThrow({ where: { id: alphaInquiry.inquiryId } });
      const betaRow = await db.inquiry.findFirstOrThrow({ where: { id: betaInquiry.inquiryId } });
      expect(alphaRow.locationId).toBe(alpha.locations[0]?.id);
      expect(betaRow.locationId).toBe(beta.locations[0]?.id);

      const alphaPlans = await db.eventPlanRecommendation.findMany({
        where: { inquiryId: alphaInquiry.inquiryId, kind: EVENT_PLAN_KINDS.RECOMMENDATION },
      });
      const betaPlans = await db.eventPlanRecommendation.findMany({
        where: { inquiryId: betaInquiry.inquiryId, kind: EVENT_PLAN_KINDS.RECOMMENDATION },
      });
      expect(alphaPlans.length).toBeGreaterThan(0);
      expect(betaPlans.length).toBeGreaterThan(0);

      const alphaPayload = alphaPlans[0]!.payload as {
        organizationId?: string;
        locationId?: string | null;
        lineItems?: Array<{ slug: string; totalCents: number }>;
        resourceRequirements?: Array<{ resourceTypeSlug: string; quantity: number | null }>;
        itinerary?: Array<{ label: string }>;
      };
      const betaPayload = betaPlans[0]!.payload as {
        organizationId?: string;
        locationId?: string | null;
        lineItems?: Array<{ slug: string; totalCents: number }>;
        resourceRequirements?: Array<{ resourceTypeSlug: string; quantity: number | null }>;
        itinerary?: Array<{ label: string }>;
      };
      expect(alphaPayload.organizationId).toBe(alpha.id);
      expect(betaPayload.organizationId).toBe(beta.id);
      expect(alphaPayload.lineItems?.some((item) => item.slug === "axe-throwing")).toBe(true);
      expect(betaPayload.lineItems?.some((item) => item.slug === "axe-throwing")).toBeFalsy();
      expect(alphaPayload.resourceRequirements?.find((row) => row.resourceTypeSlug === "bowling-lane")?.quantity).toBe(5);
      expect(betaPayload.resourceRequirements?.find((row) => row.resourceTypeSlug === "bowling-lane")?.quantity).toBe(2);
      expect(alphaPayload.itinerary?.[0]?.label).toMatch(/Pizza/i);
      expect(betaPayload.itinerary?.[0]?.label).not.toMatch(/Snack/i);

      const alphaKids = await createPublicInquiry(
        db,
        intake(alpha.slug, { guestCount: 12, guestMix: "mostly_children" }),
        undefined,
        unlimitedLimiter,
      );
      const betaKids = await createPublicInquiry(
        db,
        intake(beta.slug, { guestCount: 12, guestMix: "mostly_children" }),
        undefined,
        unlimitedLimiter,
      );
      const alphaKidsPlan = await db.eventPlanRecommendation.findFirstOrThrow({
        where: { inquiryId: alphaKids.inquiryId },
      });
      const betaKidsPlan = await db.eventPlanRecommendation.findFirstOrThrow({
        where: { inquiryId: betaKids.inquiryId },
      });
      expect(JSON.stringify(alphaKidsPlan.payload)).toMatch(/laser-tag/);
      expect(JSON.stringify(alphaKidsPlan.payload)).toMatch(/arcade/);
      expect(JSON.stringify(betaKidsPlan.payload)).toMatch(/trampoline/);
      expect(JSON.stringify(betaKidsPlan.payload)).toMatch(/arcade/);
      expect(JSON.stringify(betaKidsPlan.payload)).not.toMatch(/laser-tag/);
    },
    60_000,
  );

  it(
    "keeps availability, locations, and foreign IDs fail-closed",
    async () => {
      const alpha = await provisionNamed("Tenant Alpha Loc");
      const beta = await provisionNamed("Tenant Beta Loc");
      await importBookingCatalog(db, { organizationSlug: alpha.slug, dataset: TENANT_ALPHA_DATASET });
      await importBookingCatalog(db, { organizationSlug: beta.slug, dataset: TENANT_BETA_DATASET });

      const alphaBowling = await db.resourceType.findFirstOrThrow({
        where: { organizationId: alpha.id, slug: "bowling-lane" },
        include: { resources: { orderBy: { displayOrder: "asc" } } },
      });
      const betaBowling = await db.resourceType.findFirstOrThrow({
        where: { organizationId: beta.id, slug: "bowling-lane" },
        include: { resources: true },
      });

      await reserveResourcesInTransaction(db, {
        organizationId: alpha.id,
        status: RESOURCE_RESERVATION_STATUSES.HOLD,
        sourceType: RESOURCE_RESERVATION_SOURCES.MANUAL,
        slotDate: "2026-10-15",
        startMinute: 18 * 60,
        endMinute: 20 * 60,
        resourceIds: alphaBowling.resources.map((row) => row.id),
        reason: "alpha blocked",
      });

      const requirement = (organizationId: string, resourceTypeId: string, quantity: number) => ({
        knowledgeItemId: "bowl",
        knowledgeItemName: "Bowling",
        resourceTypeId,
        resourceTypeSlug: "bowling-lane",
        resourceTypeName: "Bowling Lane",
        quantityRule: "PER_GUESTS" as const,
        quantity,
        guestsPerUnit: 6,
        durationMinutes: 60,
        inventoryConfigured: true,
        requiresStaffConfiguration: false,
      });

      const alphaCheck = await checkResourceAvailability(db, {
        organizationId: alpha.id,
        locationId: alpha.locations[0]?.id,
        date: "2026-10-15",
        startTime: "18:00",
        durationMinutes: 60,
        resourceRequirements: [requirement(alpha.id, alphaBowling.id, 2)],
      });
      const betaCheck = await checkResourceAvailability(db, {
        organizationId: beta.id,
        locationId: beta.locations[0]?.id,
        date: "2026-10-15",
        startTime: "18:00",
        durationMinutes: 60,
        resourceRequirements: [requirement(beta.id, betaBowling.id, 2)],
      });
      expect(alphaCheck.available).toBe(false);
      expect(betaCheck.available).toBe(true);

      const crossTenant = await checkResourceAvailability(db, {
        organizationId: beta.id,
        locationId: beta.locations[0]?.id,
        date: "2026-10-15",
        startTime: "18:00",
        durationMinutes: 60,
        resourceRequirements: [requirement(beta.id, alphaBowling.id, 1)],
      });
      expect(crossTenant.validated).toBe(false);
      expect(crossTenant.types[0]?.availableQuantity).not.toBe(8);
      expect(crossTenant.types[0]?.inventoryConfigured).toBe(false);

      const second = await db.location.create({
        data: {
          organizationId: alpha.id,
          name: "North Campus",
          slug: "north",
          timezone: "UTC",
        },
      });
      await db.resource.create({
        data: {
          organizationId: alpha.id,
          resourceTypeId: alphaBowling.id,
          locationId: second.id,
          name: "North Lane 1",
          displayOrder: 90,
          capacity: 6,
          active: true,
        },
      });
      const loc2Check = await checkResourceAvailability(db, {
        organizationId: alpha.id,
        locationId: second.id,
        date: "2026-10-16",
        startTime: "18:00",
        durationMinutes: 60,
        resourceRequirements: [requirement(alpha.id, alphaBowling.id, 2)],
      });
      expect(loc2Check.available).toBe(false);
      expect(loc2Check.types[0]?.availableQuantity).toBe(1);

      const loc1Check = await checkResourceAvailability(db, {
        organizationId: alpha.id,
        locationId: alpha.locations[0]?.id,
        date: "2026-10-16",
        startTime: "18:00",
        durationMinutes: 60,
        resourceRequirements: [requirement(alpha.id, alphaBowling.id, 2)],
      });
      expect(loc1Check.available).toBe(true);

      const alphaProduct = await db.product.findFirstOrThrow({
        where: { organizationId: alpha.id, slug: "laser-tag" },
      });
      const betaCreated = await createPublicInquiry(
        db,
        intake(beta.slug, {
          guestCount: 12,
          guestMix: "mostly_children",
          attractionInterestIds: [alphaProduct.id],
          attractionMode: "known",
        }),
        undefined,
        unlimitedLimiter,
      );
      const betaPlan = await db.eventPlanRecommendation.findFirstOrThrow({
        where: { inquiryId: betaCreated.inquiryId },
      });
      expect(JSON.stringify(betaPlan.payload)).not.toContain(alphaProduct.id);
      expect(JSON.stringify(betaPlan.payload)).not.toMatch(/laser-tag/);

      const betaCatalog = await loadCatalogForProposal(db, beta.id, beta.locations[0]?.id);
      expect(betaCatalog.products.every((row) => !row.slug.includes("axe"))).toBe(true);
      expect(betaCatalog.products.some((row) => row.slug === "trampoline")).toBe(true);
    },
    60_000,
  );
});
