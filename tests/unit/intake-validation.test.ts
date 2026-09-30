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
        eventType: "Birthday Party",
        preferredDate: "2026-10-15",
        guestCount: 12,
        guestMix: "mostly_children",
        desiredDurationMinutes: 180,
        budgetBand: "1500_3000",
        eventGoal: "Celebration",
        diningPreference: "not_sure",
        spacePreference: "semi_private",
        submissionId: "sub_valid",
      }).success,
    ).toBe(true);
  });

  it("accepts the canonical planner payload and ignores a browser organization id", () => {
    const parsed = publicIntakeSchema.safeParse({
      firstName: "Ada",
      lastName: "Lovelace",
      email: "ada@example.com",
      eventType: "Birthday Party",
      preferredDate: "2026-09-26",
      startTime: "17:00",
      guestCount: "20",
      guestMix: "mostly_adults",
      foodPreference: "WANTS_FOOD",
      beveragePreference: "NOT_SURE",
      privateSpacePreference: "YES",
      budgetPreference: "PER_GUEST_45_55",
      attractionInterestIds: ["attr_bowling", "attr_axe"],
      organizationId: "org_other",
      locationId: "loc_other",
      depositPercent: 0,
      submissionId: "sub_valid",
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) {
      return;
    }
    expect(parsed.data.diningPreference).toBe("WANTS_FOOD");
    expect(parsed.data.spacePreference).toBe("private");
    expect(parsed.data.beveragePreference).toBe("NOT_SURE");
    expect(parsed.data.budgetPreference).toBe("PER_GUEST_45_55");
    expect(parsed.data.budgetMin).toBe(90_000);
    expect(parsed.data.budgetMax).toBe(110_000);
    expect(parsed.data.desiredDurationMinutes).toBeNull();
    const requested = publicIntakeSchema.safeParse({
      firstName: "Ada",
      lastName: "Lovelace",
      email: "ada@example.com",
      eventType: "Birthday Party",
      preferredDate: "2026-09-26",
      startTime: "17:00",
      guestCount: "20",
      guestMix: "mostly_adults",
      foodPreference: "WANTS_FOOD",
      privateSpacePreference: "YES",
      budgetBand: "1500_3000",
      desiredDurationMinutes: "120",
      submissionId: "sub_duration",
    });
    expect(requested.success).toBe(true);
    if (requested.success) {
      expect(requested.data.desiredDurationMinutes).toBe(120);
    }
    for (const minutes of ["90", "150", "240"]) {
      const parsedMinutes = publicIntakeSchema.safeParse({
        firstName: "Ada",
        lastName: "Lovelace",
        email: "ada@example.com",
        eventType: "Birthday Party",
        preferredDate: "2026-09-26",
        startTime: "17:00",
        guestCount: "20",
        guestMix: "mostly_adults",
        foodPreference: "WANTS_FOOD",
        privateSpacePreference: "YES",
        budgetBand: "1500_3000",
        desiredDurationMinutes: minutes,
        submissionId: "sub_duration",
      });
      expect(parsedMinutes.success).toBe(true);
    }
    expect(parsed.data.eventGoal).toBe("Birthday Party");
    expect(parsed.data).not.toHaveProperty("organizationId");
    expect(parsed.data).not.toHaveProperty("locationId");
    expect(parsed.data).not.toHaveProperty("depositPercent");
  });

  it("stores a total event budget band without multiplying by guest count", () => {
    const parsed = publicIntakeSchema.safeParse({
      firstName: "Ada",
      lastName: "Lovelace",
      email: "ada@example.com",
      eventType: "Birthday Party",
      preferredDate: "2026-09-26",
      startTime: "17:00",
      guestCount: "20",
      guestMix: "mostly_adults",
      foodPreference: "WANTS_FOOD",
      privateSpacePreference: "YES",
      budgetBand: "1500_3000",
      submissionId: "sub_valid",
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) {
      return;
    }
    expect(parsed.data.budgetPreference).toBeNull();
    expect(parsed.data.budgetMin).toBe(150_000);
    expect(parsed.data.budgetMax).toBe(300_000);
    expect(parsed.data.beveragePreference).toBeNull();
  });

  it("rejects a non-numeric guest count and a foreign-looking food code on the new field", () => {
    expect(
      publicIntakeSchema.safeParse({
        firstName: "Ada",
        lastName: "Lovelace",
        email: "ada@example.com",
        eventType: "Birthday Party",
        preferredDate: "2026-10-15",
        guestCount: "1e2",
        guestMix: "mostly_adults",
        foodPreference: "WANTS_FOOD",
        privateSpacePreference: "NO_PREFERENCE",
        budgetPreference: "FLEXIBLE",
        submissionId: "sub_valid",
      }).success,
    ).toBe(false);
    expect(
      publicIntakeSchema.safeParse({
        firstName: "Ada",
        lastName: "Lovelace",
        email: "ada@example.com",
        eventType: "Birthday Party",
        preferredDate: "2026-10-15",
        guestCount: 12,
        guestMix: "mostly_adults",
        foodPreference: "catered_fajita",
        privateSpacePreference: "YES",
        budgetPreference: "VALUE",
        submissionId: "sub_valid",
      }).success,
    ).toBe(false);
  });

  it("rejects invalid email, zero guests, and missing event type", () => {
    expect(
      publicIntakeSchema.safeParse({
        firstName: "Ada",
        lastName: "Lovelace",
        email: "not-an-email",
        eventType: "Birthday Party",
        preferredDate: "2026-10-15",
        submissionId: "sub_valid",
      }).success,
    ).toBe(false);
    expect(
      publicIntakeSchema.safeParse({
        firstName: "Ada",
        lastName: "Lovelace",
        email: "ada@example.com",
        eventType: "Birthday Party",
        preferredDate: "2026-10-15",
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
