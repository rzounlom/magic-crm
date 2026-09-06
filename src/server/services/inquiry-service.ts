import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import {
  createPublicConversationToken,
  hashPublicConversationToken,
  isPlausiblePublicConversationToken,
} from "@/lib/ai/public-conversation-token";
import { getPublicRateLimiter, type RateLimiter } from "@/lib/ai/rate-limiter";
import { publicInquiryPathForActiveOrganization } from "@/lib/inquiries/organization-display-name";
import { AuthorizationError, InquiryError } from "@/server/errors";
import {
  isHoneypotFilled,
  normalizePublicEmail,
  publicConversationMessageSchema,
  publicIntakeSchema,
} from "@/server/inquiries/intake-validation";
import { requirePermission } from "@/server/policies/require-permission";
import type { RequestContext } from "@/server/request-context";
import { recordAuditEvent, recordSecurityAudit } from "@/server/services/audit";
import { runSalesAgentTurn, type SalesAgentRuntime } from "@/server/services/sales-agent-service";
import {
  CONVERSATION_CHANNELS,
  INQUIRY_SOURCES,
  INQUIRY_STATUSES,
  MESSAGE_DIRECTIONS,
  MESSAGE_SENDER_TYPES,
} from "@/types/inquiry";
import { PERMISSIONS } from "@/types/permissions";

type InquiryDb = PrismaClient;

export type PublicIntakeInput = {
  organizationSlug: string;
  rateLimitKey: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  eventType?: string;
  occasion?: string;
  preferredDate?: string;
  startTime?: string;
  guestCount?: number;
  notes?: string;
  companyWebsite?: string;
  submissionId: string;
};

export async function getCurrentTenantPublicInquiryPath(
  ctx: RequestContext,
  database: InquiryDb,
): Promise<string> {
  await requirePermission(ctx, PERMISSIONS.CRM_INQUIRIES_VIEW, database);
  const organization = await database.organization.findFirst({
    where: { id: ctx.organizationId },
    select: { slug: true, onboardingStatus: true },
  });
  const path = publicInquiryPathForActiveOrganization(organization);
  if (!path) {
    throw new AuthorizationError("FORBIDDEN");
  }
  return path;
}

export async function resolvePublicInquiryOrganization(
  database: InquiryDb,
  slug: string,
) {
  const organization = await database.organization.findFirst({
    where: { slug: slug.trim().toLowerCase() },
    select: { id: true, name: true, slug: true, onboardingStatus: true },
  });
  if (!organization || organization.onboardingStatus !== "ACTIVE") {
    throw new InquiryError("TENANT_NOT_AVAILABLE");
  }
  return organization;
}

export async function createPublicInquiry(
  database: InquiryDb,
  input: PublicIntakeInput,
  runtime: SalesAgentRuntime,
  rateLimiter: RateLimiter = getPublicRateLimiter(),
) {
  const parsed = publicIntakeSchema.safeParse(input);
  if (!parsed.success) {
    throw new InquiryError("INVALID_INTAKE");
  }
  if (isHoneypotFilled(parsed.data.companyWebsite)) {
    throw new InquiryError("INVALID_INTAKE");
  }

  const limited = await rateLimiter.consume(`intake:${input.rateLimitKey}`, 5, 10 * 60_000);
  if (!limited.ok) {
    throw new InquiryError("RATE_LIMITED");
  }

  const organization = await resolvePublicInquiryOrganization(database, input.organizationSlug);
  const emailNormalized = normalizePublicEmail(parsed.data.email);
  const { token, hash } = createPublicConversationToken();
  const desiredDate = parsed.data.preferredDate
    ? new Date(`${parsed.data.preferredDate}T00:00:00.000Z`)
    : null;

  const created = await database.$transaction(async (tx) => {
    const inquiry = await tx.inquiry.create({
      data: {
        organizationId: organization.id,
        status: INQUIRY_STATUSES.NEW,
        source: INQUIRY_SOURCES.WEB,
        customerFirstName: parsed.data.firstName,
        customerLastName: parsed.data.lastName,
        customerEmail: parsed.data.email.trim(),
        customerEmailNormalized: emailNormalized,
        customerPhone: parsed.data.phone || null,
        eventType: parsed.data.eventType,
        occasion: parsed.data.occasion?.trim() || null,
        desiredDate,
        desiredStartTime: parsed.data.startTime?.trim() || null,
        guestCount: parsed.data.guestCount ?? null,
        customerNotes: parsed.data.notes?.trim() || null,
        aiHandlingEnabled: true,
      },
    });

    const conversation = await tx.conversation.create({
      data: {
        organizationId: organization.id,
        inquiryId: inquiry.id,
        channel: CONVERSATION_CHANNELS.WEB,
        publicTokenHash: hash,
      },
    });

    const intakeText = formatIntakeMessage(parsed.data);
    await tx.conversationMessage.create({
      data: {
        organizationId: organization.id,
        conversationId: conversation.id,
        direction: MESSAGE_DIRECTIONS.INBOUND,
        senderType: MESSAGE_SENDER_TYPES.CUSTOMER,
        content: intakeText,
        clientSubmissionId: parsed.data.submissionId,
      },
    });

    await tx.conversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: new Date() },
    });

    return { inquiry, conversation };
  });

  await recordAuditEvent(database, {
    organizationId: organization.id,
    action: "inquiry.created",
    resourceType: "inquiry",
    resourceId: created.inquiry.id,
    metadata: { source: INQUIRY_SOURCES.WEB, channel: CONVERSATION_CHANNELS.WEB },
  });

  await runSalesAgentTurn(database, runtime, {
    organizationId: organization.id,
    organizationName: organization.name,
    inquiryId: created.inquiry.id,
    conversationId: created.conversation.id,
    trigger: "intake",
  });

  return {
    inquiryId: created.inquiry.id,
    conversationId: created.conversation.id,
    publicToken: token,
  };
}

