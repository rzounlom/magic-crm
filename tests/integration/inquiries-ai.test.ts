import { afterAll, afterEach, describe, expect, it } from "vitest";

import { SYSTEM_GROUP_KEYS } from "@/server/authorization/default-security-groups";
import { AuthorizationError, InquiryError } from "@/server/errors";
import { resolveRequestContext } from "@/server/request-context";
import { provisionOrganization } from "@/server/services/provision-organization";
import {
  getPublicEventPlanByToken,
  selectPublicEventPlan,
} from "@/server/services/event-plan-service";
import {
  createPublicInquiry,
  getCurrentTenantPublicInquiryPath,
  getCurrentTenantTimezone,
  getInquiryDetail,
  listInquiries,
  resumeInquiryAi,
  submitPublicConversationMessage,
  takeOverInquiry,
} from "@/server/services/inquiry-service";
import { createSalesKnowledgeItem } from "@/server/services/sales-knowledge-service";
import { READY_FOR_HUMAN_REASONS } from "@/lib/inquiries/ready-for-human-reason";
import { EVENT_PLAN_TIERS } from "@/types/event-planner";
import { INQUIRY_STATUSES, SALES_KNOWLEDGE_TYPES } from "@/types/inquiry";
import { deleteTestOrganizations } from "../helpers/cleanup-test-organizations";
import { createMemoryRateLimiter } from "@/lib/ai/rate-limiter";
import { createFakeSalesAgentModel } from "../helpers/fake-sales-agent-model";
import { createTestPrismaClient } from "../helpers/test-database";

const db = createTestPrismaClient();
const createdOrganizationIds: string[] = [];
const unlimitedLimiter = createMemoryRateLimiter();

async function cleanup() {
  await deleteTestOrganizations(db, createdOrganizationIds);
  createdOrganizationIds.length = 0;
}

afterEach(cleanup);
afterAll(async () => {
  await db.$disconnect();
});

async function provisionTenant(suffix: string) {
  const result = await provisionOrganization(
    {
      clerkUserId: `user_${suffix}_${crypto.randomUUID()}`,
      clerkOrganizationId: `clerk_org_${suffix}_${crypto.randomUUID()}`,
      organizationName: `Fun ${suffix}`,
      organizationSlug: `fun-${suffix}-${crypto.randomUUID()}`,
      isClerkOrganizationAdmin: true,
    },
    db,
  );
  createdOrganizationIds.push(result.organizationId);
  const organization = await db.organization.findFirstOrThrow({
    where: { id: result.organizationId },
  });
  const profile = await db.userProfile.findFirstOrThrow({ where: { id: result.userProfileId } });
  const ctx = await resolveRequestContext(
    {
      clerkUserId: profile.clerkUserId,
      clerkOrganizationId: organization.clerkOrganizationId,
    },
    db,
  );
  return { ...result, ctx, organization };
}

function intake(slug: string, email: string, extras: Record<string, unknown> = {}) {
  return {
    organizationSlug: slug,
    rateLimitKey: `${slug}:${email}`,
    firstName: "Ada",
    lastName: "Lovelace",
    email,
    eventType: "Birthday Party",
    preferredDate: "2026-10-15",
    startTime: "18:00",
    guestCount: 12,
    guestMix: "mostly_children",
    desiredDurationMinutes: 180,
    budgetBand: "1500_3000",
    eventGoal: "Celebration",
    diningPreference: "not_sure",
    spacePreference: "semi_private",
    attractionInterestIds: [] as string[],
    submissionId: `sub_${crypto.randomUUID()}`,
    ...extras,
  };
}

async function seedAttractions(
  ctx: Awaited<ReturnType<typeof provisionTenant>>["ctx"],
  items: Array<{ name: string; priceText: string; notes?: string; maxGuests?: number }>,
) {
  const created = [];
  for (const item of items) {
    created.push(
      await createSalesKnowledgeItem(ctx, db, {
        type: SALES_KNOWLEDGE_TYPES.ATTRACTION,
        name: item.name,
        shortDescription: item.name,
        details: item.notes ?? item.name,
        priceText: item.priceText,
        maxGuests: item.maxGuests,
        customerFacingNotes: item.notes ?? null,
        active: true,
      }),
    );
  }
  return created;
}

