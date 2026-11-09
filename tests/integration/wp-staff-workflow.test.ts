import { afterAll, afterEach, describe, expect, it } from "vitest";

import { createMemoryRateLimiter } from "@/lib/ai/rate-limiter";
import { parseWpIntakeMessageMetadata } from "@/lib/event-planner/wp-intake-contract";
import { READY_FOR_HUMAN_REASONS } from "@/lib/inquiries/ready-for-human-reason";
import { createPublicWpEventInquiry } from "@/server/services/inquiry-service";
import { provisionOrganization } from "@/server/services/provision-organization";
import { INQUIRY_SALES_STAGES, INQUIRY_STATUSES } from "@/types/inquiry";
import { deleteTestOrganizations } from "../helpers/cleanup-test-organizations";
import { futureEventDate } from "../helpers/future-event-date";
import { createTestPrismaClient } from "../helpers/test-database";

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

describe("WP staff workflow — corporate synthetic inquiry", () => {
  it("persists answers and private calc for employee review without booking", async () => {
    const slug = `wp-staff-${crypto.randomUUID()}`;
    const provisioned = await provisionOrganization(
      {
        clerkUserId: `user_wp_staff_${crypto.randomUUID()}`,
        clerkOrganizationId: `clerk_org_wp_staff_${crypto.randomUUID()}`,
        organizationName: "WP Staff Workflow Org",
        organizationSlug: slug,
        isClerkOrganizationAdmin: true,
      },
      db,
    );
    createdOrganizationIds.push(provisioned.organizationId);

    const created = await createPublicWpEventInquiry(
      db,
      {
        organizationSlug: slug,
        rateLimitKey: `${slug}:corp`,
        firstName: "Synth",
        lastName: "Corporate",
        company: "Acme Synthetic Events LLC",
        phone: "5745550199",
        email: `synth.corp.${crypto.randomUUID()}@example.test`,
        eventType: "Corporate or Team Event",
        dates: [EVENT_DATE],
        time: "13:00",
        adults: 40,
        children: 0,
        duration: "3 hours",
        attractions: {
          bowling: "yes",
          axe: "yes",
          laser: "open",
          golf: "open",
          climbing: "no",
          arcade: "open",
        },
        food: "yes",
        privateRoom: "yes",
        craft: "yes",
        hasBudget: "no",
        description: "Phase 5 employee workflow validation — synthetic corporate outing.",
        comments: "Synthetic test only. No booking.",
        referral: "Internal QA",
        submissionId: `sub_staff_${crypto.randomUUID()}`,
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
    expect(inquiry.adultGuestCount).toBe(40);
    expect(inquiry.childGuestCount).toBe(0);
    expect(inquiry.diningPreference).toBe("WANTS_FOOD");
    expect(inquiry.spacePreference).toBe("private");
    expect(inquiry.bookings).toHaveLength(0);
    expect(inquiry.eventPlanRecommendations).toHaveLength(0);

    const queueHit = await db.inquiry.findFirst({
      where: {
        organizationId: provisioned.organizationId,
        status: INQUIRY_STATUSES.READY_FOR_HUMAN,
        id: inquiry.id,
      },
      select: { id: true, customerEmail: true, humanHandoffReason: true },
    });
    expect(queueHit?.id).toBe(inquiry.id);

    const meta = parseWpIntakeMessageMetadata(inquiry.conversations[0]?.messages[0]?.metadata);
    expect(meta).toBeTruthy();
    expect(meta!.answers.attractions).toEqual({
      bowling: "yes",
      axe: "yes",
      laser: "open",
      golf: "open",
      climbing: "no",
      arcade: "open",
    });
    expect(meta!.answers.food).toBe("yes");
    expect(meta!.answers.privateRoom).toBe("yes");
    expect(meta!.answers.craft).toBe("yes");
    expect(meta!.privateCalculation.pricingSource).toBe("plugin_defaults");
    expect(["ready", "incomplete"]).toContain(meta!.privateCalculation.status);

    const snap = meta!.privateCalculation.snapshot as {
      valid?: boolean;
      pricing_source?: string;
      dates?: Array<{
        recommendation: {
          name: string;
          total_cents: number;
          selected_attractions: string[];
          review: string[];
          itinerary: Array<{ label: string; start?: string; end?: string }>;
          items: Array<{ label: string; quantity: number; subtotal_cents: number }>;
        };
      }>;
    };
    expect(snap.valid).toBe(true);
    expect(snap.pricing_source).toBe("plugin_defaults");
    const main = snap.dates?.[0]?.recommendation;
    expect(main?.total_cents).toBeGreaterThan(0);
    expect(main?.selected_attractions).toEqual(expect.arrayContaining(["bowling", "axe"]));
    expect(main?.selected_attractions).not.toContain("climbing");
    expect(main?.itinerary?.length).toBeGreaterThan(0);
    expect(main?.items?.length).toBeGreaterThan(0);
    expect(main?.itinerary.some((row) => /bowling/i.test(row.label))).toBe(true);
  }, 90_000);
});
