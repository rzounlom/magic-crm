import { describe, expect, it, vi } from "vitest";

import {
  ConsoleEmailProvider,
  NullEmailProvider,
  ResendEmailProvider,
  createEmailProvider,
  resolveEmailProviderMode,
} from "@/server/communications/email-provider";
import {
  COMMUNICATION_SKIP_REASONS,
  COMMUNICATION_STATUSES,
} from "@/types/communications";

describe("email provider adapter", () => {
  it("defaults to none and never sends network mail", async () => {
    expect(resolveEmailProviderMode({})).toBe("none");
    const provider = createEmailProvider({});
    expect(provider).toBeInstanceOf(NullEmailProvider);
    const result = await provider.send({
      to: "customer@example.test",
      subject: "Quote",
      textBody: "Hello",
      idempotencyKey: "key-1",
    });
    expect(result).toEqual({
      status: COMMUNICATION_STATUSES.SKIPPED,
      provider: "none",
      skipReason: COMMUNICATION_SKIP_REASONS.NO_EMAIL_PROVIDER,
    });
  });

  it("supports console mode for local observation only", async () => {
    expect(resolveEmailProviderMode({ EMAIL_PROVIDER: "console" })).toBe("console");
    const provider = createEmailProvider({ EMAIL_PROVIDER: "console" });
    expect(provider).toBeInstanceOf(ConsoleEmailProvider);
    const result = await provider.send({
      to: "customer@example.test",
      subject: "Quote",
      textBody: "Hello",
      idempotencyKey: "key-2",
    });
    expect(result.status).toBe(COMMUNICATION_STATUSES.SENT);
    if (result.status === COMMUNICATION_STATUSES.SENT) {
      expect(result.providerMessageId).toBe("console:key-2");
    }
  });

  it("resolves resend mode but stays none without credentials", () => {
    expect(resolveEmailProviderMode({ EMAIL_PROVIDER: "resend" })).toBe("resend");
    expect(
      createEmailProvider({
        EMAIL_PROVIDER: "resend",
        RESEND_API_KEY: "",
        EMAIL_FROM: "",
      }),
    ).toBeInstanceOf(NullEmailProvider);
    expect(resolveEmailProviderMode({ EMAIL_PROVIDER: "smtp" })).toBe("none");
  });

  it("sends via Resend when credentials and fetch succeed", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ id: "re_test_123" }, { status: 200 }),
    );
    const provider = createEmailProvider(
      {
        EMAIL_PROVIDER: "resend",
        RESEND_API_KEY: "re_test_key",
        EMAIL_FROM: "Events <events@example.test>",
      },
      fetchMock as unknown as typeof fetch,
    );
    expect(provider).toBeInstanceOf(ResendEmailProvider);
    const result = await provider.send({
      to: "customer@example.test",
      subject: "We received your event request",
      textBody: "Thanks",
      idempotencyKey: "inquiry_acknowledgment:inq_1",
    });
    expect(result.status).toBe(COMMUNICATION_STATUSES.SENT);
    if (result.status === COMMUNICATION_STATUSES.SENT) {
      expect(result.providerMessageId).toBe("re_test_123");
    }
    expect(fetchMock).toHaveBeenCalledOnce();
    const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(call[1].headers).toMatchObject({
      Authorization: "Bearer re_test_key",
      "Idempotency-Key": "inquiry_acknowledgment:inq_1",
    });
  });

  it("records Resend HTTP failures without throwing", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ message: "Invalid API key" }, { status: 401 }),
    );
    const provider = new ResendEmailProvider(
      "bad_key",
      "Events <events@example.test>",
      fetchMock as unknown as typeof fetch,
    );
    const result = await provider.send({
      to: "customer@example.test",
      subject: "Ack",
      textBody: "Thanks",
      idempotencyKey: "key-fail",
    });
    expect(result).toEqual({
      status: COMMUNICATION_STATUSES.FAILED,
      provider: "resend",
      errorMessage: "Invalid API key",
    });
  });
});
