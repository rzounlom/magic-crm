import { describe, expect, it } from "vitest";

import {
  isHoneypotFilled,
  publicConversationMessageSchema,
  publicIntakeSchema,
} from "@/server/inquiries/intake-validation";
import { updateInquiryDetailsArgsSchema } from "@/server/ai/sales-agent-tools";
import { salesAgentInstructions } from "@/server/ai/sales-agent-instructions";

describe("public intake validation", () => {
  it("rejects oversized input and filled honeypots", () => {
    expect(
      publicIntakeSchema.safeParse({
        firstName: "Ada",
        lastName: "Lovelace",
        email: "ada@example.com",
        submissionId: "sub_1",
        notes: "x".repeat(2001),
      }).success,
    ).toBe(false);
    expect(
      publicConversationMessageSchema.safeParse({
        message: "x".repeat(2001),
        submissionId: "sub_1",
      }).success,
    ).toBe(false);
    expect(isHoneypotFilled("https://spam.test")).toBe(true);
    expect(isHoneypotFilled("")).toBe(false);
  });

  it("accepts a compact valid intake", () => {
    expect(
      publicIntakeSchema.safeParse({
        firstName: "Ada",
        lastName: "Lovelace",
        email: "ada@example.com",
        eventType: "Birthday",
        guestCount: 12,
        submissionId: "sub_valid",
      }).success,
    ).toBe(true);
  });

  it("rejects invalid email, zero guests, and missing event type", () => {
    expect(
      publicIntakeSchema.safeParse({
        firstName: "Ada",
        lastName: "Lovelace",
        email: "not-an-email",
        eventType: "Birthday",
        submissionId: "sub_valid",
      }).success,
    ).toBe(false);
    expect(
      publicIntakeSchema.safeParse({
        firstName: "Ada",
        lastName: "Lovelace",
        email: "ada@example.com",
        eventType: "Birthday",
        guestCount: 0,
        submissionId: "sub_valid",
      }).success,
    ).toBe(false);
    expect(
      publicIntakeSchema.safeParse({
        firstName: "Ada",
        lastName: "Lovelace",
        email: "ada@example.com",
        eventType: "",
        submissionId: "sub_valid",
      }).success,
    ).toBe(false);
  });
});

describe("sales agent tool validation", () => {
  it("only keeps whitelisted inquiry fields", () => {
    const parsed = updateInquiryDetailsArgsSchema.parse({
      guestCount: 12,
      organizationId: "org_other",
      status: "BOOKED",
    });
    expect(parsed).toEqual({ guestCount: 12 });
    expect(parsed).not.toHaveProperty("organizationId");
    expect(parsed).not.toHaveProperty("status");
    expect(updateInquiryDetailsArgsSchema.parse({ guestCount: "14" })).toEqual({ guestCount: 14 });
  });

  it("forbids invented booking claims in instructions", () => {
    const text = salesAgentInstructions("Riverside Fun Center");
    expect(text).toContain("Riverside Fun Center");
    expect(text).toMatch(/never claim a reservation/i);
    expect(text).toMatch(/untrusted/i);
    expect(text).toMatch(/bold package names and prices/i);
    expect(text).toMatch(/plain text is fine/i);
    expect(text).toMatch(/ANSWER → QUALIFY → NUDGE → HAND OFF ONLY WHEN NECESSARY/);
    expect(text).toMatch(/ask which destination/i);
    expect(text).toMatch(/eligibility requirement is not confirmed/i);
    expect(text).not.toMatch(/material uncertainty/i);
  });
});
