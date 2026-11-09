import { describe, expect, it } from "vitest";

import { readWpPublicIntakeFields, wpPublicIntakeSchema } from "@/server/inquiries/wp-intake-validation";

function validPayload(overrides: Record<string, unknown> = {}) {
  return {
    firstName: "Ada",
    lastName: "Lovelace",
    company: "Analytical Engines",
    phone: "(574) 555-0100",
    email: "ada@example.com",
    eventType: "Birthday",
    dates: ["2026-12-15"],
    time: "17:00",
    adults: 10,
    children: 5,
    duration: "3 hours",
    attractions: {
      bowling: "yes",
      axe: "no",
      laser: "open",
      golf: "no",
      climbing: "open",
      arcade: "yes",
    },
    food: "yes",
    privateRoom: "no",
    craft: "no",
    hasBudget: "no",
    description: "Twelfth birthday party for a mixed group.",
    referral: "Google",
    submissionId: "sub_wp_valid_01",
    ...overrides,
  };
}

describe("wp public intake validation", () => {
  it("accepts a full WordPress-parity payload", () => {
    const parsed = wpPublicIntakeSchema.safeParse(validPayload());
    expect(parsed.success).toBe(true);
    if (!parsed.success) {
      return;
    }
    expect(parsed.data.minutes).toBe(180);
    expect(parsed.data.phone).toBe("5745550100");
    expect(parsed.data.budgetCents).toBeNull();
    expect(parsed.data.attractions.bowling).toBe("yes");
  });

  it("requires Other duration hours and budget when selected", () => {
    expect(
      wpPublicIntakeSchema.safeParse(
        validPayload({ duration: "Other", otherHours: undefined }),
      ).success,
    ).toBe(false);
    expect(
      wpPublicIntakeSchema.safeParse(
        validPayload({ duration: "Other", otherHours: 2.5 }),
      ).success,
    ).toBe(true);
    expect(
      wpPublicIntakeSchema.safeParse(validPayload({ hasBudget: "yes", budget: undefined })).success,
    ).toBe(false);
    const withBudget = wpPublicIntakeSchema.safeParse(
      validPayload({ hasBudget: "yes", budget: 2500 }),
    );
    expect(withBudget.success).toBe(true);
    if (withBudget.success) {
      expect(withBudget.data.budgetCents).toBe(250_000);
    }
  });

  it("rejects zero combined guests and missing attraction answers", () => {
    expect(wpPublicIntakeSchema.safeParse(validPayload({ adults: 0, children: 0 })).success).toBe(
      false,
    );
    expect(
      wpPublicIntakeSchema.safeParse(
        validPayload({
          attractions: {
            bowling: "yes",
            axe: "no",
            laser: "open",
            golf: "no",
            climbing: "open",
            arcade: "",
          },
        }),
      ).success,
    ).toBe(false);
  });

  it("rejects filled honeypots via readWpPublicIntakeFields", () => {
    const result = readWpPublicIntakeFields(
      validPayload({ companyWebsite: "https://spam.test" }),
    );
    expect(result.success).toBe(false);
  });

  it("requires company, phone, referral, and ternary attractions", () => {
    expect(wpPublicIntakeSchema.safeParse(validPayload({ company: "" })).success).toBe(false);
    expect(wpPublicIntakeSchema.safeParse(validPayload({ phone: "" })).success).toBe(false);
    expect(wpPublicIntakeSchema.safeParse(validPayload({ referral: "" })).success).toBe(false);
  });
});
