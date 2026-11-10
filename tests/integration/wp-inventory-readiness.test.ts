import { afterAll, afterEach, describe, expect, it } from "vitest";

import { createMemoryRateLimiter } from "@/lib/ai/rate-limiter";
import { assertApprovedQuoteAmountsConsistent } from "@/lib/inquiries/approved-quote-amounts";
import { depositPercentFromTenant, depositRequiredCents } from "@/server/catalog/pricing";
import { loadBookingCatalogDataset } from "@/server/catalog/load-dataset";
import {
  buildWpDraftResourceRequirements,
  summarizeWpInventoryCoverage,
} from "@/server/event-planner/wp-parity/inventory-mapping";
import { readEventPlanPayload } from "@/lib/event-planner/payload";
import { importBookingCatalog } from "@/server/services/catalog-import-service";
import { createPublicWpEventInquiry } from "@/server/services/inquiry-service";
import {
  lineItemsFromPayload,
} from "@/server/services/pending-booking-service";
import { provisionOrganization } from "@/server/services/provision-organization";
import {
  checkResourceAvailability,
} from "@/server/services/resource-availability-service";
import { resolveRequestContext } from "@/server/request-context";
import { createWpStaffQuoteDraftFromInquiry } from "@/server/services/wp-staff-quote-draft-service";
import { EVENT_PLAN_KINDS } from "@/types/inquiry";
import {
  RESOURCE_RESERVATION_SOURCES,
  RESOURCE_RESERVATION_STATUSES,
} from "@/types/resource-schedule";
import { deleteTestOrganizations } from "../helpers/cleanup-test-organizations";
import { futureEventDate } from "../helpers/future-event-date";
import { createTestPrismaClient } from "../helpers/test-database";

const EVENT_DATE = futureEventDate(35);
const db = createTestPrismaClient();
const createdOrganizationIds: string[] = [];
const unlimitedLimiter = createMemoryRateLimiter();

afterEach(async () => {
  await deleteTestOrganizations(db, createdOrganizationIds);
  createdOrganizationIds.length = 0;
});

afterAll(async () => {
  await db.$disconnect();
});

