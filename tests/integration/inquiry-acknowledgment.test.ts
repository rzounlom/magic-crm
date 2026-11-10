import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

import { createMemoryRateLimiter } from "@/lib/ai/rate-limiter";
import {
  ConsoleEmailProvider,
  ResendEmailProvider,
  type EmailProvider,
  type OutboundEmailMessage,
  type OutboundEmailResult,
} from "@/server/communications/email-provider";
import { resolveWpCustomerQuoteDeliveryPolicy } from "@/server/event-planner/wp-parity/pricing-verification";
import {
  sendInquiryAcknowledgment,
  trySendInquiryAcknowledgment,
} from "@/server/services/inquiry-acknowledgment-service";
import { createPublicWpEventInquiry } from "@/server/services/inquiry-service";
import { provisionOrganization } from "@/server/services/provision-organization";
import {
  COMMUNICATION_KINDS,
  COMMUNICATION_SKIP_REASONS,
  COMMUNICATION_STATUSES,
} from "@/types/communications";
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
  vi.unstubAllEnvs();
});

afterAll(async () => {
  await db.$disconnect();
});

async function provisionTenant(name: string) {
  const slug = `ack-${name}-${crypto.randomUUID()}`;
  const provisioned = await provisionOrganization(
    {
      clerkUserId: `user_ack_${crypto.randomUUID()}`,
      clerkOrganizationId: `clerk_org_ack_${crypto.randomUUID()}`,
      organizationName: name,
      organizationSlug: slug,
      isClerkOrganizationAdmin: true,
    },
    db,
  );
  createdOrganizationIds.push(provisioned.organizationId);
  return db.organization.findFirstOrThrow({ where: { id: provisioned.organizationId } });
}

function baseInquiryInput(organizationSlug: string, email: string) {
  return {
    organizationSlug,
    rateLimitKey: `${organizationSlug}:${email}`,
    firstName: "Ada",
    lastName: "Lovelace",
    company: "Analytical Engines",
    phone: "5745550100",
    email,
    eventType: "Birthday",
    dates: [EVENT_DATE],
    time: "17:00",
    adults: 10,
    children: 2,
    duration: "2 hours",
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
    description: "Birthday celebration.",
    referral: "Friend",
    submissionId: `sub_ack_${crypto.randomUUID()}`,
  };
}

async function insertBareInquiry(organizationId: string, email: string) {
  return db.inquiry.create({
    data: {
      organizationId,
      status: "READY_FOR_HUMAN",
      source: "WEB",
      customerFirstName: "Ada",
      customerLastName: "Lovelace",
      customerEmail: email,
      customerEmailNormalized: email.toLowerCase(),
      salesStage: "INQUIRY",
    },
    select: { id: true },
  });
}

class FailingEmailProvider implements EmailProvider {
  readonly name = "failing-test";
  async send(_message: OutboundEmailMessage): Promise<OutboundEmailResult> {
    void _message;
    return {
      status: COMMUNICATION_STATUSES.FAILED,
      provider: this.name,
      errorMessage: "simulated provider outage",
    };
  }
}

class ThrowingEmailProvider implements EmailProvider {
  readonly name = "throwing-test";
  async send(): Promise<OutboundEmailResult> {
    throw new Error("unexpected provider crash");
  }
}

