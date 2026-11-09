import { afterAll, afterEach, describe, expect, it } from "vitest";

import { Prisma } from "@/generated/prisma/client";
import { createMemoryRateLimiter } from "@/lib/ai/rate-limiter";
import {
  parseWpIntakeMessageMetadata,
  type WpIntakeMessageMetadata,
} from "@/lib/event-planner/wp-intake-contract";
import { SYSTEM_GROUP_KEYS } from "@/server/authorization/default-security-groups";
import { AuthorizationError, InquiryError } from "@/server/errors";
import {
  readEmployeeApprovedQuoteMarker,
  readWpQuoteDraftProvenance,
} from "@/server/event-planner/wp-parity";
import { resolveRequestContext } from "@/server/request-context";
import { createPublicWpEventInquiry } from "@/server/services/inquiry-service";
import { provisionOrganization } from "@/server/services/provision-organization";
import {
  approveAndSendWpStaffQuote,
  createWpStaffQuoteDraftFromInquiry,
  updateWpStaffQuoteDraft,
} from "@/server/services/wp-staff-quote-draft-service";
import { COMMUNICATION_KINDS } from "@/types/communications";
import {
  EVENT_PLAN_KINDS,
  INQUIRY_SALES_STAGES,
  INQUIRY_STATUSES,
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
      clerkUserId: `user_wp_del_${suffix}_${crypto.randomUUID()}`,
      clerkOrganizationId: `clerk_org_wp_del_${suffix}_${crypto.randomUUID()}`,
      organizationName: `WP Delivery ${suffix}`,
      organizationSlug: `wp-del-${suffix}-${crypto.randomUUID()}`,
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

async function createWpInquiry(tenant: Awaited<ReturnType<typeof provisionTenant>>) {
  return createPublicWpEventInquiry(
    db,
    {
      organizationSlug: tenant.organization.slug,
      rateLimitKey: `${tenant.organization.slug}:del`,
      firstName: "Del",
      lastName: "ivery",
      company: "Delivery Co",
      phone: "5745550166",
      email: `del.${crypto.randomUUID()}@example.test`,
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
      description: "Delivery test",
      comments: null,
      referral: "QA",
      submissionId: `sub_del_${crypto.randomUUID()}`,
    },
    unlimitedLimiter,
  );
}

async function setPrivatePricingSource(
  inquiryId: string,
  pricingSource: "approved_plugin_baseline" | "tenant_live" | "plugin_defaults",
) {
  const message = await db.conversationMessage.findFirstOrThrow({
    where: {
      conversation: { inquiryId },
      senderType: "CUSTOMER",
    },
    orderBy: { createdAt: "asc" },
  });
  const meta = parseWpIntakeMessageMetadata(message.metadata);
  expect(meta).toBeTruthy();
  const next: WpIntakeMessageMetadata = {
    ...meta!,
    privateCalculation: {
      ...meta!.privateCalculation,
      pricingSource,
      status: "ready",
    },
  };
  await db.conversationMessage.update({
    where: { id: message.id },
    data: { metadata: next as unknown as Prisma.InputJsonValue },
  });
}

describe("WP staff quote approval and delivery", () => {
  it("does not publish a customer quote on public WP inquiry alone", async () => {
    const tenant = await provisionTenant("auto");
    const created = await createWpInquiry(tenant);
    const inquiry = await db.inquiry.findFirstOrThrow({
      where: { id: created.inquiryId },
      include: { eventPlanRecommendations: true },
    });
    expect(inquiry.salesStage).toBe(INQUIRY_SALES_STAGES.INQUIRY);
    expect(inquiry.eventPlanRecommendations).toHaveLength(0);
  }, 90_000);

  it("edits draft with explicit cents and approves without delivery for approved baseline", async () => {
    const tenant = await provisionTenant("approve-block");
    const created = await createWpInquiry(tenant);
    await setPrivatePricingSource(created.inquiryId, "approved_plugin_baseline");
    const draft = await createWpStaffQuoteDraftFromInquiry(tenant.ctx, db, created.inquiryId);
    const working = await db.eventPlanRecommendation.findFirstOrThrow({
      where: { id: draft.planId },
    });
    const payload = working.payload as {
      lineItems: Array<{ slug: string; name: string; quantity: number; unitPriceCents: number; kind: string }>;
      guestCount: number;
      eventDate: string | null;
      startTime: string | null;
    };
    const edited = await updateWpStaffQuoteDraft(tenant.ctx, db, created.inquiryId, {
      guestCount: payload.guestCount,
      eventDate: payload.eventDate,
      startTime: payload.startTime,
      durationMinutes: working.durationMinutes ?? 180,
      lineItems: payload.lineItems.map((row, index) =>
        index === 0
          ? { ...row, unitPriceCents: row.unitPriceCents + 50 }
          : row,
      ),
      editReason: "Adjust bowling shoes",
    });
    expect(edited.estimatedTotalCents).toBe((draft.estimatedTotalCents ?? 0) + 50 * payload.lineItems[0]!.quantity);
    expect(edited.provenance?.staffEdit?.wordpressParityExact).toBe(false);
    expect(edited.provenance?.originalTotalCents).toBe(draft.estimatedTotalCents);

    const result = await approveAndSendWpStaffQuote(tenant.ctx, db, created.inquiryId, {
      approvalNote: "Looks good pending go-live verification",
    });
    expect(result.approved).toBe(true);
    expect(result.delivered).toBe(false);
    expect(result.policy.canDeliver).toBe(false);

    const after = await db.inquiry.findFirstOrThrow({
      where: { id: created.inquiryId },
      include: { eventPlanRecommendations: true },
    });
    expect(after.salesStage).toBe(INQUIRY_SALES_STAGES.INQUIRY);
    expect(after.eventPlanRecommendations.filter((row) => row.kind === EVENT_PLAN_KINDS.RECOMMENDATION)).toHaveLength(
      0,
    );
    const workingAfter = after.eventPlanRecommendations.find((row) => row.kind === EVENT_PLAN_KINDS.AGENT_WORKING);
    const approval = readWpQuoteDraftProvenance(workingAfter?.payload)?.employeeApproval;
    expect(approval?.deliveryCompleted).toBe(false);
    expect(approval?.deliveryBlockedCode).toContain("approved_plugin_baseline");
  }, 90_000);

  it("delivers a single customer quote when tenant_live pricing is verified", async () => {
    const tenant = await provisionTenant("deliver");
    const created = await createWpInquiry(tenant);
    await setPrivatePricingSource(created.inquiryId, "tenant_live");
    const draft = await createWpStaffQuoteDraftFromInquiry(tenant.ctx, db, created.inquiryId);
    const result = await approveAndSendWpStaffQuote(tenant.ctx, db, created.inquiryId);
    expect(result.approved).toBe(true);
    expect(result.delivered).toBe(true);
    expect(result.planUrl).toContain("/plan/");
    expect(result.estimatedTotalCents).toBe(draft.estimatedTotalCents);

    const after = await db.inquiry.findFirstOrThrow({
      where: { id: created.inquiryId },
      include: {
        eventPlanRecommendations: true,
        communicationEvents: true,
      },
    });
    expect(after.salesStage).toBe(INQUIRY_SALES_STAGES.PROPOSAL_READY);
    expect(after.status).toBe(INQUIRY_STATUSES.AWAITING_CUSTOMER);
    const published = after.eventPlanRecommendations.filter(
      (row) => row.kind === EVENT_PLAN_KINDS.RECOMMENDATION,
    );
    expect(published).toHaveLength(1);
    expect(readEmployeeApprovedQuoteMarker(published[0]?.payload)).toBeTruthy();
    expect(JSON.stringify(published[0]?.payload)).not.toContain("catalogPriceDiscrepancies");
    expect(
      after.communicationEvents.some((row) => row.kind === COMMUNICATION_KINDS.EMPLOYEE_APPROVED_QUOTE),
    ).toBe(true);

    const again = await approveAndSendWpStaffQuote(tenant.ctx, db, created.inquiryId);
    expect(again.idempotent).toBe(true);
    expect(again.delivered).toBe(true);
    const recommendations = await db.eventPlanRecommendation.count({
      where: { inquiryId: created.inquiryId, kind: EVENT_PLAN_KINDS.RECOMMENDATION },
    });
    expect(recommendations).toBe(1);
  }, 90_000);

  it("rejects missing email and enforces tenant isolation", async () => {
    const tenantA = await provisionTenant("iso-a");
    const tenantB = await provisionTenant("iso-b");
    const created = await createWpInquiry(tenantA);
    await setPrivatePricingSource(created.inquiryId, "tenant_live");
    await createWpStaffQuoteDraftFromInquiry(tenantA.ctx, db, created.inquiryId);

    await db.inquiry.update({
      where: { id: created.inquiryId },
      data: { customerEmail: "not-an-email", customerEmailNormalized: "not-an-email" },
    });
    await expect(approveAndSendWpStaffQuote(tenantA.ctx, db, created.inquiryId)).rejects.toBeInstanceOf(
      InquiryError,
    );

    await db.inquiry.update({
      where: { id: created.inquiryId },
      data: {
        customerEmail: `ok.${crypto.randomUUID()}@example.test`,
        customerEmailNormalized: `ok.${crypto.randomUUID()}@example.test`,
      },
    });
    await expect(approveAndSendWpStaffQuote(tenantB.ctx, db, created.inquiryId)).rejects.toBeInstanceOf(
      InquiryError,
    );

    const group = await db.securityGroup.findFirstOrThrow({
      where: { organizationId: tenantA.organizationId, systemKey: SYSTEM_GROUP_KEYS.FRONT_DESK },
    });
    const desk = await db.userProfile.create({
      data: {
        organizationId: tenantA.organizationId,
        clerkUserId: `user_${crypto.randomUUID()}`,
        defaultLocationId: tenantA.locationId,
        email: `desk-${crypto.randomUUID()}@example.test`,
        firstName: "Desk",
        lastName: "Only",
      },
    });
    await db.securityGroupMember.create({
      data: {
        organizationId: tenantA.organizationId,
        securityGroupId: group.id,
        userProfileId: desk.id,
      },
    });
    const deskCtx = await resolveRequestContext(
      {
        clerkUserId: desk.clerkUserId,
        clerkOrganizationId: tenantA.organization.clerkOrganizationId,
      },
      db,
    );
    await expect(approveAndSendWpStaffQuote(deskCtx, db, created.inquiryId)).rejects.toBeInstanceOf(
      AuthorizationError,
    );
  }, 90_000);
});
