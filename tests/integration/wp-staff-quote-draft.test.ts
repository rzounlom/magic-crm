import { afterAll, afterEach, describe, expect, it } from "vitest";

import { createMemoryRateLimiter } from "@/lib/ai/rate-limiter";
import { parseWpIntakeMessageMetadata } from "@/lib/event-planner/wp-intake-contract";
import { SYSTEM_GROUP_KEYS } from "@/server/authorization/default-security-groups";
import { AuthorizationError, InquiryError } from "@/server/errors";
import { readWpQuoteDraftProvenance } from "@/server/event-planner/wp-parity";
import { resolveRequestContext } from "@/server/request-context";
import { createPublicWpEventInquiry } from "@/server/services/inquiry-service";
import { createWpStaffQuoteDraftFromInquiry } from "@/server/services/wp-staff-quote-draft-service";
import { provisionOrganization } from "@/server/services/provision-organization";
import {
  EVENT_PLAN_KINDS,
  INQUIRY_SALES_STAGES,
  INQUIRY_STATUSES,
  INQUIRY_WORKFLOW_STAGES,
} from "@/types/inquiry";
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

async function provisionTenant(suffix: string) {
  const result = await provisionOrganization(
    {
      clerkUserId: `user_wp_draft_${suffix}_${crypto.randomUUID()}`,
      clerkOrganizationId: `clerk_org_wp_draft_${suffix}_${crypto.randomUUID()}`,
      organizationName: `WP Draft ${suffix}`,
      organizationSlug: `wp-draft-${suffix}-${crypto.randomUUID()}`,
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

async function addFrontDeskUser(tenant: Awaited<ReturnType<typeof provisionTenant>>) {
  const group = await db.securityGroup.findFirstOrThrow({
    where: { organizationId: tenant.organizationId, systemKey: SYSTEM_GROUP_KEYS.FRONT_DESK },
  });
  const profile = await db.userProfile.create({
    data: {
      organizationId: tenant.organizationId,
      clerkUserId: `user_${crypto.randomUUID()}`,
      defaultLocationId: tenant.locationId,
      email: `front-${crypto.randomUUID()}@example.test`,
      firstName: "Front",
      lastName: "Desk",
    },
  });
  await db.securityGroupMember.create({
    data: {
      organizationId: tenant.organizationId,
      securityGroupId: group.id,
      userProfileId: profile.id,
    },
  });
  const ctx = await resolveRequestContext(
    {
      clerkUserId: profile.clerkUserId,
      clerkOrganizationId: tenant.organization.clerkOrganizationId,
    },
    db,
  );
  return { profile, ctx };
}

describe("WP staff quote draft service", () => {
  it("creates an AGENT_WORKING draft from private WP calc without customer proposal or booking", async () => {
    const tenant = await provisionTenant("create");
    const created = await createPublicWpEventInquiry(
      db,
      {
        organizationSlug: tenant.organization.slug,
        rateLimitKey: `${tenant.organization.slug}:draft`,
        firstName: "Draft",
        lastName: "Tester",
        company: "Draft Co",
        phone: "5745550188",
        email: `draft.${crypto.randomUUID()}@example.test`,
        eventType: "Corporate or Team Event",
        dates: [EVENT_DATE],
        time: "13:00",
        adults: 8,
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
        food: "no",
        privateRoom: "no",
        craft: "no",
        hasBudget: "no",
        description: "Staff quote draft integration",
        comments: null,
        referral: "QA",
        submissionId: `sub_draft_${crypto.randomUUID()}`,
      },
      unlimitedLimiter,
    );

    const before = await db.inquiry.findFirstOrThrow({
      where: { id: created.inquiryId },
      include: { eventPlanRecommendations: true, bookings: true },
    });
    expect(before.eventPlanRecommendations).toHaveLength(0);
    expect(before.bookings).toHaveLength(0);
    expect(before.salesStage).toBe(INQUIRY_SALES_STAGES.INQUIRY);

    const draft = await createWpStaffQuoteDraftFromInquiry(tenant.ctx, db, created.inquiryId);
    expect(draft.estimatedTotalCents).toBeGreaterThan(0);
    expect(draft.provenance.source).toBe("wordpress_parity_private_calculation");

    const inquiry = await db.inquiry.findFirstOrThrow({
      where: { id: created.inquiryId },
      include: {
        eventPlanRecommendations: true,
        bookings: true,
        conversations: { include: { messages: true } },
      },
    });

    expect(inquiry.status).toBe(INQUIRY_STATUSES.READY_FOR_HUMAN);
    expect(inquiry.salesStage).toBe(INQUIRY_SALES_STAGES.INQUIRY);
    expect(inquiry.workflowStage).toBe(INQUIRY_WORKFLOW_STAGES.AGENT_WORKING);
    expect(inquiry.bookings).toHaveLength(0);
    expect(inquiry.eventPlanRecommendations).toHaveLength(1);
    expect(inquiry.eventPlanRecommendations[0]?.kind).toBe(EVENT_PLAN_KINDS.AGENT_WORKING);
    expect(inquiry.selectedEventPlanId).toBe(inquiry.eventPlanRecommendations[0]?.id);
    expect(inquiry.agentWorkingPlanId).toBe(inquiry.eventPlanRecommendations[0]?.id);
    expect(inquiry.eventPlanRecommendations[0]?.estimatedTotalCents).toBe(draft.estimatedTotalCents);

    const provenance = readWpQuoteDraftProvenance(inquiry.eventPlanRecommendations[0]?.payload);
    expect(provenance?.totalCents).toBe(draft.estimatedTotalCents);
    expect(provenance?.pricingSource).toBeTruthy();

    const meta = parseWpIntakeMessageMetadata(inquiry.conversations[0]?.messages[0]?.metadata);
    const snap = meta?.privateCalculation.snapshot as {
      valid?: boolean;
      dates?: Array<{ recommendation: { total_cents: number } }>;
    };
    expect(snap?.valid).toBe(true);
    expect(draft.estimatedTotalCents).toBe(snap?.dates?.[0]?.recommendation.total_cents);

    const refreshed = await createWpStaffQuoteDraftFromInquiry(tenant.ctx, db, created.inquiryId);
    expect(refreshed.refreshed).toBe(true);
    expect(refreshed.planId).toBe(draft.planId);

    const afterRefresh = await db.eventPlanRecommendation.findMany({
      where: { inquiryId: created.inquiryId },
    });
    expect(afterRefresh).toHaveLength(1);
    expect(afterRefresh.every((row) => row.kind === EVENT_PLAN_KINDS.AGENT_WORKING)).toBe(true);
  }, 90_000);

  it("enforces manage permission and tenant isolation", async () => {
    const tenantA = await provisionTenant("iso-a");
    const tenantB = await provisionTenant("iso-b");
    const frontDesk = await addFrontDeskUser(tenantA);

    const created = await createPublicWpEventInquiry(
      db,
      {
        organizationSlug: tenantA.organization.slug,
        rateLimitKey: `${tenantA.organization.slug}:iso`,
        firstName: "Iso",
        lastName: "Test",
        company: "Iso Co",
        phone: "5745550177",
        email: `iso.${crypto.randomUUID()}@example.test`,
        eventType: "Birthday",
        dates: [EVENT_DATE],
        time: "14:00",
        adults: 6,
        children: 0,
        duration: "2 hours",
        attractions: {
          bowling: "yes",
          axe: "no",
          laser: "no",
          golf: "no",
          climbing: "no",
          arcade: "no",
        },
        food: "no",
        privateRoom: "no",
        craft: "no",
        hasBudget: "no",
        description: "Isolation",
        comments: null,
        referral: "QA",
        submissionId: `sub_iso_${crypto.randomUUID()}`,
      },
      unlimitedLimiter,
    );

    await expect(
      createWpStaffQuoteDraftFromInquiry(frontDesk.ctx, db, created.inquiryId),
    ).rejects.toBeInstanceOf(AuthorizationError);

    await expect(
      createWpStaffQuoteDraftFromInquiry(tenantB.ctx, db, created.inquiryId),
    ).rejects.toBeInstanceOf(InquiryError);

    await expect(
      createWpStaffQuoteDraftFromInquiry(tenantA.ctx, db, "missing-inquiry-id"),
    ).rejects.toMatchObject({ code: "INQUIRY_NOT_FOUND" });
  }, 90_000);
});
