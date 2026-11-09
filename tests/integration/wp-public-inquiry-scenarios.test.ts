import { afterAll, afterEach, describe, expect, it } from "vitest";

import { createMemoryRateLimiter } from "@/lib/ai/rate-limiter";
import { parseWpIntakeMessageMetadata } from "@/lib/event-planner/wp-intake-contract";
import { createPublicWpEventInquiry } from "@/server/services/inquiry-service";
import { provisionOrganization } from "@/server/services/provision-organization";
import { INQUIRY_SALES_STAGES, INQUIRY_STATUSES } from "@/types/inquiry";
import { deleteTestOrganizations } from "../helpers/cleanup-test-organizations";
import { createTestPrismaClient } from "../helpers/test-database";
import { futureEventDate } from "../helpers/future-event-date";

const EVENT_DATE = futureEventDate(21);

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

async function provisionSlug(prefix: string) {
  const slug = `${prefix}-${crypto.randomUUID()}`;
  const provisioned = await provisionOrganization(
    {
      clerkUserId: `user_${prefix}_${crypto.randomUUID()}`,
      clerkOrganizationId: `clerk_org_${prefix}_${crypto.randomUUID()}`,
      organizationName: `WP Scenario ${prefix}`,
      organizationSlug: slug,
      isClerkOrganizationAdmin: true,
    },
    db,
  );
  createdOrganizationIds.push(provisioned.organizationId);
  return { slug, organizationId: provisioned.organizationId };
}

async function loadInquiry(inquiryId: string) {
  return db.inquiry.findFirstOrThrow({
    where: { id: inquiryId },
    include: {
      conversations: { include: { messages: true } },
      eventPlanRecommendations: true,
      bookings: true,
    },
  });
}

function snapshotOf(inquiry: Awaited<ReturnType<typeof loadInquiry>>) {
  const metadata = parseWpIntakeMessageMetadata(inquiry.conversations[0]?.messages[0]?.metadata);
  expect(metadata).toBeTruthy();
  return metadata!;
}

