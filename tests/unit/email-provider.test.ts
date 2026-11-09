import { describe, expect, it } from "vitest";

import {
  ConsoleEmailProvider,
  NullEmailProvider,
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

  it("rejects unknown modes as none (no live providers in Phase 7C)", () => {
    expect(resolveEmailProviderMode({ EMAIL_PROVIDER: "resend" })).toBe("none");
    expect(resolveEmailProviderMode({ EMAIL_PROVIDER: "smtp" })).toBe("none");
  });
});