describe("personal event planner inquiries (postgres)", () => {
  it("creates a tenant-scoped inquiry from slug and ignores guessed organization ids", async () => {
    const a = await provisionTenant("a");
    const b = await provisionTenant("b");
    const created = await createPublicInquiry(
      db,
      intake(a.organization.slug, "ada@example.com"),
      undefined,
      unlimitedLimiter,
    );

    const inquiry = await db.inquiry.findFirstOrThrow({ where: { id: created.inquiryId } });
    expect(inquiry.organizationId).toBe(a.organizationId);
    expect(inquiry.organizationId).not.toBe(b.organizationId);
    expect(inquiry.aiHandlingEnabled).toBe(false);

    await expect(
      createPublicInquiry(db, intake("not-a-real-tenant", "other@example.com"), undefined, unlimitedLimiter),
    ).rejects.toMatchObject({ code: "TENANT_NOT_AVAILABLE" });
  });

  it("blocks plan tokens and employees from crossing tenants", async () => {
    const a = await provisionTenant("iso-a");
    const b = await provisionTenant("iso-b");
    await seedAttractions(a.ctx, [
      { name: "Bowling", priceText: "$10/person" },
      { name: "Laser Tag", priceText: "$8/person" },
      { name: "Mini Golf", priceText: "$9/person" },
    ]);
    const first = await createPublicInquiry(
      db,
      intake(a.organization.slug, "one@example.com"),
      undefined,
      unlimitedLimiter,
    );
    const second = await createPublicInquiry(
      db,
      intake(b.organization.slug, "two@example.com"),
      undefined,
      unlimitedLimiter,
    );

    const visible = await getPublicEventPlanByToken(db, first.publicToken);
    expect(visible.organizationSlug).toBe(a.organization.slug);
    await expect(getPublicEventPlanByToken(db, `${first.publicToken}x`)).rejects.toBeInstanceOf(InquiryError);

    await expect(getInquiryDetail(b.ctx, db, first.inquiryId)).resolves.toBeNull();
    expect(await getCurrentTenantPublicInquiryPath(a.ctx, db)).toBe(`/inquire/${a.organization.slug}`);
    expect(await getCurrentTenantPublicInquiryPath(b.ctx, db)).toBe(`/inquire/${b.organization.slug}`);
    await db.organization.update({
      where: { id: a.organizationId },
      data: { timezone: "America/New_York" },
    });
    await db.organization.update({
      where: { id: b.organizationId },
      data: { timezone: "America/Los_Angeles" },
    });
    expect(await getCurrentTenantTimezone(a.ctx, db)).toBe("America/New_York");
    expect(await getCurrentTenantTimezone(b.ctx, db)).toBe("America/Los_Angeles");
    const listB = await listInquiries(b.ctx, db);
    expect(listB.map((row) => row.id)).not.toContain(first.inquiryId);
    expect(listB.map((row) => row.id)).toContain(second.inquiryId);
  });

  it("generates three knowledge-backed plans and ignores the other tenant catalog", async () => {
    const a = await provisionTenant("know-a");
    const b = await provisionTenant("know-b");
    await seedAttractions(a.ctx, [
      { name: "Go-Karts", priceText: "$12/person" },
      { name: "Bowling", priceText: "$15/person" },
      { name: "Laser Tag", priceText: "$8/person" },
    ]);
    await createSalesKnowledgeItem(b.ctx, db, {
      type: SALES_KNOWLEDGE_TYPES.ATTRACTION,
      name: "Secret bowling",
      shortDescription: "Other tenant",
      details: "Should never appear",
      priceText: "$99/person",
      active: true,
    });

    const created = await createPublicInquiry(
      db,
      intake(a.organization.slug, "plans@example.com", { guestMix: "mostly_adults" }),
      undefined,
      unlimitedLimiter,
    );
    const inquiry = await db.inquiry.findFirstOrThrow({ where: { id: created.inquiryId } });
    const plans = await db.eventPlanRecommendation.findMany({
      where: { inquiryId: created.inquiryId },
    });
    expect(inquiry.status).toBe(INQUIRY_STATUSES.AWAITING_CUSTOMER);
    expect(plans).toHaveLength(3);
    expect(plans.map((row) => row.tier).sort()).toEqual([
      EVENT_PLAN_TIERS.BEST_FIT,
      EVENT_PLAN_TIERS.BUDGET,
      EVENT_PLAN_TIERS.PREMIUM,
    ]);
    expect(JSON.stringify(plans)).not.toContain("Secret bowling");
    expect(plans.every((row) => row.organizationId === a.organizationId)).toBe(true);
    expect(plans.every((row) => row.availabilityValidated === false)).toBe(true);
  });

  it("selects a plan on the same inquiry and queues it for a live agent", async () => {
    const a = await provisionTenant("select");
    const b = await provisionTenant("select-b");
    await seedAttractions(a.ctx, [
      { name: "Go-Karts", priceText: "$12/person" },
      { name: "Bowling", priceText: "$15/person" },
      { name: "Laser Tag", priceText: "$8/person" },
    ]);
    const created = await createPublicInquiry(
      db,
      intake(a.organization.slug, "choose@example.com", { guestMix: "mostly_adults" }),
      undefined,
      unlimitedLimiter,
    );
    const bestFit = await db.eventPlanRecommendation.findFirstOrThrow({
      where: { inquiryId: created.inquiryId, tier: EVENT_PLAN_TIERS.BEST_FIT },
    });

    await expect(
      selectPublicEventPlan(
        db,
        { token: created.publicToken, planId: "not-a-plan", rateLimitKey: "bad" },
        unlimitedLimiter,
      ),
    ).rejects.toMatchObject({ code: "PLAN_NOT_FOUND" });

    const selected = await selectPublicEventPlan(
      db,
      { token: created.publicToken, planId: bestFit.id, rateLimitKey: "choose" },
      unlimitedLimiter,
    );
    expect(selected.inquiry.status).toBe(INQUIRY_STATUSES.READY_FOR_HUMAN);
    expect(selected.inquiry.selectedEventPlanId).toBe(bestFit.id);
    expect(selected.inquiry.aiHandlingEnabled).toBe(false);
    expect(selected.inquiry.humanHandoffReason).toBe(READY_FOR_HUMAN_REASONS.CUSTOMER_SELECTED_PLAN);
    expect(selected.inquiry.customerSelectedAt).not.toBeNull();

    const detail = await getInquiryDetail(a.ctx, db, created.inquiryId);
    expect(detail?.selectedEventPlanId).toBe(bestFit.id);
    const list = await listInquiries(a.ctx, db);
    expect(list[0]?.selectedEventPlanId).toBe(bestFit.id);

    await expect(
      selectPublicEventPlan(
        db,
        { token: created.publicToken, planId: bestFit.id, rateLimitKey: "cross" },
        unlimitedLimiter,
      ),
    ).resolves.toMatchObject({ plan: { id: bestFit.id } });
    const otherPlans = await db.eventPlanRecommendation.findMany({
      where: { organizationId: b.organizationId },
    });
    expect(otherPlans).toHaveLength(0);
  });

  it("marks inquiries with no feasible catalog for staff follow-up", async () => {
    const a = await provisionTenant("empty");
    const created = await createPublicInquiry(
      db,
      intake(a.organization.slug, "empty@example.com"),
      undefined,
      unlimitedLimiter,
    );
    const inquiry = await db.inquiry.findFirstOrThrow({ where: { id: created.inquiryId } });
    expect(inquiry.status).toBe(INQUIRY_STATUSES.NEEDS_FOLLOW_UP);
    expect(inquiry.humanHandoffReason).toBe(READY_FOR_HUMAN_REASONS.NO_FEASIBLE_PLAN);
    expect(await db.eventPlanRecommendation.count({ where: { inquiryId: created.inquiryId } })).toBe(0);
    const view = await getPublicEventPlanByToken(db, created.publicToken);
    expect(view.plans).toHaveLength(0);
    expect(view.inquiry.recommendationsViewedAt).not.toBeNull();
  });

  it("rejects oversized public input and forbids the inquiry list without permission", async () => {
    const a = await provisionTenant("dup");
    await expect(
      createPublicInquiry(
        db,
        intake(a.organization.slug, "huge@example.com", { notes: "n".repeat(2001) }),
        undefined,
        unlimitedLimiter,
      ),
    ).rejects.toBeInstanceOf(InquiryError);

    const beforeInvalidPhone = await db.inquiry.count({ where: { organizationId: a.organizationId } });
    await expect(
      createPublicInquiry(
        db,
        intake(a.organization.slug, "badphone@example.com", { phone: "45645654564564564654654" }),
        undefined,
        unlimitedLimiter,
      ),
    ).rejects.toBeInstanceOf(InquiryError);
    expect(await db.inquiry.count({ where: { organizationId: a.organizationId } })).toBe(beforeInvalidPhone);

    const frontDesk = await db.securityGroup.findFirstOrThrow({
      where: { organizationId: a.organizationId, systemKey: SYSTEM_GROUP_KEYS.FRONT_DESK },
    });
    const desk = await db.userProfile.create({
      data: {
        organizationId: a.organizationId,
        clerkUserId: `desk_${crypto.randomUUID()}`,
        defaultLocationId: a.locationId,
        email: "desk@example.com",
      },
    });
    await db.securityGroupMember.create({
      data: {
        organizationId: a.organizationId,
        securityGroupId: frontDesk.id,
        userProfileId: desk.id,
      },
    });
    const deskCtx = await resolveRequestContext(
      {
        clerkUserId: desk.clerkUserId,
        clerkOrganizationId: a.organization.clerkOrganizationId,
      },
      db,
    );
    await expect(listInquiries(deskCtx, db)).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("can still resume the leftover sales agent on employee request", async () => {
    const a = await provisionTenant("resume");
    const created = await createPublicInquiry(
      db,
      intake(a.organization.slug, "resume@example.com"),
      undefined,
      unlimitedLimiter,
    );
    await takeOverInquiry(a.ctx, db, created.inquiryId);
    await resumeInquiryAi(a.ctx, db, created.inquiryId);
    const model = createFakeSalesAgentModel();
    await submitPublicConversationMessage(
      db,
      {
        token: created.publicToken,
        message: "Can you still help?",
        submissionId: `sub_${crypto.randomUUID()}`,
        rateLimitKey: "resume",
      },
      { model, modelId: "test-model" },
      unlimitedLimiter,
    );
    expect(model.requests.length).toBeGreaterThan(0);
    const resumed = await db.inquiry.findFirstOrThrow({ where: { id: created.inquiryId } });
    expect(resumed.aiHandlingEnabled).toBe(true);
  });
});
