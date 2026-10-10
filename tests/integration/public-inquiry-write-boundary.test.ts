import { afterAll, afterEach, describe, expect, it } from "vitest";

import { createMemoryRateLimiter } from "@/lib/ai/rate-limiter";
import { createPublicInquiry } from "@/server/services/inquiry-service";
import { provisionOrganization } from "@/server/services/provision-organization";
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

describe("public inquiry nested write", () => {
  it("persists the inquiry, conversation, and intake message without an interactive transaction", async () => {
    const slug = `write-boundary-${crypto.randomUUID()}`;
    const provisioned = await provisionOrganization(
      {
        clerkUserId: `user_write_${crypto.randomUUID()}`,
        clerkOrganizationId: `clerk_org_write_${crypto.randomUUID()}`,
        organizationName: "Write Boundary",
        organizationSlug: slug,
        isClerkOrganizationAdmin: true,
      },
      db,
    );
    createdOrganizationIds.push(provisioned.organizationId);
    const organization = await db.organization.findFirstOrThrow({
      where: { id: provisioned.organizationId },
      select: { slug: true },
    });
    const email = `ada.${crypto.randomUUID()}@example.com`;

    const created = await createPublicInquiry(
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
        guestCount: 20,
        guestMix: "mixed_ages",
        desiredDurationMinutes: 180,
        budgetBand: "1500_3000",
        eventGoal: "Celebration",
        diningPreference: "not_sure",
        spacePreference: "semi_private",
        attractionInterestIds: [],
        submissionId: `sub_${crypto.randomUUID()}`,
      },
      undefined,
      unlimitedLimiter,
    );

    const inquiry = await db.inquiry.findFirstOrThrow({
      where: { id: created.inquiryId },
      include: { conversations: { include: { messages: true } } },
    });
    expect(inquiry.organizationId).toBe(provisioned.organizationId);
    expect(inquiry.desiredStartTime).toBe("18:00");
    expect(inquiry.desiredDurationMinutes).toBe(180);
    expect(inquiry.conversations[0]?.organizationId).toBe(provisioned.organizationId);
    expect(inquiry.conversations[0]?.messages[0]?.organizationId).toBe(provisioned.organizationId);
    expect(inquiry.conversations).toHaveLength(1);
    expect(inquiry.conversations[0]?.id).toBe(created.conversationId);
    expect(inquiry.conversations[0]?.lastMessageAt).toBeTruthy();
    expect(inquiry.conversations[0]?.messages).toHaveLength(1);
    expect(created.publicToken.length).toBeGreaterThan(10);
  }, 90_000);
});
