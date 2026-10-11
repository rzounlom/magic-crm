import { afterAll, afterEach, describe, expect, it } from "vitest";

import { createMemoryRateLimiter } from "@/lib/ai/rate-limiter";
import { InquiryError } from "@/server/errors";
import { getPublicEventPlanByToken } from "@/server/services/event-plan-service";
import { createPublicInquiry } from "@/server/services/inquiry-service";
import { provisionOrganization } from "@/server/services/provision-organization";
import { createSalesKnowledgeItem } from "@/server/services/sales-knowledge-service";
import { resolveRequestContext } from "@/server/request-context";
import { SALES_KNOWLEDGE_TYPES } from "@/types/inquiry";
import { deleteTestOrganizations } from "../helpers/cleanup-test-organizations";
import { createTestPrismaClient } from "../helpers/test-database";

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

describe("proposal token fixture (postgres)", () => {
  it("creates a tenant-scoped public plan token with payment-neutral recommendations", async () => {
    const provisioned = await provisionOrganization(
      {
        clerkUserId: `user_r1_plan_${crypto.randomUUID()}`,
        clerkOrganizationId: `clerk_org_r1_plan_${crypto.randomUUID()}`,
        organizationName: "R1 Proposal Fixture",
        organizationSlug: `r1-proposal-${crypto.randomUUID()}`,
        isClerkOrganizationAdmin: true,
      },
      db,
    );
    createdOrganizationIds.push(provisioned.organizationId);

    const organization = await db.organization.findFirstOrThrow({
      where: { id: provisioned.organizationId },
    });
    const profile = await db.userProfile.findFirstOrThrow({
      where: { id: provisioned.userProfileId },
    });
    const ctx = await resolveRequestContext(
      {
        clerkUserId: profile.clerkUserId,
        clerkOrganizationId: organization.clerkOrganizationId,
      },
      db,
    );

    for (const name of ["Bowling", "Laser Tag", "Mini Golf"] as const) {
      await createSalesKnowledgeItem(ctx, db, {
        type: SALES_KNOWLEDGE_TYPES.ATTRACTION,
        name,
        shortDescription: name,
        details: `${name} for parties.`,
        priceText: "$10/person",
        maxGuests: 12,
        durationMinutes: 60,
        active: true,
      });
    }

    const email = `r1.plan.${crypto.randomUUID()}@example.com`;
    const created = await createPublicInquiry(
      db,
      {
        organizationSlug: organization.slug,
        rateLimitKey: `r1-plan:${email}`,
        firstName: "R1",
        lastName: "Plan",
        email,
        eventType: "Birthday Party",
        preferredDate: "2026-11-15",
        startTime: "18:00",
        guestCount: 12,
        guestMix: "mixed_ages",
        desiredDurationMinutes: 180,
        budgetBand: "1500_3000",
        eventGoal: "Celebration",
        diningPreference: "not_sure",
        spacePreference: "semi_private",
        attractionInterestIds: [],
        submissionId: `r1_plan_${crypto.randomUUID()}`,
      },
      undefined,
      unlimitedLimiter,
    );

    expect(created.publicToken.length).toBeGreaterThan(10);

    const view = await getPublicEventPlanByToken(db, created.publicToken);
    expect(view.organizationSlug).toBe(organization.slug);
    expect(view.plans.length).toBeGreaterThanOrEqual(1);

    const serialized = JSON.stringify(view);
    expect(serialized).not.toMatch(/stripe|payment.?intent|card number|cvv/i);
    expect(serialized.toLowerCase()).not.toContain("pay now");

    await expect(getPublicEventPlanByToken(db, `${created.publicToken}x`)).rejects.toBeInstanceOf(
      InquiryError,
    );

    const other = await provisionOrganization(
      {
        clerkUserId: `user_r1_other_${crypto.randomUUID()}`,
        clerkOrganizationId: `clerk_org_r1_other_${crypto.randomUUID()}`,
        organizationName: "R1 Other Tenant",
        organizationSlug: `r1-other-${crypto.randomUUID()}`,
        isClerkOrganizationAdmin: true,
      },
      db,
    );
    createdOrganizationIds.push(other.organizationId);

    // Token remains bound to the originating tenant slug.
    const again = await getPublicEventPlanByToken(db, created.publicToken);
    expect(again.organizationSlug).toBe(organization.slug);
    expect(again.organizationSlug).not.toBe(
      (
        await db.organization.findFirstOrThrow({ where: { id: other.organizationId } })
      ).slug,
    );
  });
});
