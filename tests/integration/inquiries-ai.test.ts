import { afterAll, afterEach, describe, expect, it } from "vitest";

import { SYSTEM_GROUP_KEYS } from "@/server/authorization/default-security-groups";
import { AuthorizationError, InquiryError } from "@/server/errors";
import { resolveRequestContext } from "@/server/request-context";
import {
  provisionOrganization,
} from "@/server/services/provision-organization";
import {
  createPublicInquiry,
  getCurrentTenantPublicInquiryPath,
  getInquiryDetail,
  getPublicConversationByToken,
  listInquiries,
  resumeInquiryAi,
  submitPublicConversationMessage,
  takeOverInquiry,
} from "@/server/services/inquiry-service";
import { createSalesKnowledgeItem, searchActiveSalesKnowledge } from "@/server/services/sales-knowledge-service";
import {
  AI_CUSTOMER_FALLBACK_MESSAGE,
  AI_HANDOFF_CUSTOMER_MESSAGE,
  INQUIRY_STATUSES,
  SALES_KNOWLEDGE_TYPES,
} from "@/types/inquiry";
import { deleteTestOrganizations } from "../helpers/cleanup-test-organizations";
import { createMemoryRateLimiter } from "@/lib/ai/rate-limiter";
import {
  createFakeSalesAgentModel,
  failingSalesAgentModel,
} from "../helpers/fake-sales-agent-model";
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
    guestCount: 12,
    eventType: "Birthday",
    submissionId: `sub_${crypto.randomUUID()}`,
    ...extras,
  };
}

