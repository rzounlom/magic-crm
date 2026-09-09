import { describe, expect, it } from "vitest";

import {
  formatPhoneDisplay,
  formatUsPhoneInput,
  normalizeUsPhoneForStorage,
  usPhoneDigits,
} from "@/lib/inquiries/public-phone";
import { isOptionalUsPhoneInput, readPublicIntakeFields } from "@/server/inquiries/intake-validation";

function intake(overrides: Record<string, unknown> = {}) {
  return {
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
    submissionId: "sub_valid_1",
    ...overrides,
  };
}

describe("public US phone formatting", () => {
  it("treats a blank optional phone as valid", () => {
    expect(isOptionalUsPhoneInput("")).toBe(true);
    expect(isOptionalUsPhoneInput("   ")).toBe(true);
    expect(normalizeUsPhoneForStorage("")).toBeUndefined();
    const parsed = readPublicIntakeFields(intake({ phone: "" }));
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.phone).toBe("");
    }
  });

  it("formats and stores valid 10-digit phones", () => {
    expect(formatUsPhoneInput("5551234567")).toBe("(555) 123-4567");
    expect(normalizeUsPhoneForStorage("5551234567")).toBe("5551234567");
    const parsed = readPublicIntakeFields(intake({ phone: "5551234567" }));
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.phone).toBe("5551234567");
    }
  });

  it("accepts already formatted and pasted formatted phones", () => {
    expect(formatUsPhoneInput("(555) 123-4567")).toBe("(555) 123-4567");
    expect(formatUsPhoneInput("555-123-4567")).toBe("(555) 123-4567");
    expect(normalizeUsPhoneForStorage("(555) 123-4567")).toBe("5551234567");
    expect(usPhoneDigits("+1 (555) 123-4567")).toBe("5551234567");
    expect(readPublicIntakeFields(intake({ phone: "(555) 123-4567" })).success).toBe(true);
    expect(readPublicIntakeFields(intake({ phone: "555-123-4567" })).success).toBe(true);
  });

  it("rejects fewer than 10 digits, extra digits, and letters", () => {
    const short = readPublicIntakeFields(intake({ phone: "555123" }));
    const long = readPublicIntakeFields(intake({ phone: "45645654564564564654654" }));
    const letters = readPublicIntakeFields(intake({ phone: "not-a-phone" }));
    expect(short.success).toBe(false);
    expect(long.success).toBe(false);
    expect(letters.success).toBe(false);
    if (!short.success) {
      expect(short.fieldErrors.phone).toBe("Enter a 10-digit phone number.");
    }
    if (!long.success) {
      expect(long.fieldErrors.phone).toBe("Enter a 10-digit phone number.");
    }
    if (!letters.success) {
      expect(letters.fieldErrors.phone).toBe("Enter a 10-digit phone number.");
    }
    expect(isOptionalUsPhoneInput("abc")).toBe(false);
    expect(formatUsPhoneInput("45645654564564564654654")).toBe("(456) 456-5456");
  });

  it("displays stored 10-digit phones in national format", () => {
    expect(formatPhoneDisplay("5556543333")).toBe("(555) 654-3333");
  });

  it("leaves malformed legacy phones unchanged instead of throwing", () => {
    expect(() => formatPhoneDisplay("55512")).not.toThrow();
    expect(formatPhoneDisplay("55512")).toBe("55512");
    expect(formatPhoneDisplay("not-a-phone")).toBe("not-a-phone");
    expect(formatPhoneDisplay("")).toBe("");
    expect(formatPhoneDisplay(null)).toBe("");
  });
});