export async function getPublicConversationByToken(database: InquiryDb, token: string) {
  if (!isPlausiblePublicConversationToken(token)) {
    throw new InquiryError("CONVERSATION_NOT_FOUND");
  }
  const hash = hashPublicConversationToken(token);
  const conversation = await database.conversation.findFirst({
    where: { publicTokenHash: hash, channel: CONVERSATION_CHANNELS.WEB },
    include: {
      inquiry: true,
      messages: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          direction: true,
          senderType: true,
          content: true,
          createdAt: true,
        },
      },
      organization: { select: { name: true, slug: true } },
    },
  });
  if (!conversation) {
    throw new InquiryError("CONVERSATION_NOT_FOUND");
  }

  return {
    organizationName: conversation.organization.name,
    organizationSlug: conversation.organization.slug,
    inquiry: {
      status: conversation.inquiry.status,
      aiHandlingEnabled: conversation.inquiry.aiHandlingEnabled,
      customerFirstName: conversation.inquiry.customerFirstName,
    },
    messages: conversation.messages.filter(
      (message) =>
        message.senderType === MESSAGE_SENDER_TYPES.CUSTOMER ||
        message.senderType === MESSAGE_SENDER_TYPES.AI ||
        message.senderType === MESSAGE_SENDER_TYPES.EMPLOYEE ||
        message.senderType === MESSAGE_SENDER_TYPES.SYSTEM,
    ),
  };
}

export async function submitPublicConversationMessage(
  database: InquiryDb,
  input: {
    token: string;
    message: string;
    submissionId: string;
    rateLimitKey: string;
  },
  runtime: SalesAgentRuntime,
  rateLimiter: RateLimiter = getPublicRateLimiter(),
) {
  const parsed = publicConversationMessageSchema.safeParse(input);
  if (!parsed.success) {
    throw new InquiryError("INVALID_INTAKE");
  }
  if (!isPlausiblePublicConversationToken(input.token)) {
    throw new InquiryError("CONVERSATION_NOT_FOUND");
  }

  const limited = await rateLimiter.consume(`message:${input.rateLimitKey}`, 10, 10 * 60_000);
  if (!limited.ok) {
    throw new InquiryError("RATE_LIMITED");
  }

  const hash = hashPublicConversationToken(input.token);
  const conversation = await database.conversation.findFirst({
    where: { publicTokenHash: hash },
    include: {
      inquiry: true,
      organization: { select: { name: true } },
    },
  });
  if (!conversation) {
    throw new InquiryError("CONVERSATION_NOT_FOUND");
  }

  try {
    await database.conversationMessage.create({
      data: {
        organizationId: conversation.organizationId,
        conversationId: conversation.id,
        direction: MESSAGE_DIRECTIONS.INBOUND,
        senderType: MESSAGE_SENDER_TYPES.CUSTOMER,
        content: parsed.data.message,
        clientSubmissionId: parsed.data.submissionId,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new InquiryError("DUPLICATE_SUBMISSION");
    }
    throw error;
  }

  await database.conversation.update({
    where: { id: conversation.id },
    data: { lastMessageAt: new Date() },
  });

  if (conversation.inquiry.aiHandlingEnabled) {
    await runSalesAgentTurn(database, runtime, {
      organizationId: conversation.organizationId,
      organizationName: conversation.organization.name,
      inquiryId: conversation.inquiryId,
      conversationId: conversation.id,
      trigger: "message",
    });
  }

  return getPublicConversationByToken(database, input.token);
}

export async function listInquiries(ctx: RequestContext, database: InquiryDb) {
  await requirePermission(ctx, PERMISSIONS.CRM_INQUIRIES_VIEW, database);
  return database.inquiry.findMany({
    where: { organizationId: ctx.organizationId },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      conversations: {
        orderBy: { createdAt: "asc" },
        take: 1,
        select: {
          lastMessageAt: true,
          messages: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { content: true, senderType: true, createdAt: true },
          },
        },
      },
    },
  });
}

