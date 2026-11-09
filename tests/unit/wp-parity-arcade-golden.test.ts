import { describe, expect, it } from "vitest";

import {
  createWpParityEngine,
  sampleWpInquiry,
  type PlanDraft,
  type RankedPlan,
  type RecommendSuccess,
} from "@/server/event-planner/wp-parity";

/**
 * Golden parity tests ported from Generations Event Planner 3.3.0
 * `tests/arcade-allocation-test.php` (12 checks) and
 * `docs/arcade-allocation-test-results.txt`.
 *
 * Skipped (WordPress-only): "internal email no longer presents a single pooled $155 card"
 * calls `Emails::internal()`, which is a WordPress mailer not ported to MagicCRM.
 *
 * All expected cents are the PHP values, never weakened.
 */

const engine = createWpParityEngine();

function sportsTeamSample() {
  const s = sampleWpInquiry();
  s.event_type = "Sports Team";
  s.adults = 5;
  s.children = 10;
  s.dates = ["2026-11-14"];
  s.time = "12:00";
  s.duration = "Other";
  s.other_hours = "0.01";
  s.food = "yes";
  s.craft = "yes";
  for (const a of ["laser", "golf", "climbing", "arcade"] as const) {
    s.attractions[a] = "yes";
  }
  s.attractions.bowling = "open";
  return s;
}

function recommend(sample: ReturnType<typeof sportsTeamSample>): RecommendSuccess {
  const result = engine.recommend(sample);
  if (!result.valid) {
    throw new Error(JSON.stringify(result.errors));
  }
  return result;
}

function sumSubtotals(plan: { items: { label: string; subtotal_cents: number }[] }, prefix: string) {
  return plan.items
    .filter((item) => item.label.startsWith(prefix))
    .reduce((sum, item) => sum + item.subtotal_cents, 0);
}

function emptyDraft(): PlanDraft {
  return {
    name: "",
    tier: 0,
    items: [],
    subtotal_cents: 0,
    tax_cents: 0,
    total_cents: 0,
    notes: [],
    review: [],
    included_credit_cents: 0,
    included_combos: 0,
    bowling_minutes: 0,
    axe_minutes: 0,
    access_minutes: 0,
    room_included: false,
    private_activities: false,
  };
}

describe("wp parity arcade allocation golden (arcade-allocation-test.php)", () => {
  const result = recommend(sportsTeamSample());
  const plan: RankedPlan = result.dates[0]!.recommendation;

  it("exact mixed sports-team example retains the recorded duration hold and separate adult access", () => {
    expect(plan.name).toContain("Adventure Blast");
    expect(plan.fits_duration).toBe(false);
    expect(result.inquiry.minutes).toBe(1);
  });

  it("reallocation preserves the original $783.30 event total", () => {
    expect(plan.total_cents).toBe(78330);
  });

  it("five adults receive $15 cards, $75 additional", () => {
    const cards = plan.arcade_cards ?? [];
    const adults = cards.filter((c) => c.audience === "adult");
    expect(adults).toHaveLength(1);
    expect(adults[0]!.quantity).toBe(5);
    expect(adults[0]!.credit_cents).toBe(1500);
    expect(adults[0]!.additional_cents_each).toBe(1500);
  });

  it("ten children receive their included $15 cards without extra funding", () => {
    const cards = plan.arcade_cards ?? [];
    const children = cards.filter((c) => c.audience === "child");
    expect(children).toHaveLength(1);
    expect(children[0]!.quantity).toBe(10);
    expect(children[0]!.credit_cents).toBe(1500);
    expect(children[0]!.included_cents_each).toBe(1500);
    expect(children[0]!.additional_cents_each).toBe(0);
  });

  it("arcade card quantity matches all fifteen guests", () => {
    const quantity = (plan.arcade_cards ?? []).reduce((sum, c) => sum + c.quantity, 0);
    expect(quantity).toBe(15);
  });

  it("additional arcade funding is $75, not $155", () => {
    expect(sumSubtotals(plan, "Arcade credit")).toBe(7500);
  });

  it("mini golf is funded separately for all five adults and ten children", () => {
    expect(sumSubtotals(plan, "Mini golf")).toBe(13000);
  });

  it("staff instructions show actual child card count and face value", () => {
    expect(plan.notes.join(" ")).toContain(
      "Prepare 10 child arcade cards with $15.00 total credit each",
    );
  });

  it("excluded arcade does not generate guest cards", () => {
    const sample = sportsTeamSample();
    sample.attractions.arcade = "no";
    const excluded = recommend(sample).dates[0]!.recommendation;
    expect(excluded.arcade_cards ?? []).toHaveLength(0);
  });

  it("uneven credit is distributed across three cards without losing cents", () => {
    const sample = sampleWpInquiry();
    sample.adults = 3;
    const validated = engine.validate(sample);
    expect(validated.valid).toBe(true);
    const p = engine.arcadeLinesForTest(emptyDraft(), validated.data, 1000, 1000);
    expect(p.items.reduce((sum, item) => sum + item.subtotal_cents, 0)).toBe(2000);
    const cards = p.arcade_cards ?? [];
    expect(cards.reduce((sum, c) => sum + c.quantity, 0)).toBe(3);
    // Funding rows still represent three $10 face-value cards.
    expect(cards.reduce((sum, c) => sum + c.quantity * c.credit_cents, 0)).toBe(3000);
  });
});
