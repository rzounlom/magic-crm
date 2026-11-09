import { describe, expect, it } from "vitest";

import type { WpIntakeAnswers } from "@/lib/event-planner/wp-intake-contract";
import { calculatePrivateWpRecommendation } from "@/server/event-planner/wp-parity/from-intake";

function answers(overrides: Partial<WpIntakeAnswers> = {}): WpIntakeAnswers {
  return {
    firstName: "Ada",
    lastName: "Lovelace",
    company: "Analytical Engines",
    phone: "5745550100",
    email: "ada@example.com",
    eventType: "Birthday",
    dates: ["2026-11-06"],
    time: "13:00",
    adults: 6,
    children: 0,
    duration: "3 hours",
    otherHours: null,
    minutes: 180,
    attractions: {
      bowling: "yes",
      axe: "no",
      laser: "no",
      golf: "no",
      climbing: "no",
      arcade: "no",
    },
    food: "no",
    privateRoom: "no",
    craft: "no",
    hasBudget: "no",
    budgetCents: null,
    description: "Birthday",
    comments: null,
    referral: "Friend",
    ...overrides,
  };
}

describe("calculatePrivateWpRecommendation", () => {
  it("returns a ready staff snapshot for bowling-only Friday", () => {
    // Public intake does not pin bowling_hours; WP recommend may prefer 2-hour bowling
    // to fill a 3-hour request (6 Fri bowlers → $101.00). engine-test.php forces 1h via run_case.
    const result = calculatePrivateWpRecommendation(answers());
    expect(result.status).toBe("ready");
    expect(result.pricingSource).toBe("plugin_defaults");
    expect(result.snapshot && result.snapshot.valid).toBe(true);
    if (result.snapshot && result.snapshot.valid) {
      expect(result.snapshot.dates[0]?.recommendation.total_cents).toBe(10_100);
    }
    const pinned = calculatePrivateWpRecommendation(answers(), { bowling_hours: 1 });
    expect(pinned.snapshot && pinned.snapshot.valid && pinned.snapshot.dates[0]?.recommendation.total_cents).toBe(
      6100,
    );
  });

  it("respects explicit No and Open without inventing excluded attractions", () => {
    const result = calculatePrivateWpRecommendation(
      answers({
        adults: 10,
        attractions: {
          bowling: "no",
          axe: "no",
          laser: "no",
          golf: "no",
          climbing: "no",
          arcade: "no",
        },
      }),
    );
    expect(result.status).toBe("ready");
    if (result.snapshot && result.snapshot.valid) {
      expect(result.snapshot.dates[0]?.recommendation.selected_attractions).toEqual([]);
    }
  });
});
