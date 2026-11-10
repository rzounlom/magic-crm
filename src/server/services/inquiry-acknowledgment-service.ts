/**
 * Automatic customer inquiry acknowledgment.
 *
 * Separate from employee-approved quote delivery. Never includes prices,
 * private calculation results, availability promises, booking claims, or payment links.
 *
 * Concurrency: insert CommunicationEvent first (QUEUED/SKIPPED). A partial unique
 * index on (organizationId, inquiryId) WHERE kind = INQUIRY_ACKNOWLEDGMENT makes
 * the insert the atomic claim — losers return the winner's row and never call the
 * provider. Retries are explicit: an existing row (any status) is never auto-resent.
 *
 * SKIPPED (NO_EMAIL_PROVIDER) rows created before email activation are not
 * backfilled. Enabling Resend only affects new successful inquiry creates.
 *
 * Failures are recorded on CommunicationEvent / audit — callers should soft-fail
 * so a mailer outage cannot invalidate a successful inquiry submission.
 */

import { Prisma, type PrismaClient } from "@/generated/prisma/client";

import {
  buildInquiryAcknowledgmentEmail,
} from "@/lib/event-planner/inquiry-acknowledgment";
import { normalizePublicEmail } from "@/server/inquiries/intake-validation";
import {
  createEmailProvider,
  type EmailProvider,
} from "@/server/communications/email-provider";
import { recordAuditEvent } from "@/server/services/audit";
import { isValidInvitationEmail } from "@/server/team/invitation-email";
import {
  COMMUNICATION_CHANNELS,
  COMMUNICATION_KINDS,
  COMMUNICATION_SKIP_REASONS,
  COMMUNICATION_STATUSES,
} from "@/types/communications";

type AckDb = PrismaClient;

export type SendInquiryAcknowledgmentInput = {
  organizationId: string;
  organizationName: string;
  inquiryId: string;
  customerEmail: string;
  customerFirstName?: string | null;
  customerLastName?: string | null;
};

export type SendInquiryAcknowledgmentResult = {
  status: (typeof COMMUNICATION_STATUSES)[keyof typeof COMMUNICATION_STATUSES];
  skipReason: string | null;
  provider: string;
  providerMessageId: string | null;
  idempotent: boolean;
  communicationEventId: string | null;
};

export function inquiryAcknowledgmentIdempotencyKey(inquiryId: string): string {
  return `inquiry_acknowledgment:${inquiryId}`;
}

function resultFromExisting(existing: {
  id: string;
  status: string;
  skipReason: string | null;
  providerMessageId: string | null;
  payload: unknown;
}): SendInquiryAcknowledgmentResult {
  const payload =
    existing.payload && typeof existing.payload === "object"
      ? (existing.payload as { emailProvider?: string })
      : null;
  return {
    status:
      (existing.status as (typeof COMMUNICATION_STATUSES)[keyof typeof COMMUNICATION_STATUSES]) ??
      COMMUNICATION_STATUSES.SKIPPED,
    skipReason: existing.skipReason,
    provider: payload?.emailProvider ? String(payload.emailProvider) : "none",
    providerMessageId: existing.providerMessageId,
    idempotent: true,
    communicationEventId: existing.id,
  };
}

async function findAcknowledgment(
  database: AckDb,
  organizationId: string,
  inquiryId: string,
) {
  return database.communicationEvent.findFirst({
    where: {
      organizationId,
      inquiryId,
      kind: COMMUNICATION_KINDS.INQUIRY_ACKNOWLEDGMENT,
    },
    orderBy: { createdAt: "asc" },
  });
}

