import { afterAll, afterEach, describe, expect, it } from "vitest";

import { createMemoryRateLimiter } from "@/lib/ai/rate-limiter";
import { loadCatalogForProposal } from "@/server/catalog/load-for-proposal";
import { InquiryError, isInquiryError } from "@/server/errors";
import { importBookingCatalog } from "@/server/services/catalog-import-service";
import { createPublicInquiry } from "@/server/services/inquiry-service";
import { provisionOrganization } from "@/server/services/provision-organization";
import { INQUIRY_AUDIENCES } from "@/types/catalog";
import { TENANT_ALPHA_DATASET } from "../fixtures/tenant-alpha-beta-catalogs";
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

function datasetWithBowlingGrant() {
  return {
    ...TENANT_ALPHA_DATASET,
    products: TENANT_ALPHA_DATASET.products.map((product) =>
      product.slug === "bowling-1h"
        ? {
            ...product,
            coverage: [
              {
                experienceKey: "bowling",
                kind: "ACTIVITY" as const,
                durationMinutesPerParticipant: 60,
                participantRule: "ALL_GUESTS" as const,
                requiresParticipantBreakdown: false,
                optionalBenefit: false,
              },
            ],
          }
        : product,
    ),
    recommendationProfiles: TENANT_ALPHA_DATASET.recommendationProfiles.map((row) =>
      row.audience === INQUIRY_AUDIENCES.MIXED
        ? {
            ...row,
            payload: {
              ...row.payload,
              requireExplicitAttractions: true,
              defaultAttractionSlugs: [],
            },
          }
        : row,
    ),
  };
}

describe("experience grants", () => {
  it("stores coverage on the importing tenant and requires a mixed attraction when configured", async () => {
    const slug = `grants-${crypto.randomUUID()}`;
    const provisioned = await provisionOrganization(
      {
        clerkUserId: `user_grants_${crypto.randomUUID()}`,
        clerkOrganizationId: `clerk_org_grants_${crypto.randomUUID()}`,
        organizationName: "Grant Tenant",
        organizationSlug: slug,
        isClerkOrganizationAdmin: true,
      },
      db,
    );
    createdOrganizationIds.push(provisioned.organizationId);
    const other = await provisionOrganization(
      {
        clerkUserId: `user_grants_other_${crypto.randomUUID()}`,
        clerkOrganizationId: `clerk_org_grants_other_${crypto.randomUUID()}`,
        organizationName: "Other Grant Tenant",
        organizationSlug: `grants-other-${crypto.randomUUID()}`,
        isClerkOrganizationAdmin: true,
      },
      db,
    );
    createdOrganizationIds.push(other.organizationId);
    const organization = await db.organization.findFirstOrThrow({
      where: { id: provisioned.organizationId },
      select: { id: true, slug: true },
    });

    await importBookingCatalog(db, { organizationSlug: organization.slug, dataset: datasetWithBowlingGrant() });

    const grants = await db.productExperienceGrant.findMany({ where: { organizationId: organization.id } });
    expect(grants).toHaveLength(1);
    expect(grants[0]?.experienceKey).toBe("bowling");
    expect(grants[0]?.durationMinutesPerParticipant).toBe(60);
    expect(await db.productExperienceGrant.count({ where: { organizationId: other.organizationId } })).toBe(0);

    const loaded = await loadCatalogForProposal(db, organization.id);
    const bowling = loaded.products.find((row) => row.slug === "bowling-1h");
    expect(bowling?.experienceGrants?.[0]?.organizationId).toBe(organization.id);
    expect(bowling?.experienceGrants?.[0]?.experienceKey).toBe("bowling");
    const otherLoaded = await loadCatalogForProposal(db, other.organizationId);
    expect(otherLoaded.products.some((row) => row.experienceGrants?.some((grant) => grant.experienceKey === "bowling"))).toBe(false);

    const email = `ada.${crypto.randomUUID()}@example.com`;
    await expect(
      createPublicInquiry(
        db,
        {
          organizationSlug: organization.slug,
          rateLimitKey: `${slug}:${email}`,
          firstName: "Ada",
          lastName: "Lovelace",
          email,
          eventType: "Birthday Party",
          preferredDate: "2026-10-15",
          startTime: "18:00",
          guestCount: 12,
          guestMix: "mixed_ages",
          desiredDurationMinutes: 120,
          budgetBand: "1500_3000",
          eventGoal: "Celebration",
          diningPreference: "not_sure",
          spacePreference: "no_preference",
          attractionInterestIds: [],
          submissionId: `sub_${crypto.randomUUID()}`,
        },
        undefined,
        unlimitedLimiter,
      ),
    ).rejects.toBeInstanceOf(InquiryError);

    try {
      await createPublicInquiry(
        db,
        {
          organizationSlug: organization.slug,
          rateLimitKey: `${slug}:again:${email}`,
          firstName: "Ada",
          lastName: "Lovelace",
          email,
          eventType: "Birthday Party",
          preferredDate: "2026-10-15",
          startTime: "18:00",
          guestCount: 12,
          guestMix: "mostly_adults",
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
    } catch (error) {
      expect(isInquiryError(error)).toBe(false);
      throw error;
    }
  }, 90_000);
});