describe("public intake and AI inquiries (postgres)", () => {
  it("creates a tenant-scoped inquiry from slug and ignores guessed organization ids", async () => {
    const a = await provisionTenant("a");
    const b = await provisionTenant("b");
    const model = createFakeSalesAgentModel();
    const created = await createPublicInquiry(
      db,
      intake(a.organization.slug, "ada@example.com"),
      { model, modelId: "test-model" },
      unlimitedLimiter,
    );

    const inquiry = await db.inquiry.findFirstOrThrow({ where: { id: created.inquiryId } });
    expect(inquiry.organizationId).toBe(a.organizationId);
    expect(inquiry.organizationId).not.toBe(b.organizationId);

    await expect(
      createPublicInquiry(
        db,
        intake("not-a-real-tenant", "other@example.com"),
        { model, modelId: "test-model" },
        unlimitedLimiter,
      ),
    ).rejects.toMatchObject({ code: "TENANT_NOT_AVAILABLE" });
  });

  it("blocks conversation tokens and employees from crossing tenants", async () => {
    const a = await provisionTenant("iso-a");
    const b = await provisionTenant("iso-b");
    const model = createFakeSalesAgentModel();
    const first = await createPublicInquiry(
      db,
      intake(a.organization.slug, "one@example.com"),
      { model, modelId: "test-model" },
      unlimitedLimiter,
    );
    const second = await createPublicInquiry(
      db,
      intake(b.organization.slug, "two@example.com"),
      { model, modelId: "test-model" },
      unlimitedLimiter,
    );

    const visible = await getPublicConversationByToken(db, first.publicToken);
    expect(visible.organizationSlug).toBe(a.organization.slug);
    await expect(getPublicConversationByToken(db, `${first.publicToken}x`)).rejects.toBeInstanceOf(
      InquiryError,
    );

    await expect(getInquiryDetail(b.ctx, db, first.inquiryId)).resolves.toBeNull();
    expect(await getCurrentTenantPublicInquiryPath(a.ctx, db)).toBe(`/inquire/${a.organization.slug}`);
    expect(await getCurrentTenantPublicInquiryPath(b.ctx, db)).toBe(`/inquire/${b.organization.slug}`);
    expect(await getCurrentTenantPublicInquiryPath(a.ctx, db)).not.toBe(
      `/inquire/${b.organization.slug}`,
    );
    const listB = await listInquiries(b.ctx, db);
    expect(listB.map((row) => row.id)).not.toContain(first.inquiryId);
    expect(listB.map((row) => row.id)).toContain(second.inquiryId);

    const messages = await db.conversationMessage.findMany({
      where: { conversationId: first.conversationId },
    });
    expect(messages.every((row) => row.organizationId === a.organizationId)).toBe(true);
  });

  it("searches only current-tenant knowledge and ignores forbidden update fields", async () => {
    const a = await provisionTenant("know-a");
    const b = await provisionTenant("know-b");
    await createSalesKnowledgeItem(a.ctx, db, {
      type: SALES_KNOWLEDGE_TYPES.ATTRACTION,
      name: "Axe throwing",
      shortDescription: "Targets and coaches",
      details: "90 minutes. $45 per person.",
      priceText: "$45 per person",
      active: true,
    });
    await createSalesKnowledgeItem(b.ctx, db, {
      type: SALES_KNOWLEDGE_TYPES.ATTRACTION,
      name: "Secret bowling",
      shortDescription: "Other tenant",
      details: "Should never appear",
      active: true,
    });

    const found = await searchActiveSalesKnowledge(db, a.organizationId, { query: "axe bowling" });
    expect(found.map((item) => item.name)).toEqual(["Axe throwing"]);

    const model = createFakeSalesAgentModel((request) => {
      const last = request.input.at(-1)?.content ?? "";
      if (last.includes("Tool")) {
        return {
          responseId: "resp_done",
          outputText: "Axe throwing is $45 per person.",
          functionCalls: [],
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
        };
      }
      return {
        responseId: "resp_tools",
        outputText: "",
        functionCalls: [
          {
            callId: "call_1",
            name: "search_sales_knowledge",
            arguments: JSON.stringify({ query: "axe" }),
          },
          {
            callId: "call_2",
            name: "update_inquiry_details",
            arguments: JSON.stringify({
              guestCount: 16,
              organizationId: b.organizationId,
              status: "BOOKED",
            }),
          },
        ],
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      };
    });

    const created = await createPublicInquiry(
      db,
      intake(a.organization.slug, "price@example.com", { notes: "How much is axe throwing?" }),
      { model, modelId: "test-model" },
      unlimitedLimiter,
    );
    const inquiry = await db.inquiry.findFirstOrThrow({ where: { id: created.inquiryId } });
    expect(inquiry.guestCount).toBe(16);
    expect(inquiry.status).not.toBe(INQUIRY_STATUSES.BOOKED);
    expect(inquiry.organizationId).toBe(a.organizationId);
  });

  it("handoffs, preserves the lead when the model fails, and stops AI after takeover", async () => {
    const a = await provisionTenant("flow");
    const handoffModel = createFakeSalesAgentModel(() => ({
      responseId: "resp_handoff",
      outputText: "I will have a manager join.",
      functionCalls: [
        {
          callId: "call_h",
          name: "request_human_handoff",
          arguments: JSON.stringify({
            reason: "Customer asked for a manager.",
            summary: "Manager requested.",
            urgency: "high",
          }),
        },
      ],
      usage: { inputTokens: 3, outputTokens: 2, totalTokens: 5 },
    }));
    const handed = await createPublicInquiry(
      db,
      intake(a.organization.slug, "manager@example.com", { notes: "Can I talk to a manager?" }),
      { model: handoffModel, modelId: "test-model" },
      unlimitedLimiter,
    );
    const handedInquiry = await db.inquiry.findFirstOrThrow({ where: { id: handed.inquiryId } });
    expect(handedInquiry.status).toBe(INQUIRY_STATUSES.READY_FOR_HUMAN);
    expect(handedInquiry.aiHandlingEnabled).toBe(false);

    const failed = await createPublicInquiry(
      db,
      intake(a.organization.slug, "fail@example.com"),
      { model: failingSalesAgentModel({ status: 500 }), modelId: "test-model" },
      unlimitedLimiter,
    );
    const failedInquiry = await db.inquiry.findFirstOrThrow({ where: { id: failed.inquiryId } });
    expect(failedInquiry.id).toBe(failed.inquiryId);
    expect(failedInquiry.status).toBe(INQUIRY_STATUSES.NEEDS_FOLLOW_UP);
    expect(failedInquiry.aiHandlingEnabled).toBe(true);
    expect(failedInquiry.humanHandoffRequestedAt).toBeNull();

    const auto = createFakeSalesAgentModel();
    const live = await createPublicInquiry(
      db,
      intake(a.organization.slug, "live@example.com"),
      { model: auto, modelId: "test-model" },
      unlimitedLimiter,
    );
    await takeOverInquiry(a.ctx, db, live.inquiryId);
    const callsAfterTakeover = auto.requests.length;
    await submitPublicConversationMessage(
      db,
      {
        token: live.publicToken,
        message: "Still here",
        submissionId: `sub_${crypto.randomUUID()}`,
        rateLimitKey: "live",
      },
      { model: auto, modelId: "test-model" },
      unlimitedLimiter,
    );
    expect(auto.requests.length).toBe(callsAfterTakeover);

    await resumeInquiryAi(a.ctx, db, live.inquiryId);
    const resumed = await db.inquiry.findFirstOrThrow({ where: { id: live.inquiryId } });
    expect(resumed.aiHandlingEnabled).toBe(true);
  });

  it("treats duplicate submissions as idempotent and rejects oversized public input", async () => {
    const a = await provisionTenant("dup");
    const model = createFakeSalesAgentModel();
    const submissionId = `sub_${crypto.randomUUID()}`;
    const created = await createPublicInquiry(
      db,
      intake(a.organization.slug, "dup@example.com", { submissionId }),
      { model, modelId: "test-model" },
      unlimitedLimiter,
    );
    await submitPublicConversationMessage(
      db,
      {
        token: created.publicToken,
        message: "Next Saturday works.",
        submissionId: "msg-dup-1",
        rateLimitKey: "dup",
      },
      { model, modelId: "test-model" },
      unlimitedLimiter,
    );
    await expect(
      submitPublicConversationMessage(
        db,
        {
          token: created.publicToken,
          message: "Next Saturday works.",
          submissionId: "msg-dup-1",
          rateLimitKey: "dup",
        },
        { model, modelId: "test-model" },
        unlimitedLimiter,
      ),
    ).rejects.toMatchObject({ code: "DUPLICATE_SUBMISSION" });

    await expect(
      createPublicInquiry(
        db,
        intake(a.organization.slug, "huge@example.com", { notes: "n".repeat(2001) }),
        { model, modelId: "test-model" },
        unlimitedLimiter,
      ),
    ).rejects.toBeInstanceOf(InquiryError);

    const beforeInvalidPhone = await db.inquiry.count({ where: { organizationId: a.organizationId } });
    await expect(
      createPublicInquiry(
        db,
        intake(a.organization.slug, "badphone@example.com", { phone: "45645654564564564654654" }),
        { model, modelId: "test-model" },
        unlimitedLimiter,
      ),
    ).rejects.toBeInstanceOf(InquiryError);
    expect(await db.inquiry.count({ where: { organizationId: a.organizationId } })).toBe(beforeInvalidPhone);
  });

  it("stores usage on the current tenant only and forbids inquiry list without permission", async () => {
    const a = await provisionTenant("usage");
    const model = createFakeSalesAgentModel();
    await createPublicInquiry(
      db,
      intake(a.organization.slug, "usage@example.com"),
      { model, modelId: "test-model" },
      unlimitedLimiter,
    );
    const usage = await db.aiUsage.findMany({ where: { organizationId: a.organizationId } });
    expect(usage.length).toBeGreaterThan(0);
    expect(usage.every((row) => row.organizationId === a.organizationId)).toBe(true);

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

  it("captures birthday facts and does not invent availability", async () => {
    const a = await provisionTenant("birthday");
    await createSalesKnowledgeItem(a.ctx, db, {
      type: SALES_KNOWLEDGE_TYPES.PACKAGE,
      name: "Kids birthday package",
      shortDescription: "Party rooms and attractions",
      details: "Includes party host. Waiver required.",
      waiverRequired: true,
      active: true,
    });
    const model = createFakeSalesAgentModel((request) => {
      const last = request.input.at(-1)?.content ?? "";
      if (last.includes("update_inquiry_details") || last.includes("request_human_handoff")) {
        return {
          responseId: "resp_b3",
          outputText:
            "A kids birthday package can work for 12 kids. I do not have live Saturday availability yet, so a team member will confirm the time.",
          functionCalls: [],
          usage: { inputTokens: 2, outputTokens: 4, totalTokens: 6 },
        };
      }
      if (last.includes("search_sales_knowledge")) {
        return {
          responseId: "resp_b2",
          outputText:
            "A kids birthday package can work for 12 kids. I do not have live Saturday availability yet, so a team member will confirm the time.",
          functionCalls: [
            {
              callId: "upd",
              name: "update_inquiry_details",
              arguments: JSON.stringify({ guestCount: 12, eventType: "Birthday", desiredDate: "2026-09-12" }),
            },
            {
              callId: "hand",
              name: "request_human_handoff",
              arguments: JSON.stringify({
                reason: "Customer asked to book a specific Saturday time.",
                summary: "Birthday for 12 kids; availability needs confirmation.",
              }),
            },
          ],
          usage: { inputTokens: 4, outputTokens: 6, totalTokens: 10 },
        };
      }
      return {
        responseId: "resp_b1",
        outputText: "",
        functionCalls: [
          {
            callId: "search",
            name: "search_sales_knowledge",
            arguments: JSON.stringify({ query: "birthday kids" }),
          },
        ],
        usage: { inputTokens: 2, outputTokens: 1, totalTokens: 3 },
      };
    });

    const created = await createPublicInquiry(
      db,
      intake(a.organization.slug, "bday@example.com", {
        notes: "Planning a birthday for 12 kids next Saturday. Can I book bowling Saturday at 6?",
        guestCount: 12,
        eventType: "Birthday",
      }),
      { model, modelId: "test-model" },
      unlimitedLimiter,
    );
    const inquiry = await db.inquiry.findFirstOrThrow({ where: { id: created.inquiryId } });
    const thread = await getPublicConversationByToken(db, created.publicToken);
    expect(inquiry.guestCount).toBe(12);
    expect(inquiry.eventType).toBe("Birthday");
    expect(inquiry.status).toBe(INQUIRY_STATUSES.READY_FOR_HUMAN);
    expect(thread.messages.some((message) => /availability/i.test(message.content))).toBe(true);
    expect(thread.messages.some((message) => /confirmed reservation|you're booked/i.test(message.content))).toBe(
      false,
    );
  });

  it("does not invent a policy when tenant knowledge has none", async () => {
    const a = await provisionTenant("policy");
    const model = createFakeSalesAgentModel((request) => {
      const last = request.input.at(-1)?.content ?? "";
      if (last.includes("Tool")) {
        expect(last).toContain("[]");
        return {
          responseId: "resp_policy",
          outputText:
            "I do not have a written outside-food policy in our current knowledge. A team member can confirm that for you.",
          functionCalls: [],
          usage: { inputTokens: 2, outputTokens: 3, totalTokens: 5 },
        };
      }
      return {
        responseId: "resp_search",
        outputText: "",
        functionCalls: [
          {
            callId: "search",
            name: "search_sales_knowledge",
            arguments: JSON.stringify({ query: "outside food policy", type: "POLICY" }),
          },
        ],
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      };
    });
    const created = await createPublicInquiry(
      db,
      intake(a.organization.slug, "policy@example.com", {
        notes: "Can we bring our own pizza?",
      }),
      { model, modelId: "test-model" },
      unlimitedLimiter,
    );
    const thread = await getPublicConversationByToken(db, created.publicToken);
    expect(thread.messages.some((message) => /do not have/i.test(message.content))).toBe(true);
    expect(thread.messages.some((message) => /you may bring/i.test(message.content))).toBe(false);
  });

  it("keeps AI enabled after transient provider and empty-output failures", async () => {
    const a = await provisionTenant("retry");

    async function expectTransientFailure(
      error: unknown,
      email: string,
    ) {
      const created = await createPublicInquiry(
        db,
        intake(a.organization.slug, email),
        { model: failingSalesAgentModel(error), modelId: "test-model" },
        unlimitedLimiter,
      );
      const inquiry = await db.inquiry.findFirstOrThrow({ where: { id: created.inquiryId } });
      const thread = await getPublicConversationByToken(db, created.publicToken);
      expect(thread.messages.some((message) => message.content.includes("submitted an event inquiry"))).toBe(
        true,
      );
      expect(thread.messages.some((message) => message.content === AI_CUSTOMER_FALLBACK_MESSAGE)).toBe(true);
      expect(inquiry.aiHandlingEnabled).toBe(true);
      expect(inquiry.humanHandoffRequestedAt).toBeNull();
      expect(inquiry.status).toBe(INQUIRY_STATUSES.NEEDS_FOLLOW_UP);
      return created;
    }

    const timedOut = await expectTransientFailure(
      { name: "APIConnectionTimeoutError", message: "Request timed out" },
      "timeout@example.com",
    );
    const rateLimited = await expectTransientFailure({ status: 429 }, "rate@example.com");
    await expectTransientFailure({ message: "malformed model output" }, "malformed@example.com");

    const emptyModel = createFakeSalesAgentModel(() => ({
      responseId: "resp_empty",
      outputText: "",
      functionCalls: [],
      usage: { inputTokens: 4, outputTokens: 8, totalTokens: 12 },
    }));
    const empty = await createPublicInquiry(
      db,
      intake(a.organization.slug, "empty@example.com"),
      { model: emptyModel, modelId: "test-model" },
      unlimitedLimiter,
    );
    const emptyInquiry = await db.inquiry.findFirstOrThrow({ where: { id: empty.inquiryId } });
    expect(emptyInquiry.aiHandlingEnabled).toBe(true);
    expect(emptyInquiry.humanHandoffRequestedAt).toBeNull();
    expect(emptyInquiry.status).toBe(INQUIRY_STATUSES.NEEDS_FOLLOW_UP);

    const retryModel = createFakeSalesAgentModel();
    await submitPublicConversationMessage(
      db,
      {
        token: timedOut.publicToken,
        message: "Still interested in Saturday.",
        submissionId: `sub_${crypto.randomUUID()}`,
        rateLimitKey: "retry-timeout",
      },
      { model: retryModel, modelId: "test-model" },
      unlimitedLimiter,
    );
    expect(retryModel.requests.length).toBeGreaterThan(0);
    expect(rateLimited.inquiryId).toBeTruthy();
  });

  it("treats a tool exception as recoverable unless the tool requested handoff", async () => {
    const a = await provisionTenant("toolfail");
    let calls = 0;
    const model = createFakeSalesAgentModel((request) => {
      calls += 1;
      const last = request.input.at(-1)?.content ?? "";
      if (last.includes("TOOL_FAILED") || last.includes("Tool")) {
        return {
          responseId: "resp_recovered",
          outputText: "I can still help with that birthday once I look up the package again.",
          functionCalls: [],
          usage: { inputTokens: 2, outputTokens: 3, totalTokens: 5 },
        };
      }
      return {
        responseId: "resp_bad_tool",
        outputText: "",
        functionCalls: [
          {
            callId: "bad",
            name: "update_inquiry_details",
            arguments: JSON.stringify({ guestCount: "not-a-number" }),
          },
        ],
        usage: { inputTokens: 2, outputTokens: 2, totalTokens: 4 },
      };
    });

    const created = await createPublicInquiry(
      db,
      intake(a.organization.slug, "toolfail@example.com"),
      { model, modelId: "test-model" },
      unlimitedLimiter,
    );
    const inquiry = await db.inquiry.findFirstOrThrow({ where: { id: created.inquiryId } });
    const thread = await getPublicConversationByToken(db, created.publicToken);
    expect(inquiry.aiHandlingEnabled).toBe(true);
    expect(inquiry.humanHandoffRequestedAt).toBeNull();
    expect(thread.messages.some((message) => /still help/i.test(message.content))).toBe(true);
    expect(calls).toBeGreaterThan(1);
  });

  it("answers a 14-guest package follow-up from tenant knowledge without disabling AI", async () => {
    const a = await provisionTenant("price");
    await createSalesKnowledgeItem(a.ctx, db, {
      type: SALES_KNOWLEDGE_TYPES.PACKAGE,
      name: "Have a Blast Birthday Package",
      shortDescription: "Laser tag birthday",
      details: "$349.99 for up to 10 guests. Each additional guest is $34.99.",
      priceText: "$349.99 up to 10 guests; $34.99 each additional guest.",
      active: true,
    });
    const model = createFakeSalesAgentModel((request) => {
      const last = request.input.at(-1)?.content ?? "";
      if (last.includes("search_sales_knowledge") || last.includes("Have a Blast")) {
        return {
          responseId: "resp_price",
          outputText:
            "Have a Blast is $349.99 for up to 10 guests. Four extra guests are $139.96, so 14 kids is $489.95.",
          functionCalls: [],
          usage: { inputTokens: 3, outputTokens: 5, totalTokens: 8 },
        };
      }
      return {
        responseId: "resp_search_price",
        outputText: "",
        functionCalls: [
          {
            callId: "search",
            name: "search_sales_knowledge",
            arguments: JSON.stringify({ query: "Have a Blast" }),
          },
          {
            callId: "update",
            name: "update_inquiry_details",
            arguments: JSON.stringify({ guestCount: "14" }),
          },
        ],
        usage: { inputTokens: 2, outputTokens: 2, totalTokens: 4 },
      };
    });

    const created = await createPublicInquiry(
      db,
      intake(a.organization.slug, "pricefollow@example.com", { guestCount: 14 }),
      { model, modelId: "test-model" },
      unlimitedLimiter,
    );
    await submitPublicConversationMessage(
      db,
      {
        token: created.publicToken,
        message: "What would Have a Blast cost for 14 kids?",
        submissionId: `sub_${crypto.randomUUID()}`,
        rateLimitKey: "pricefollow",
      },
      { model, modelId: "test-model" },
      unlimitedLimiter,
    );
    const inquiry = await db.inquiry.findFirstOrThrow({ where: { id: created.inquiryId } });
    const thread = await getPublicConversationByToken(db, created.publicToken);
    expect(inquiry.guestCount).toBe(14);
    expect(inquiry.aiHandlingEnabled).toBe(true);
    expect(thread.messages.some((message) => message.content.includes("$489.95"))).toBe(true);
  });

  it("hands off only when the customer asks for a person, then stays silent", async () => {
    const a = await provisionTenant("talk");
    const model = createFakeSalesAgentModel((request) => {
      const askedForPerson = request.input.some((item) => /talk to someone/i.test(item.content));
      if (askedForPerson) {
        return {
          responseId: "resp_person",
          outputText: AI_HANDOFF_CUSTOMER_MESSAGE,
          functionCalls: [
            {
              callId: "hand",
              name: "request_human_handoff",
              arguments: JSON.stringify({
                reason: "Customer asked to talk to someone.",
                summary: "Customer requested a person.",
              }),
            },
          ],
          usage: { inputTokens: 2, outputTokens: 2, totalTokens: 4 },
        };
      }
      return {
        responseId: "resp_ok",
        outputText: "I can help with that.",
        functionCalls: [],
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      };
    });

    const created = await createPublicInquiry(
      db,
      intake(a.organization.slug, "talk@example.com"),
      { model, modelId: "test-model" },
      unlimitedLimiter,
    );
    await submitPublicConversationMessage(
      db,
      {
        token: created.publicToken,
        message: "Can I talk to someone?",
        submissionId: `sub_${crypto.randomUUID()}`,
        rateLimitKey: "talk",
      },
      { model, modelId: "test-model" },
      unlimitedLimiter,
    );
    const handed = await db.inquiry.findFirstOrThrow({ where: { id: created.inquiryId } });
    expect(handed.aiHandlingEnabled).toBe(false);
    expect(handed.status).toBe(INQUIRY_STATUSES.READY_FOR_HUMAN);
    expect(handed.humanHandoffRequestedAt).not.toBeNull();

    const callsAfterHandoff = model.requests.length;
    await submitPublicConversationMessage(
      db,
      {
        token: created.publicToken,
        message: "Hello?",
        submissionId: `sub_${crypto.randomUUID()}`,
        rateLimitKey: "talk-2",
      },
      { model, modelId: "test-model" },
      unlimitedLimiter,
    );
    expect(model.requests.length).toBe(callsAfterHandoff);
    const thread = await getPublicConversationByToken(db, created.publicToken);
    expect(thread.messages.some((message) => message.content === "Hello?")).toBe(true);
    expect(thread.messages.some((message) => message.content === AI_HANDOFF_CUSTOMER_MESSAGE)).toBe(true);
  });

  it("declines a premature pricing handoff and keeps AI selling", async () => {
    const a = await provisionTenant("premature");
    const model = createFakeSalesAgentModel((request) => {
      const last = request.input.at(-1)?.content ?? "";
      if (last.includes("declined") || last.includes("Write the customer-facing reply")) {
        return {
          responseId: "resp_price_after_decline",
          outputText: "Have a Blast for 14 kids is $489.95.",
          functionCalls: [],
          usage: { inputTokens: 2, outputTokens: 4, totalTokens: 6 },
        };
      }
      if (request.input.some((item) => /How much would Have a Blast cost for 14 kids/i.test(item.content))) {
        return {
          responseId: "resp_premature",
          outputText: AI_HANDOFF_CUSTOMER_MESSAGE,
          functionCalls: [
            {
              callId: "hand",
              name: "request_human_handoff",
              arguments: JSON.stringify({
                reason:
                  "Current published package information available for this inquiry does not include Have a Blast Birthday Package pricing, so the requested estimate cannot be verified.",
                summary: "Customer asked for Have a Blast pricing.",
              }),
            },
          ],
          usage: { inputTokens: 2, outputTokens: 2, totalTokens: 4 },
        };
      }
      return {
        responseId: "resp_intake",
        outputText: "Have a Blast is a good fit for 14 kids.",
        functionCalls: [],
        usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
      };
    });

    const created = await createPublicInquiry(
      db,
      intake(a.organization.slug, "premature@example.com", { guestCount: 14 }),
      { model, modelId: "test-model" },
      unlimitedLimiter,
    );
    await submitPublicConversationMessage(
      db,
      {
        token: created.publicToken,
        message: "How much would Have a Blast cost for 14 kids?",
        submissionId: `sub_${crypto.randomUUID()}`,
        rateLimitKey: "premature",
      },
      { model, modelId: "test-model" },
      unlimitedLimiter,
    );

    const inquiry = await db.inquiry.findFirstOrThrow({ where: { id: created.inquiryId } });
    const thread = await getPublicConversationByToken(db, created.publicToken);
    expect(inquiry.aiHandlingEnabled).toBe(true);
    expect(inquiry.humanHandoffRequestedAt).toBeNull();
    expect(inquiry.status).not.toBe(INQUIRY_STATUSES.READY_FOR_HUMAN);
    expect(thread.messages.some((message) => message.content.includes("$489.95"))).toBe(true);
    expect(thread.messages.filter((message) => message.content === AI_HANDOFF_CUSTOMER_MESSAGE)).toHaveLength(0);
  });
});
