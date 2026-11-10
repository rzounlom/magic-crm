/**
 * Outbound email adapter for CommunicationEvent delivery.
 *
 * Modes (EMAIL_PROVIDER):
 * - `none` (default): SKIPPED / NO_EMAIL_PROVIDER — no network send
 * - `console`: log locally; mark SENT with console: message id (dev only)
 * - `resend`: HTTP send via Resend when RESEND_API_KEY + EMAIL_FROM are set
 *
 * Real sending is never the default. Missing Resend credentials fall back to
 * SKIPPED (not a silent network attempt). Unknown modes resolve to `none`.
 *
 * Sender identity always comes from EMAIL_FROM for Resend — callers cannot
 * override From with a tenant-spoofed address.
 */

import {
  COMMUNICATION_SKIP_REASONS,
  COMMUNICATION_STATUSES,
  type CommunicationSkipReason,
  type CommunicationStatus,
} from "@/types/communications";

/** Bound Resend HTTP so hung sockets cannot leave uncontrolled in-flight retries. */
export const RESEND_REQUEST_TIMEOUT_MS = 10_000;

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

/**
 * Resend HTTP API. Activated only when EMAIL_PROVIDER=resend and credentials exist.
 * Uses fetch — no extra dependency. Does not send during unit tests unless injected.
 * API keys are never written to result payloads or thrown error messages.
 */
export class ResendEmailProvider implements EmailProvider {
  readonly name = "resend";

  constructor(
    private readonly apiKey: string,
    private readonly defaultFrom: string,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly timeoutMs: number = RESEND_REQUEST_TIMEOUT_MS,
  ) {}

  async send(message: OutboundEmailMessage): Promise<OutboundEmailResult> {
    const from = this.defaultFrom.trim();
    if (!from || !from.includes("@")) {
      return {
        status: COMMUNICATION_STATUSES.FAILED,
        provider: this.name,
        errorMessage: "EMAIL_FROM is missing or invalid.",
      };
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": message.idempotencyKey,
        },
        body: JSON.stringify({
          from,
          to: [message.to],
          subject: message.subject,
          text: message.textBody,
          ...(message.htmlBody ? { html: message.htmlBody } : {}),
        }),
        signal: controller.signal,
      });
      const body = (await response.json().catch(() => null)) as
        | { id?: string; message?: string; name?: string }
        | null;
      if (!response.ok) {
        return {
          status: COMMUNICATION_STATUSES.FAILED,
          provider: this.name,
          errorMessage: sanitizeProviderError(
            (body && typeof body.message === "string" && body.message) ||
              `Resend HTTP ${response.status}`,
          ),
        };
      }
      return {
        status: COMMUNICATION_STATUSES.SENT,
        provider: this.name,
        providerMessageId: typeof body?.id === "string" ? body.id : null,
      };
    } catch (error) {
      const aborted =
        (error instanceof Error && error.name === "AbortError") ||
        (typeof DOMException !== "undefined" &&
          error instanceof DOMException &&
          error.name === "AbortError");
      return {
        status: COMMUNICATION_STATUSES.FAILED,
        provider: this.name,
        errorMessage: aborted
          ? `Resend request timed out after ${this.timeoutMs}ms`
          : sanitizeProviderError(
              error instanceof Error ? error.message : "Resend request failed",
            ),
      };
    } finally {
      clearTimeout(timer);
    }
  }
}

/** Strip accidental credential material from provider/network error text before audit storage. */
export function sanitizeProviderError(message: string): string {
  return message
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/re_[A-Za-z0-9_]+/g, "[redacted_key]")
    .slice(0, 300);
}

export type EmailProviderMode = "none" | "console" | "resend";

export function resolveEmailProviderMode(
  source: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): EmailProviderMode {
  const raw = (source.EMAIL_PROVIDER ?? "none").trim().toLowerCase();
  if (raw === "console") {
    return "console";
  }
  if (raw === "resend") {
    return "resend";
  }
  return "none";
}

export function createEmailProvider(
  source: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
  fetchImpl: typeof fetch = fetch,
): EmailProvider {
  const mode = resolveEmailProviderMode(source);
  if (mode === "console") {
    return new ConsoleEmailProvider();
  }
  if (mode === "resend") {
    const apiKey = (source.RESEND_API_KEY ?? "").trim();
    const from = (source.EMAIL_FROM ?? "").trim();
    if (!apiKey || !from) {
      // Opt-in mode requested but not configured — stay safe (no network).
      return new NullEmailProvider();
    }
    return new ResendEmailProvider(apiKey, from, fetchImpl);
  }
  return new NullEmailProvider();
}

export function communicationStatusFromEmailResult(
  result: OutboundEmailResult,
): CommunicationStatus {
  return result.status;
}