describe("WP public inquiry end-to-end scenarios", () => {
  it("Scenario A — birthday bowling-only with food, thank-you path only", async () => {
    const { slug } = await provisionSlug("a");
    const created = await createPublicWpEventInquiry(
      db,
      {
        organizationSlug: slug,
        rateLimitKey: `${slug}:a`,
        firstName: "Sam",
        lastName: "Birthday",
        company: "Family",
        phone: "5745550101",
        email: `a.${crypto.randomUUID()}@example.com`,
        eventType: "Birthday",
        dates: [EVENT_DATE],
        time: "14:00",
        adults: 20,
        children: 0,
        duration: "3 hours",
        attractions: {
          bowling: "yes",
          axe: "no",
          laser: "no",
          golf: "no",
          climbing: "no",
          arcade: "no",
        },
        food: "yes",
        privateRoom: "no",
        craft: "no",
        hasBudget: "no",
        description: "Twentieth birthday bowling party",
        referral: "Friend",
        submissionId: `sub_a_${crypto.randomUUID()}`,
      },
      unlimitedLimiter,
    );

    const inquiry = await loadInquiry(created.inquiryId);
    expect(inquiry.status).toBe(INQUIRY_STATUSES.READY_FOR_HUMAN);
    expect(inquiry.salesStage).toBe(INQUIRY_SALES_STAGES.INQUIRY);
    expect(inquiry.bookings).toHaveLength(0);
    expect(inquiry.eventPlanRecommendations).toHaveLength(0);
    expect(inquiry.adultGuestCount).toBe(20);
    expect(inquiry.diningPreference).toBe("WANTS_FOOD");

    const meta = snapshotOf(inquiry);
    expect(meta.answers.attractions.axe).toBe("no");
    expect(meta.privateCalculation.pricingSource).toBe("plugin_defaults");
    expect(["ready", "incomplete"]).toContain(meta.privateCalculation.status);
    expect(meta.privateCalculation.snapshot).toBeTruthy();
    const snap = meta.privateCalculation.snapshot as {
      valid?: boolean;
      pricing_source?: string;
      dates?: Array<{ recommendation: { selected_attractions: string[]; dining_minutes: number; total_cents: number } }>;
    };
    expect(snap.valid).toBe(true);
    expect(snap.pricing_source).toBe("plugin_defaults");
    expect(snap.dates?.[0]?.recommendation.selected_attractions).toEqual(["bowling"]);
    expect(snap.dates?.[0]?.recommendation.total_cents).toBeGreaterThan(0);
    // 20 adults + pizza_wings default for adults-only → dining block required (not lane exception ≤25 alone with pizza path may vary)
    expect(typeof snap.dates?.[0]?.recommendation.dining_minutes).toBe("number");
  }, 90_000);

  it("Scenario B — corporate bowling + axe with open attractions", async () => {
    const { slug } = await provisionSlug("b");
    const created = await createPublicWpEventInquiry(
      db,
      {
        organizationSlug: slug,
        rateLimitKey: `${slug}:b`,
        firstName: "Casey",
        lastName: "Corp",
        company: "Acme Team",
        phone: "5745550102",
        email: `b.${crypto.randomUUID()}@example.com`,
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
          climbing: "open",
          arcade: "open",
        },
        food: "yes",
        privateRoom: "no",
        craft: "no",
        hasBudget: "no",
        description: "Corporate outing",
        referral: "Website",
        submissionId: `sub_b_${crypto.randomUUID()}`,
      },
      unlimitedLimiter,
    );

    const inquiry = await loadInquiry(created.inquiryId);
    expect(inquiry.bookings).toHaveLength(0);
    expect(inquiry.eventPlanRecommendations).toHaveLength(0);
    expect(inquiry.status).toBe(INQUIRY_STATUSES.READY_FOR_HUMAN);

    const meta = snapshotOf(inquiry);
    expect(meta.privateCalculation.pricingSource).toBe("plugin_defaults");
    const snap = meta.privateCalculation.snapshot as {
      valid?: boolean;
      dates?: Array<{
        recommendation: {
          selected_attractions: string[];
          review: string[];
          required_minutes: number;
          total_cents: number;
        };
      }>;
    };
    expect(snap.valid).toBe(true);
    const main = snap.dates?.[0]?.recommendation;
    expect(main?.selected_attractions).toEqual(expect.arrayContaining(["bowling", "axe"]));
    expect(main?.selected_attractions).not.toContain("laser"); // open may be suggested in alts, main may include preferred
    expect(main?.total_cents).toBeGreaterThan(0);
    expect(Array.isArray(main?.review)).toBe(true);
    expect(main?.required_minutes).toBeGreaterThan(0);
  }, 90_000);

  it("Scenario C — mixed-age open attractions with private room", async () => {
    const { slug } = await provisionSlug("c");
    const created = await createPublicWpEventInquiry(
      db,
      {
        organizationSlug: slug,
        rateLimitKey: `${slug}:c`,
        firstName: "Jordan",
        lastName: "Mixed",
        company: "Community Group",
        phone: "5745550103",
        email: `c.${crypto.randomUUID()}@example.com`,
        eventType: "Family or Social Gathering",
        dates: [EVENT_DATE],
        time: "11:00",
        adults: 15,
        children: 20,
        duration: "3 hours",
        attractions: {
          bowling: "open",
          axe: "open",
          laser: "open",
          golf: "open",
          climbing: "open",
          arcade: "open",
        },
        food: "yes",
        privateRoom: "yes",
        craft: "no",
        hasBudget: "no",
        description: "Mixed-age celebration",
        referral: "School",
        submissionId: `sub_c_${crypto.randomUUID()}`,
      },
      unlimitedLimiter,
    );

    const inquiry = await loadInquiry(created.inquiryId);
    expect(inquiry.bookings).toHaveLength(0);
    expect(inquiry.eventPlanRecommendations).toHaveLength(0);
    expect(inquiry.adultGuestCount).toBe(15);
    expect(inquiry.childGuestCount).toBe(20);
    expect(inquiry.spacePreference).toBe("private");
    expect(inquiry.status).toBe(INQUIRY_STATUSES.READY_FOR_HUMAN);

    const meta = snapshotOf(inquiry);
    expect(meta.privateCalculation.pricingSource).toBe("plugin_defaults");
    const snap = meta.privateCalculation.snapshot as {
      valid?: boolean;
      dates?: Array<{
        recommendation: {
          review: string[];
          selected_attractions: string[];
          total_cents: number;
          items: Array<{ label: string }>;
        };
      }>;
    };
    expect(snap.valid).toBe(true);
    const main = snap.dates?.[0]?.recommendation;
    expect(main?.total_cents).toBeGreaterThan(0);
    expect(main?.review.some((r) => /axe|climbing|laser|room|age|weight|4\+/i.test(r))).toBe(true);
    expect(main?.items.some((i) => /room|Skybox|Cove|Lower/i.test(i.label))).toBe(true);
  }, 90_000);
});