async function provisionTenant(suffix: string) {
  const result = await provisionOrganization(
    {
      clerkUserId: `user_wp_inv_${suffix}_${crypto.randomUUID()}`,
      clerkOrganizationId: `clerk_org_wp_inv_${suffix}_${crypto.randomUUID()}`,
      organizationName: `WP Inventory ${suffix}`,
      organizationSlug: `wp-inv-${suffix}-${crypto.randomUUID()}`,
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

describe("WP inventory readiness (Generations-like catalog)", () => {
  it("maps WP attractions to imported Generations resource types and checks availability without holds", async () => {
    const tenant = await provisionTenant("map");
    await importBookingCatalog(db, {
      organizationSlug: tenant.organization.slug,
      dataset: loadBookingCatalogDataset(),
    });

    const resourceTypes = await db.resourceType.findMany({
      where: { organizationId: tenant.organizationId, active: true },
      select: {
        id: true,
        slug: true,
        name: true,
        inventoryConfigured: true,
        active: true,
      },
    });
    const coverage = summarizeWpInventoryCoverage({ resourceTypes });
    expect(coverage.attractions.find((row) => row.attraction === "bowling")?.matchedSlug).toBe(
      "bowling-lane",
    );
    expect(coverage.attractions.find((row) => row.attraction === "axe")?.matchedSlug).toBe(
      "axe-throwing-lane",
    );
    expect(coverage.attractions.find((row) => row.attraction === "laser")?.matchedSlug).toBe(
      "laser-tag-arena",
    );
    expect(coverage.attractions.find((row) => row.attraction === "golf")?.matchedSlug).toBe(
      "mini-golf-course",
    );
    expect(coverage.attractions.find((row) => row.attraction === "climbing")?.matchedSlug).toBe(
      "climbing-area",
    );
    expect(coverage.attractions.find((row) => row.attraction === "arcade")?.covered).toBe(false);

    const built = buildWpDraftResourceRequirements({
      selectedAttractions: ["bowling", "axe", "laser"],
      guestCount: 12,
      durationMinutes: 120,
      resourceTypes,
    });
    expect(built.unmappedReservableAttractions).toEqual([]);
    expect(built.requirements.map((row) => row.resourceTypeSlug).sort()).toEqual([
      "axe-throwing-lane",
      "bowling-lane",
      "laser-tag-arena",
    ]);

    const holdsBefore = await db.resourceReservation.count({
      where: {
        organizationId: tenant.organizationId,
        status: {
          in: [RESOURCE_RESERVATION_STATUSES.HOLD, RESOURCE_RESERVATION_STATUSES.BOOKED],
        },
      },
    });

    const availability = await checkResourceAvailability(db, {
      organizationId: tenant.organizationId,
      locationId: tenant.locationId,
      date: EVENT_DATE,
      startTime: "14:00",
      durationMinutes: 120,
      resourceRequirements: built.requirements,
    });
    expect(availability.validated).toBe(true);
    expect(availability.available).toBe(true);

    const holdsAfter = await db.resourceReservation.count({
      where: {
        organizationId: tenant.organizationId,
        status: {
          in: [RESOURCE_RESERVATION_STATUSES.HOLD, RESOURCE_RESERVATION_STATUSES.BOOKED],
        },
      },
    });
    expect(holdsAfter).toBe(holdsBefore);
  }, 90_000);

  it("attaches mapped requirements on WP staff drafts and preserves approved cents into booking lines", async () => {
    const tenant = await provisionTenant("draft");
    await importBookingCatalog(db, {
      organizationSlug: tenant.organization.slug,
      dataset: loadBookingCatalogDataset(),
    });

    const created = await createPublicWpEventInquiry(
      db,
      {
        organizationSlug: tenant.organization.slug,
        rateLimitKey: `${tenant.organization.slug}:inv`,
        firstName: "Inv",
        lastName: "Ready",
        company: "Inventory Co",
        phone: "5745550199",
        email: `inv.${crypto.randomUUID()}@example.test`,
        eventType: "Corporate or Team Event",
        dates: [EVENT_DATE],
        time: "14:00",
        adults: 12,
        children: 0,
        duration: "2 hours",
        attractions: {
          bowling: "yes",
          axe: "yes",
          laser: "no",
          golf: "no",
          climbing: "no",
          arcade: "no",
        },
        food: "no",
        privateRoom: "no",
        craft: "no",
        hasBudget: "no",
        description: "Inventory readiness",
        comments: null,
        referral: "QA",
        submissionId: `sub_inv_${crypto.randomUUID()}`,
      },
      unlimitedLimiter,
    );

    const draft = await createWpStaffQuoteDraftFromInquiry(tenant.ctx, db, created.inquiryId);
    const working = await db.eventPlanRecommendation.findFirstOrThrow({
      where: { id: draft.planId, kind: EVENT_PLAN_KINDS.AGENT_WORKING },
    });
    const payload = readEventPlanPayload(working.payload);
    const slugs = (payload.resourceRequirements ?? []).map((row) => row.resourceTypeSlug).sort();
    expect(slugs).toEqual(["axe-throwing-lane", "bowling-lane"]);

    const amountCheck = assertApprovedQuoteAmountsConsistent({
      estimatedTotalCents: working.estimatedTotalCents,
      payload: {
        ...payload,
        employeeApprovedQuote: {
          marker: "employee_approved_wordpress_quote",
          approvedAt: new Date().toISOString(),
          availabilityConfirmed: true,
          availabilityNote: "ok",
        },
      },
      onlyForEmployeeApprovedQuote: true,
    });
    expect(amountCheck.ok).toBe(true);
    if (!amountCheck.ok) {
      throw new Error(amountCheck.error);
    }
    const items = lineItemsFromPayload(payload);
    expect(items.reduce((sum, row) => sum + row.totalCents, 0)).toBe(amountCheck.totalCents);
    const depositPercent = depositPercentFromTenant(tenant.organization.depositPercent);
    expect(depositRequiredCents(amountCheck.totalCents, depositPercent)).toBeGreaterThan(0);
  }, 90_000);

  it("reports unavailable overlapping lane demand without writing holds", async () => {
    const tenant = await provisionTenant("overlap");
    await importBookingCatalog(db, {
      organizationSlug: tenant.organization.slug,
      dataset: loadBookingCatalogDataset(),
    });
    const bowling = await db.resourceType.findFirstOrThrow({
      where: { organizationId: tenant.organizationId, slug: "bowling-lane" },
      include: { resources: true },
    });
    expect(bowling.resources.length).toBe(8);

    // Occupy all 8 lanes with a BOOKED reservation window.
    await db.resourceReservation.createMany({
      data: bowling.resources.map((resource) => ({
        organizationId: tenant.organizationId,
        locationId: tenant.locationId,
        resourceId: resource.id,
        status: RESOURCE_RESERVATION_STATUSES.BOOKED,
        sourceType: RESOURCE_RESERVATION_SOURCES.BOOKING,
        startMinute: 14 * 60,
        endMinute: 16 * 60,
        slotDate: new Date(`${EVENT_DATE}T00:00:00.000Z`),
      })),
    });

    const built = buildWpDraftResourceRequirements({
      selectedAttractions: ["bowling"],
      guestCount: 12,
      durationMinutes: 120,
      resourceTypes: [
        {
          id: bowling.id,
          slug: bowling.slug,
          name: bowling.name,
          inventoryConfigured: bowling.inventoryConfigured,
          active: bowling.active,
        },
      ],
    });
    const availability = await checkResourceAvailability(db, {
      organizationId: tenant.organizationId,
      locationId: tenant.locationId,
      date: EVENT_DATE,
      startTime: "14:00",
      durationMinutes: 120,
      resourceRequirements: built.requirements,
      timeZone: "America/Indiana/Indianapolis",
    });
    // Conflict path: either fully validated unavailable, or type-level conflict flags.
    expect(
      availability.available === false ||
        availability.types.some((row) => row.conflict || (row.availableQuantity ?? 1) === 0),
    ).toBe(true);
    const holdCount = await db.resourceReservation.count({
      where: {
        organizationId: tenant.organizationId,
        status: RESOURCE_RESERVATION_STATUSES.HOLD,
      },
    });
    expect(holdCount).toBe(0);
  }, 90_000);
});