export async function getInquiryDetail(
  ctx: RequestContext,
  database: InquiryDb,
  inquiryId: string,
) {
  await requirePermission(ctx, PERMISSIONS.CRM_INQUIRIES_VIEW, database);
  return database.inquiry.findFirst({
    where: { id: inquiryId, organizationId: ctx.organizationId },
    include: {
      conversations: {
        include: {
          messages: { orderBy: { createdAt: "asc" } },
        },
      },
    },
  });
}

export async function takeOverInquiry(
  ctx: RequestContext,
  database: InquiryDb,
  inquiryId: string,
) {
  await requirePermission(ctx, PERMISSIONS.CRM_INQUIRIES_MANAGE, database);
  const inquiry = await database.inquiry.findFirst({
    where: { id: inquiryId, organizationId: ctx.organizationId },
  });
  if (!inquiry) {
    throw new AuthorizationError("FORBIDDEN");
  }

  const updated = await database.inquiry.update({
    where: { id: inquiry.id },
    data: {
      aiHandlingEnabled: false,
      status: INQUIRY_STATUSES.READY_FOR_HUMAN,
      assignedUserProfileId: ctx.userId,
      humanHandoffRequestedAt: inquiry.humanHandoffRequestedAt ?? new Date(),
      humanHandoffReason: inquiry.humanHandoffReason ?? "Employee took over the conversation.",
    },
  });

  await recordSecurityAudit(database, ctx, {
    action: "employee.conversation_taken_over",
    resourceType: "inquiry",
    resourceId: inquiry.id,
  });
  await recordSecurityAudit(database, ctx, {
    action: "ai.paused",
    resourceType: "inquiry",
    resourceId: inquiry.id,
  });

  return updated;
}

export async function resumeInquiryAi(
  ctx: RequestContext,
  database: InquiryDb,
  inquiryId: string,
) {
  await requirePermission(ctx, PERMISSIONS.CRM_INQUIRIES_MANAGE, database);
  const inquiry = await database.inquiry.findFirst({
    where: { id: inquiryId, organizationId: ctx.organizationId },
  });
  if (!inquiry) {
    throw new AuthorizationError("FORBIDDEN");
  }

  const updated = await database.inquiry.update({
    where: { id: inquiry.id },
    data: {
      aiHandlingEnabled: true,
      status:
        inquiry.status === INQUIRY_STATUSES.READY_FOR_HUMAN ||
        inquiry.status === INQUIRY_STATUSES.NEEDS_FOLLOW_UP
          ? INQUIRY_STATUSES.AI_ENGAGED
          : inquiry.status,
      humanHandoffRequestedAt: null,
      humanHandoffReason: null,
    },
  });

  await recordSecurityAudit(database, ctx, {
    action: "ai.resumed",
    resourceType: "inquiry",
    resourceId: inquiry.id,
  });
  return updated;
}

export async function addEmployeeConversationMessage(
  ctx: RequestContext,
  database: InquiryDb,
  input: { inquiryId: string; conversationId: string; content: string },
) {
  await requirePermission(ctx, PERMISSIONS.CRM_INQUIRIES_MANAGE, database);
  const content = input.content.trim();
  if (!content || content.length > 2000) {
    throw new InquiryError("INVALID_INTAKE");
  }

  const conversation = await database.conversation.findFirst({
    where: {
      id: input.conversationId,
      inquiryId: input.inquiryId,
      organizationId: ctx.organizationId,
    },
  });
  if (!conversation) {
    throw new AuthorizationError("FORBIDDEN");
  }

  await database.conversationMessage.create({
    data: {
      organizationId: ctx.organizationId,
      conversationId: conversation.id,
      direction: MESSAGE_DIRECTIONS.OUTBOUND,
      senderType: MESSAGE_SENDER_TYPES.EMPLOYEE,
      content,
    },
  });
  await database.conversation.update({
    where: { id: conversation.id },
    data: { lastMessageAt: new Date() },
  });
}

function formatIntakeMessage(input: {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  eventType?: string;
  occasion?: string;
  preferredDate?: string;
  startTime?: string;
  guestCount?: number;
  notes?: string;
}): string {
  const lines = [
    `${input.firstName} ${input.lastName} submitted an event inquiry.`,
    `Email: ${input.email}`,
  ];
  if (input.phone) lines.push(`Phone: ${input.phone}`);
  if (input.eventType) lines.push(`Planning: ${input.eventType}`);
  if (input.occasion) lines.push(`Occasion: ${input.occasion}`);
  if (input.preferredDate) lines.push(`Preferred date: ${input.preferredDate}`);
  if (input.startTime) lines.push(`Approximate start: ${input.startTime}`);
  if (input.guestCount) lines.push(`Guest count: ${input.guestCount}`);
  if (input.notes) lines.push(`Notes: ${input.notes}`);
  return lines.join("\n");
}
