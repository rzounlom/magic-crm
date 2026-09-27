import { describe, expect, it } from "vitest";

import {
  formatBeveragePreference,
  formatDesiredDuration,
  formatDiningPreference,
  formatGuestMix,
  formatIntakeBudget,
  formatSpacePreference,
} from "@/lib/event-planner/labels";

describe("inquiry intake display compatibility", () => {
  it("renders new preferences and legacy dining, space, budget, and duration", () => {
    expect(formatDiningPreference("WANTS_FOOD")).toBe("Yes");
    expect(formatDiningPreference("NO_FOOD")).toBe("No");
    expect(formatDiningPreference("catered_fajita")).toBe("Catered Fajita Bar");
    expect(formatDiningPreference("pizza_light")).toBe("Pizza & Light Fare");
    expect(formatBeveragePreference("NOT_SURE")).toBe("Not sure");
    expect(formatSpacePreference("private")).toBe("Private event space");
    expect(formatSpacePreference("semi_private")).toBe("Semi-Private Is Fine");
    expect(formatSpacePreference("no_preference")).toBe("No preference");
    expect(formatGuestMix("mostly_children")).toBe("Mostly Kids / Youth");
    expect(formatGuestMix("teens")).toBe("Teens");
    expect(formatDesiredDuration(180)).toBe("3 hours");
    expect(
      formatIntakeBudget({
        budgetPreference: "PER_GUEST_45_55",
        budgetMin: 90_000,
        budgetMax: 110_000,
      }),
    ).toBe("Around $45–$55 per guest");
    expect(formatIntakeBudget({ budgetMin: 150_000, budgetMax: 300_000 })).toBe("$1,500–$3,000");
    expect(formatIntakeBudget({ budgetMin: 0, budgetMax: 150_000 })).toBe("Under $1,500");
  });
});
