import { afterAll, afterEach, describe, expect, it } from "vitest";

import { createMemoryRateLimiter } from "@/lib/ai/rate-limiter";
import { READY_FOR_HUMAN_REASONS } from "@/lib/inquiries/ready-for-human-reason";
import { parseWpIntakeMessageMetadata } from "@/lib/event-planner/wp-intake-contract";
import { createPublicWpEventInquiry } from "@/server/services/inquiry-service";
import { provisionOrganization } from "@/server/services/provision-organization";
import { INQUIRY_SALES_STAGES, INQUIRY_STATUSES } from "@/types/inquiry";
import { deleteTestOrganizations } from "../helpers/cleanup-test-organizations";
import { createTestPrismaClient } from "../helpers/test-database";
import { futureEventDate } from "../helpers/future-event-date";

const EVENT_DATE = futureEventDate(28);

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

describe("createPublicWpEventInquiry thank-you path", () => {
  it("persists staff follow-up inquiry without bookings or public package generation", async () => {
    const slug = `wp-intake-${crypto.randomUUID()}`;
    const provisioned = await provisionOrganization(
      {
        clerkUserId: `user_wp_${crypto.randomUUID()}`,
        clerkOrganizationId: `clerk_org_wp_${crypto.randomUUID()}`,
        organizationName: "WP Intake Org",
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
    const email = `wp.${crypto.randomUUID()}@example.com`;

    const created = await createPublicWpEventInquiry(
      db,
      {
        organizationSlug: organization.slug,
        rateLimitKey: `${slug}:${email}`,
        firstName: "Ada",
        lastName: "Lovelace",
        company: "Analytical Engines",
        phone: "5745550100",
        email,
        eventType: "Birthday",
        dates: [EVENT_DATE, futureEventDate(35)],
        time: "17:00",
        adults: 12,
        children: 8,
        duration: "2 hours",
        attractions: {
          bowling: "yes",
          axe: "no",
          laser: "open",
          golf: "no",
          climbing: "open",
          arcade: "yes",
        },
        food: "yes",
        privateRoom: "yes",
        craft: "no",
        hasBudget: "yes",
        budget: 3200,
        description: "Birthday celebration with bowling and arcade.",
        comments: "Need a cake table.",
        referral: "Instagram",
        submissionId: `sub_wp_${crypto.randomUUID()}`,
      },
      unlimitedLimiter,
    );

    const inquiry = await db.inquiry.findFirstOrThrow({
      where: { id: created.inquiryId },
      include: {
        conversations: { include: { messages: true } },
        eventPlanRecommendations: true,
        bookings: true,
      },
    });

    expect(inquiry.status).toBe(INQUIRY_STATUSES.READY_FOR_HUMAN);
    expect(inquiry.salesStage).toBe(INQUIRY_SALES_STAGES.INQUIRY);
    expect(inquiry.humanHandoffReason).toBe(READY_FOR_HUMAN_REASONS.PUBLIC_EVENT_REQUEST);
    expect(inquiry.adultGuestCount).toBe(12);
    expect(inquiry.childGuestCount).toBe(8);
    expect(inquiry.guestCount).toBe(20);
    expect(inquiry.desiredDurationMinutes).toBe(120);
    expect(inquiry.budgetMax).toBe(320_000);
    expect(inquiry.diningPreference).toBe("WANTS_FOOD");
    expect(inquiry.spacePreference).toBe("private");
    expect(inquiry.bookings).toHaveLength(0);
    expect(inquiry.eventPlanRecommendations).toHaveLength(0);

    const message = inquiry.conversations[0]?.messages[0];
    expect(message).toBeTruthy();
    const metadata = parseWpIntakeMessageMetadata(message?.metadata);
    expect(metadata?.intakeVersion).toBe("wp-3.3.0");
    expect(metadata?.answers.dates).toEqual([EVENT_DATE, futureEventDate(35)]);
    expect(metadata?.answers.attractions.bowling).toBe("yes");
    expect(metadata?.answers.referral).toBe("Instagram");
    expect(metadata?.privateCalculation.status).toBe("ready");
    expect(metadata?.privateCalculation.pricingSource).toBe("plugin_defaults");
    expect(metadata?.privateCalculation.snapshot).toBeTruthy();
    const snapshot = metadata?.privateCalculation.snapshot as {
      valid?: boolean;
      dates?: Array<{ recommendation?: { total_cents?: number; name?: string } }>;
    };
    expect(snapshot.valid).toBe(true);
    expect(snapshot.dates?.[0]?.recommendation?.total_cents).toBeGreaterThan(0);
    expect(created.publicToken.length).toBeGreaterThan(10);
    expect(created.privateCalculationStatus).toBe("ready");
  }, 90_000);
});