function isUniqueClaimConflict(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

/**
 * Send (or record) one inquiry acknowledgment for a successfully created inquiry.
 *
 * Atomic claim: create the CommunicationEvent before any provider call. Concurrent
 * creators lose on the partial unique index and return the existing row without sending.
 */
export async function sendInquiryAcknowledgment(
  database: AckDb,
  input: SendInquiryAcknowledgmentInput,
  provider: EmailProvider = createEmailProvider(),
): Promise<SendInquiryAcknowledgmentResult> {
  const idempotencyKey = inquiryAcknowledgmentIdempotencyKey(input.inquiryId);
  const existing = await findAcknowledgment(database, input.organizationId, input.inquiryId);
  if (existing) {
    return resultFromExisting(existing);
  }

  const content = buildInquiryAcknowledgmentEmail({
    organizationName: input.organizationName,
    customerFirstName: input.customerFirstName,
    customerLastName: input.customerLastName,
  });

  if (!isValidInvitationEmail(input.customerEmail)) {
    try {
      const row = await database.communicationEvent.create({
        data: {
          organizationId: input.organizationId,
          channel: COMMUNICATION_CHANNELS.EMAIL,
          kind: COMMUNICATION_KINDS.INQUIRY_ACKNOWLEDGMENT,
          status: COMMUNICATION_STATUSES.SKIPPED,
          skipReason: COMMUNICATION_SKIP_REASONS.INVALID_EMAIL,
          toAddress: input.customerEmail?.trim() || null,
          subject: content.subject,
          inquiryId: input.inquiryId,
          payload: {
            idempotencyKey,
            emailProvider: provider.name,
            organizationName: input.organizationName,
            reserved: false,
            quoteDelivery: false,
            includesPricing: false,
          } as Prisma.InputJsonValue,
        },
      });
      await recordAuditEvent(database, {
        organizationId: input.organizationId,
        action: "communication.inquiry_acknowledgment_skipped",
        resourceType: "inquiry",
        resourceId: input.inquiryId,
        metadata: {
          kind: COMMUNICATION_KINDS.INQUIRY_ACKNOWLEDGMENT,
          skipReason: COMMUNICATION_SKIP_REASONS.INVALID_EMAIL,
          emailProvider: provider.name,
        },
      });
      return {
        status: COMMUNICATION_STATUSES.SKIPPED,
        skipReason: COMMUNICATION_SKIP_REASONS.INVALID_EMAIL,
        provider: provider.name,
        providerMessageId: null,
        idempotent: false,
        communicationEventId: row.id,
      };
    } catch (error) {
      if (isUniqueClaimConflict(error)) {
        const winner = await findAcknowledgment(database, input.organizationId, input.inquiryId);
        if (winner) {
          return resultFromExisting(winner);
        }
      }
      throw error;
    }
  }

  const to = normalizePublicEmail(input.customerEmail.trim());

  let claimed;
  try {
    claimed = await database.communicationEvent.create({
      data: {
        organizationId: input.organizationId,
        channel: COMMUNICATION_CHANNELS.EMAIL,
        kind: COMMUNICATION_KINDS.INQUIRY_ACKNOWLEDGMENT,
        status: COMMUNICATION_STATUSES.QUEUED,
        skipReason: null,
        toAddress: to,
        subject: content.subject,
        inquiryId: input.inquiryId,
        payload: {
          subject: content.subject,
          textBody: content.textBody,
          htmlBody: content.htmlBody,
          organizationName: input.organizationName,
          idempotencyKey,
          emailProvider: provider.name,
          reserved: false,
          quoteDelivery: false,
          includesPricing: false,
        } as Prisma.InputJsonValue,
      },
    });
  } catch (error) {
    if (isUniqueClaimConflict(error)) {
      const winner = await findAcknowledgment(database, input.organizationId, input.inquiryId);
      if (winner) {
        return resultFromExisting(winner);
      }
    }
    throw error;
  }

  // Only the claim winner reaches the provider. Resend also receives Idempotency-Key.
  const sendResult = await provider.send({
    to,
    subject: content.subject,
    textBody: content.textBody,
    htmlBody: content.htmlBody,
    idempotencyKey,
    metadata: {
      inquiryId: input.inquiryId,
      organizationId: input.organizationId,
      kind: COMMUNICATION_KINDS.INQUIRY_ACKNOWLEDGMENT,
    },
  });

  const status = sendResult.status;
  const skipReason =
    sendResult.status === COMMUNICATION_STATUSES.SKIPPED ? sendResult.skipReason : null;
  const errorMessage =
    sendResult.status === COMMUNICATION_STATUSES.FAILED ? sendResult.errorMessage : null;
  const providerMessageId =
    sendResult.status === COMMUNICATION_STATUSES.SENT ? sendResult.providerMessageId : null;

  const row = await database.communicationEvent.update({
    where: { id: claimed.id },
    data: {
      status,
      skipReason,
      providerMessageId,
      sentAt: status === COMMUNICATION_STATUSES.SENT ? new Date() : null,
      payload: {
        subject: content.subject,
        textBody: content.textBody,
        htmlBody: content.htmlBody,
        organizationName: input.organizationName,
        idempotencyKey,
        emailProvider: sendResult.provider,
        reserved: false,
        quoteDelivery: false,
        includesPricing: false,
        errorMessage,
      } as Prisma.InputJsonValue,
    },
  });

  if (status === COMMUNICATION_STATUSES.SKIPPED) {
    await recordAuditEvent(database, {
      organizationId: input.organizationId,
      action: "communication.inquiry_acknowledgment_skipped",
      resourceType: "inquiry",
      resourceId: input.inquiryId,
      metadata: {
        kind: COMMUNICATION_KINDS.INQUIRY_ACKNOWLEDGMENT,
        skipReason,
        emailProvider: sendResult.provider,
      },
    });
  } else if (status === COMMUNICATION_STATUSES.FAILED) {
    await recordAuditEvent(database, {
      organizationId: input.organizationId,
      action: "communication.inquiry_acknowledgment_failed",
      resourceType: "inquiry",
      resourceId: input.inquiryId,
      metadata: {
        kind: COMMUNICATION_KINDS.INQUIRY_ACKNOWLEDGMENT,
        emailProvider: sendResult.provider,
        errorMessage: errorMessage ?? "",
      },
    });
  } else if (status === COMMUNICATION_STATUSES.SENT) {
    await recordAuditEvent(database, {
      organizationId: input.organizationId,
      action: "communication.inquiry_acknowledgment_sent",
      resourceType: "inquiry",
      resourceId: input.inquiryId,
      metadata: {
        kind: COMMUNICATION_KINDS.INQUIRY_ACKNOWLEDGMENT,
        emailProvider: sendResult.provider,
        providerMessageId: providerMessageId ?? "",
      },
    });
  }

  return {
    status,
    skipReason,
    provider: sendResult.provider,
    providerMessageId,
    idempotent: false,
    communicationEventId: row.id,
  };
}

/**
 * Soft wrapper for inquiry create — never throws; logs to console on unexpected errors.
 * Does not log provider credentials.
 */
export async function trySendInquiryAcknowledgment(
  database: AckDb,
  input: SendInquiryAcknowledgmentInput,
  provider?: EmailProvider,
): Promise<SendInquiryAcknowledgmentResult | null> {
  try {
    return await sendInquiryAcknowledgment(database, input, provider ?? createEmailProvider());
  } catch (error) {
    console.error("[inquiry-acknowledgment] soft-fail after inquiry create", {
      inquiryId: input.inquiryId,
      organizationId: input.organizationId,
      message: error instanceof Error ? error.message : "unknown",
    });
    try {
      await recordAuditEvent(database, {
        organizationId: input.organizationId,
        action: "communication.inquiry_acknowledgment_failed",
        resourceType: "inquiry",
        resourceId: input.inquiryId,
        metadata: {
          kind: COMMUNICATION_KINDS.INQUIRY_ACKNOWLEDGMENT,
          softFail: true,
          errorMessage: error instanceof Error ? error.message.slice(0, 300) : "unknown",
        },
      });
    } catch {
      // Last resort: never surface acknowledgment failures to the customer submit path.
    }
    return null;
  }
}
