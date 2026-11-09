/**
 * Outbound email adapter for CommunicationEvent delivery.
 *
 * Production live providers are not enabled in Phase 7C. Supported modes:
 * - `none` (default): record SKIPPED / NO_EMAIL_PROVIDER — no network send
 * - `console`: log payload locally; mark SENT without a provider message id
 *
 * Set EMAIL_PROVIDER=none|console. Never use this PR for live customer email.
 */

import {
  COMMUNICATION_SKIP_REASONS,
  COMMUNICATION_STATUSES,
  type CommunicationSkipReason,
  type CommunicationStatus,
} from "@/types/communications";

export type OutboundEmailMessage = {
  to: string;
  subject: string;
  textBody: string;
  htmlBody?: string;
  idempotencyKey: string;
  metadata?: Record<string, string | number | boolean | null>;
};

export type OutboundEmailResult =
  | {
      status: typeof COMMUNICATION_STATUSES.SENT;
      provider: string;
      providerMessageId: string | null;
    }
  | {
      status: typeof COMMUNICATION_STATUSES.SKIPPED;
      provider: string;
      skipReason: CommunicationSkipReason;
    }
  | {
      status: typeof COMMUNICATION_STATUSES.FAILED;
      provider: string;
      errorMessage: string;
    };

export type EmailProvider = {
  readonly name: string;
  send(message: OutboundEmailMessage): Promise<OutboundEmailResult>;
};

export class NullEmailProvider implements EmailProvider {
  readonly name = "none";

  async send(message: OutboundEmailMessage): Promise<OutboundEmailResult> {
    void message;
    return {
      status: COMMUNICATION_STATUSES.SKIPPED,
      provider: this.name,
      skipReason: COMMUNICATION_SKIP_REASONS.NO_EMAIL_PROVIDER,
    };
  }
}

/** Local/dev only — never contacts an external SMTP/API. */
export class ConsoleEmailProvider implements EmailProvider {
  readonly name = "console";

  async send(message: OutboundEmailMessage): Promise<OutboundEmailResult> {
    console.info("[email:console]", {
      to: message.to,
      subject: message.subject,
      idempotencyKey: message.idempotencyKey,
      preview: message.textBody.slice(0, 240),
    });
    return {
      status: COMMUNICATION_STATUSES.SENT,
      provider: this.name,
      providerMessageId: `console:${message.idempotencyKey}`,
    };
  }
}

export type EmailProviderMode = "none" | "console";

export function resolveEmailProviderMode(
  source: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): EmailProviderMode {
  const raw = (source.EMAIL_PROVIDER ?? "none").trim().toLowerCase();
  if (raw === "console") {
    return "console";
  }
  return "none";
}

export function createEmailProvider(
  source: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): EmailProvider {
  return resolveEmailProviderMode(source) === "console"
    ? new ConsoleEmailProvider()
    : new NullEmailProvider();
}

export function communicationStatusFromEmailResult(
  result: OutboundEmailResult,
): CommunicationStatus {
  return result.status;
}