describe("inquiry acknowledgment", () => {
  it("records SKIPPED acknowledgment when email provider is disabled (default)", async () => {
    vi.stubEnv("EMAIL_PROVIDER", "none");
    const organization = await provisionTenant("Ack None Org");
    const email = `ack.none.${crypto.randomUUID()}@example.test`;

    const created = await createPublicWpEventInquiry(
      db,
      baseInquiryInput(organization.slug, email),
      unlimitedLimiter,
    );

    const comms = await db.communicationEvent.findMany({
      where: {
        organizationId: organization.id,
        inquiryId: created.inquiryId,
        kind: COMMUNICATION_KINDS.INQUIRY_ACKNOWLEDGMENT,
      },
    });
    expect(comms).toHaveLength(1);
    expect(comms[0]?.status).toBe(COMMUNICATION_STATUSES.SKIPPED);
    expect(comms[0]?.skipReason).toBe(COMMUNICATION_SKIP_REASONS.NO_EMAIL_PROVIDER);
    expect(comms[0]?.toAddress?.toLowerCase()).toBe(email.toLowerCase());
    expect(comms[0]?.subject).toBe("We received your event request");

    expect(
      await db.communicationEvent.count({
        where: {
          organizationId: organization.id,
          kind: COMMUNICATION_KINDS.EMPLOYEE_APPROVED_QUOTE,
        },
      }),
    ).toBe(0);

    const payload = comms[0]?.payload as {
      textBody?: string;
      quoteDelivery?: boolean;
      includesPricing?: boolean;
    };
    expect(payload.quoteDelivery).toBe(false);
    expect(payload.includesPricing).toBe(false);
    expect(payload.textBody?.toLowerCase()).not.toMatch(/\$|deposit|booked|payment/);
    expect(payload.textBody?.toLowerCase()).not.toContain("plugin_defaults");
  }, 90_000);

  it("sends once via console and ignores duplicate retries", async () => {
    const organization = await provisionTenant("Ack Console Org");
    const email = `ack.sent.${crypto.randomUUID()}@example.test`;
    const inquiry = await insertBareInquiry(organization.id, email);

    const sent = await sendInquiryAcknowledgment(
      db,
      {
        organizationId: organization.id,
        organizationName: organization.name,
        inquiryId: inquiry.id,
        customerEmail: email,
        customerFirstName: "Ada",
      },
      new ConsoleEmailProvider(),
    );
    expect(sent.status).toBe(COMMUNICATION_STATUSES.SENT);
    expect(sent.provider).toBe("console");
    expect(sent.idempotent).toBe(false);

    const again = await sendInquiryAcknowledgment(
      db,
      {
        organizationId: organization.id,
        organizationName: organization.name,
        inquiryId: inquiry.id,
        customerEmail: email,
        customerFirstName: "Ada",
      },
      new ConsoleEmailProvider(),
    );
    expect(again.idempotent).toBe(true);
    expect(again.communicationEventId).toBe(sent.communicationEventId);
    expect(
      await db.communicationEvent.count({
        where: {
          organizationId: organization.id,
          inquiryId: inquiry.id,
          kind: COMMUNICATION_KINDS.INQUIRY_ACKNOWLEDGMENT,
        },
      }),
    ).toBe(1);
  }, 90_000);

  it("records FAILED when the provider returns failure without dropping the inquiry", async () => {
    const organization = await provisionTenant("Ack Fail Org");
    const email = `ack.fail.${crypto.randomUUID()}@example.test`;
    const inquiry = await insertBareInquiry(organization.id, email);

    const result = await sendInquiryAcknowledgment(
      db,
      {
        organizationId: organization.id,
        organizationName: organization.name,
        inquiryId: inquiry.id,
        customerEmail: email,
        customerFirstName: "Ada",
      },
      new FailingEmailProvider(),
    );
    expect(result.status).toBe(COMMUNICATION_STATUSES.FAILED);
    expect(await db.inquiry.findFirst({ where: { id: inquiry.id } })).toBeTruthy();
  }, 90_000);

  it("soft-fails unexpected provider crashes so inquiry create still succeeds", async () => {
    const organization = await provisionTenant("Ack Soft Org");
    const email = `ack.soft.${crypto.randomUUID()}@example.test`;
    const created = await createPublicWpEventInquiry(
      db,
      baseInquiryInput(organization.slug, email),
      unlimitedLimiter,
    );
    expect(created.inquiryId).toBeTruthy();

    const inquiry = await insertBareInquiry(organization.id, email);
    const crashed = await trySendInquiryAcknowledgment(
      db,
      {
        organizationId: organization.id,
        organizationName: organization.name,
        inquiryId: inquiry.id,
        customerEmail: email,
      },
      new ThrowingEmailProvider(),
    );
    expect(crashed).toBeNull();
    expect(await db.inquiry.findFirst({ where: { id: inquiry.id } })).toBeTruthy();
  }, 90_000);

  it("keeps acknowledgments tenant-scoped (no cross-tenant leakage)", async () => {
    const orgA = await provisionTenant("Ack Tenant A");
    const orgB = await provisionTenant("Ack Tenant B");
    const emailA = `a.${crypto.randomUUID()}@example.test`;
    const emailB = `b.${crypto.randomUUID()}@example.test`;

    const createdA = await createPublicWpEventInquiry(
      db,
      baseInquiryInput(orgA.slug, emailA),
      unlimitedLimiter,
    );
    const createdB = await createPublicWpEventInquiry(
      db,
      baseInquiryInput(orgB.slug, emailB),
      unlimitedLimiter,
    );

    const commsA = await db.communicationEvent.findMany({
      where: { organizationId: orgA.id, kind: COMMUNICATION_KINDS.INQUIRY_ACKNOWLEDGMENT },
    });
    const commsB = await db.communicationEvent.findMany({
      where: { organizationId: orgB.id, kind: COMMUNICATION_KINDS.INQUIRY_ACKNOWLEDGMENT },
    });
    expect(commsA).toHaveLength(1);
    expect(commsB).toHaveLength(1);
    expect(commsA[0]?.inquiryId).toBe(createdA.inquiryId);
    expect(commsB[0]?.inquiryId).toBe(createdB.inquiryId);
    expect(commsA[0]?.toAddress?.toLowerCase()).toBe(emailA.toLowerCase());
    expect(commsB[0]?.toAddress?.toLowerCase()).toBe(emailB.toLowerCase());
    expect(commsA[0]?.organizationId).not.toBe(commsB[0]?.organizationId);

    const leaked = await db.communicationEvent.findFirst({
      where: {
        organizationId: orgA.id,
        toAddress: { equals: emailB, mode: "insensitive" },
      },
    });
    expect(leaked).toBeNull();
  }, 90_000);

  it("skips invalid email safely without invoking quote delivery", async () => {
    const organization = await provisionTenant("Ack Invalid Email Org");
    const inquiry = await insertBareInquiry(organization.id, "not-an-email");
    const result = await sendInquiryAcknowledgment(
      db,
      {
        organizationId: organization.id,
        organizationName: organization.name,
        inquiryId: inquiry.id,
        customerEmail: "not-an-email",
        customerFirstName: "Ada",
      },
      new ConsoleEmailProvider(),
    );
    expect(result.status).toBe(COMMUNICATION_STATUSES.SKIPPED);
    expect(result.skipReason).toBe(COMMUNICATION_SKIP_REASONS.INVALID_EMAIL);
    expect(
      await db.communicationEvent.count({
        where: {
          organizationId: organization.id,
          kind: COMMUNICATION_KINDS.EMPLOYEE_APPROVED_QUOTE,
        },
      }),
    ).toBe(0);
  }, 90_000);

  it("records Resend failure result without throwing", async () => {
    const organization = await provisionTenant("Ack Resend Fail Org");
    const email = `ack.resend.${crypto.randomUUID()}@example.test`;
    const inquiry = await insertBareInquiry(organization.id, email);
    const fetchImpl = vi.fn(async () =>
      Response.json({ message: "rate limited" }, { status: 429 }),
    ) as unknown as typeof fetch;
    const result = await sendInquiryAcknowledgment(
      db,
      {
        organizationId: organization.id,
        organizationName: organization.name,
        inquiryId: inquiry.id,
        customerEmail: email,
      },
      new ResendEmailProvider("re_test", "Events <events@example.test>", fetchImpl),
    );
    expect(result.status).toBe(COMMUNICATION_STATUSES.FAILED);
    expect(fetchImpl).toHaveBeenCalledOnce();
  }, 90_000);

  it("does not change customer quote-delivery policy gates", () => {
    expect(
      resolveWpCustomerQuoteDeliveryPolicy({
        status: "ready",
        pricingSource: "approved_plugin_baseline",
      }).canDeliver,
    ).toBe(false);
    expect(
      resolveWpCustomerQuoteDeliveryPolicy({
        status: "ready",
        pricingSource: "plugin_defaults",
      }).canDeliver,
    ).toBe(false);
    expect(
      resolveWpCustomerQuoteDeliveryPolicy({
        status: "ready",
        pricingSource: "tenant_live",
      }).canDeliver,
    ).toBe(true);
  });
});
