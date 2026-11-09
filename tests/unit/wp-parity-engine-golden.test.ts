import { describe, expect, it } from "vitest";

import {
  WpParityEngine,
  createWpParityEngine,
  sampleWpInquiry,
  type AttractionKey,
  type InquiryRaw,
  type RankedPlan,
  type RecommendOptions,
  type RecommendSuccess,
} from "@/server/event-planner/wp-parity";

/**
 * Golden parity tests ported 1:1 from Generations Event Planner 3.3.0 `tests/engine-test.php`
 * (lines 5-48). Totals are PLUGIN DEFAULT prices (catalog 2026-11-02), never weakened.
 *
 * `runCase` mirrors `run_case()` and `mainPlan` mirrors `main_plan()` from `test-helpers.php`.
 */

const engine = createWpParityEngine();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** PHP `array_replace_recursive`. */
function replaceRecursive(
  base: Record<string, unknown>,
  changes: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(changes)) {
    const existing = out[key];
    out[key] = isRecord(existing) && isRecord(value) ? replaceRecursive(existing, value) : value;
  }
  return out;
}

function runCase(
  n: number,
  attractions: AttractionKey[],
  date = "2026-11-06",
  changes: Record<string, unknown> = {},
  options: RecommendOptions = {},
): RecommendSuccess {
  const sample = sampleWpInquiry();
  sample.adults = n;
  for (const a of attractions) {
    sample.attractions[a] = "yes";
  }
  sample.dates = [date];
  const merged = replaceRecursive({ ...sample }, changes);
  const result = engine.recommend(merged, { bowling_hours: 1, ...options });
  if (!result.valid) {
    throw new Error(JSON.stringify(result));
  }
  return result;
}

function mainPlan(result: RecommendSuccess): RankedPlan {
  const day = result.dates[0];
  if (!day) {
    throw new Error("missing date result");
  }
  return day.recommendation;
}

function alternatives(result: RecommendSuccess): RankedPlan[] {
  return result.dates[0]?.alternatives ?? [];
}

function isInvalid(raw: InquiryRaw): boolean {
  return !engine.recommend(raw).valid;
}

describe("WP Event Planner 3.3.0 engine golden parity (engine-test.php 5-48)", () => {
  it("six Friday bowlers $61", () => {
    expect(mainPlan(runCase(6, ["bowling"])).total_cents).toBe(6100);
  });

  it("seven Friday bowlers $104.50", () => {
    expect(mainPlan(runCase(7, ["bowling"])).total_cents).toBe(10450);
  });

  it("Tuesday bowling $51", () => {
    expect(mainPlan(runCase(6, ["bowling"], "2026-11-03")).total_cents).toBe(5100);
  });

  it("Wednesday bowling shoes not discounted", () => {
    expect(mainPlan(runCase(6, ["bowling"], "2026-11-04")).total_cents).toBe(3600);
  });

  it("ten bowling + 30-minute axe $290", () => {
    expect(mainPlan(runCase(10, ["bowling", "axe"])).total_cents).toBe(29000);
  });

  it("bowling + axe protects 15-minute briefing", () => {
    expect(mainPlan(runCase(10, ["bowling", "axe"])).required_minutes).toBe(105);
  });

  it("axe briefing starts after bowling", () => {
    const p = mainPlan(runCase(10, ["bowling", "axe"]));
    const brief = p.itinerary.filter((r) => r.label === "Axe Check-In & Safety Briefing");
    expect(brief[0]?.start).toBe("2:00 PM");
    expect(brief[0]?.end).toBe("2:15 PM");
  });

  it("axe-only main is full hour $300", () => {
    const p = mainPlan(runCase(10, ["axe"]));
    expect(p.total_cents).toBe(30000);
    expect(p.axe_minutes).toBe(60);
  });

  it("axe shorter alternative $175", () => {
    expect(alternatives(runCase(10, ["axe"]))[0]?.total_cents).toBe(17500);
  });

  it("eight laser-only pass $200", () => {
    expect(mainPlan(runCase(8, ["laser"])).total_cents).toBe(20000);
  });

  it("90-minute pass reinstated", () => {
    expect(mainPlan(runCase(8, ["laser"])).name).toContain("90-Minute");
  });

  it("fifty laser-only private $550", () => {
    expect(mainPlan(runCase(50, ["laser"])).total_cents).toBe(55000);
  });

  it("Saturday private laser $599", () => {
    expect(mainPlan(runCase(50, ["laser"], "2026-11-07")).total_cents).toBe(59900);
  });

  it("Thursday eight laser $160", () => {
    expect(mainPlan(runCase(8, ["laser"], "2026-11-05")).total_cents).toBe(16000);
  });

  it("eight laser + arcade fuller package $319.92", () => {
    expect(mainPlan(runCase(8, ["laser", "arcade"])).total_cents).toBe(31992);
  });

  it("Wednesday direct two games + $30 credit beats package", () => {
    expect(mainPlan(runCase(8, ["laser", "arcade"], "2026-11-04")).total_cents).toBe(30400);
  });

  it("Wednesday one game + $15 arcade $152", () => {
    expect(alternatives(runCase(8, ["laser", "arcade"], "2026-11-04"))[0]?.total_cents).toBe(15200);
  });

  it("eight child Blast wristbands $239.92", () => {
    const r = runCase(0, ["laser", "climbing", "arcade"], "2026-11-06", { children: 8 });
    expect(mainPlan(r).total_cents).toBe(23992);
  });

  it("Blast never promises seating", () => {
    const r = runCase(0, ["laser", "climbing", "arcade"], "2026-11-06", { children: 8 });
    expect(mainPlan(r).notes.join(" ")).toContain("No seating");
  });

  it("adults never sold Blast", () => {
    expect(mainPlan(runCase(8, ["laser", "climbing", "arcade"])).name).not.toContain("Blast");
  });

  it("golf four adults/four children $72", () => {
    const r = runCase(4, ["golf"], "2026-11-06", { children: 4 });
    expect(mainPlan(r).total_cents).toBe(7200);
  });

  it("fifteen Fajita and pitchers $435.49 tax included", () => {
    const p = mainPlan(runCase(15, [], "2026-11-06", { food: "yes" }, { menu: "fajita" }));
    expect(p.subtotal_cents).toBe(40700);
    expect(p.tax_cents).toBe(2849);
  });

  it("fourteen cannot qualify catering bar", () => {
    const p = mainPlan(runCase(14, [], "2026-11-06", { food: "yes" }, { menu: "fajita" }));
    expect(p.hard_review).toBe(true);
  });

  it("catering does not waive requested Lower room fee", () => {
    const p = mainPlan(
      runCase(15, [], "2026-11-06", { food: "yes", private_room: "yes" }, { menu: "fajita" }),
    );
    expect(p.total_cents).toBe(58549);
  });

  it("25 pizza wings drinks can eat at lanes", () => {
    const p = mainPlan(
      runCase(25, ["bowling"], "2026-11-06", { food: "yes" }, { menu: "pizza_wings" }),
    );
    expect(p.dining_minutes).toBe(0);
  });

  it("25 sliders require separate dining", () => {
    const p = mainPlan(runCase(25, ["bowling"], "2026-11-06", { food: "yes" }, { menu: "slider" }));
    expect(p.dining_minutes).toBe(30);
  });

  it("26 pizza requires separate dining", () => {
    const p = mainPlan(runCase(26, ["bowling"], "2026-11-06", { food: "yes" }));
    expect(p.dining_minutes).toBe(30);
  });

  it("100-person split has two briefings", () => {
    const p = mainPlan(runCase(100, ["bowling", "axe"]));
    const brief = p.itinerary.filter((r) => r.label === "Axe Check-In & Safety Briefing");
    expect(brief).toHaveLength(2);
  });

  it("100-person 50/50 rotation fits 120 fixed minutes", () => {
    expect(mainPlan(runCase(100, ["bowling", "axe"])).required_minutes).toBe(120);
  });

  it("lane-one exception used only for approved large cohorts", () => {
    expect(WpParityEngine.lanes(100)).toBe(16);
    expect(WpParityEngine.lanes(50)).toBe(8);
  });

  it("adult open guidance suggests bowling", () => {
    const r = runCase(10, [], "2026-11-06", { attractions: { bowling: "open", axe: "open" } });
    expect(mainPlan(r).selected_attractions).toContain("bowling");
  });

  it("budget may choose shorter complete laser alternative", () => {
    const r = runCase(8, ["laser"], "2026-11-06", { has_budget: "yes", budget: 70 });
    expect(mainPlan(r).total_cents).toBe(6400);
  });

  it("overbudget preserves explicit attraction", () => {
    const r = runCase(10, ["axe"], "2026-11-06", { has_budget: "yes", budget: 1 });
    expect(mainPlan(r).selected_attractions).toContain("axe");
    expect(mainPlan(r).budget_over_cents).toBeGreaterThan(0);
  });

  it("all No never adds attractions", () => {
    expect(mainPlan(runCase(10, [])).selected_attractions).toEqual([]);
  });

  it("missing attraction answer blocked", () => {
    const s = sampleWpInquiry();
    const attractions: Partial<typeof s.attractions> = { ...s.attractions };
    delete attractions.bowling;
    expect(isInvalid({ ...s, attractions })).toBe(true);
  });

  it("Other duration conditional validation", () => {
    const s = sampleWpInquiry();
    s.duration = "Other";
    s.other_hours = "";
    expect(isInvalid(s)).toBe(true);
  });

  it("budget amount conditional validation", () => {
    const s = sampleWpInquiry();
    s.has_budget = "yes";
    expect(isInvalid(s)).toBe(true);
  });

  it("email header injection blocked", () => {
    const s = sampleWpInquiry();
    s.email = "a@example.com\r\nBcc:evil@example.com";
    expect(isInvalid(s)).toBe(true);
  });

  it("fractional guest count blocked", () => {
    const s = sampleWpInquiry();
    s.adults = "1.5";
    expect(isInvalid(s)).toBe(true);
  });

  it("invalid calendar date blocked", () => {
    const s = sampleWpInquiry();
    s.dates = ["2026-02-30"];
    expect(isInvalid(s)).toBe(true);
  });

  it("alternative dates priced independently", () => {
    const s = sampleWpInquiry();
    s.dates = ["2026-11-03", "2026-11-06"];
    s.adults = 6;
    s.attractions.bowling = "yes";
    const r = engine.recommend(s, { bowling_hours: 1 });
    expect(r.valid).toBe(true);
    if (!r.valid) return;
    expect(r.dates).toHaveLength(2);
    expect(r.dates[0]?.recommendation.total_cents).toBe(5100);
    expect(r.dates[1]?.recommendation.total_cents).toBe(6100);
  });

  it("explicit 60-minute axe is not silently shortened to fit", () => {
    const r = runCase(
      10,
      ["bowling", "axe"],
      "2026-11-06",
      { duration: "2 hours" },
      { axe_minutes: 60 },
    );
    expect(mainPlan(r).axe_minutes).toBe(60);
    expect(mainPlan(r).fits_duration).toBe(false);
  });

  it("bowling-only rotations allow shoes before each slot, not inside purchased play", () => {
    expect(mainPlan(runCase(100, ["bowling"])).required_minutes).toBe(120);
  });

  it("private axe rental excluded when full cohort time cannot fit", () => {
    const r = runCase(100, ["axe"], "2026-11-06", {}, { axe_minutes: 60 });
    expect(mainPlan(r).name).not.toContain("Private Axe Den");
  });

  it("extra traditional wings retain lane-dining exception", () => {
    const r = runCase(
      25,
      ["bowling"],
      "2026-11-06",
      { food: "yes" },
      { menu: "pizza", extras: { traditional: 1 } },
    );
    expect(mainPlan(r).dining_minutes).toBe(0);
  });

  it("salad forces separate setup", () => {
    const r = runCase(
      25,
      ["bowling"],
      "2026-11-06",
      { food: "yes" },
      { menu: "pizza", extras: { salad: 1 } },
    );
    expect(mainPlan(r).dining_minutes).toBe(30);
  });

  it("removed breakfast request held for staff", () => {
    const r = runCase(10, [], "2026-11-06", { food: "yes", description: "Breakfast event" });
    expect(mainPlan(r).hard_review).toBe(true);
    expect(mainPlan(r).review.join(" ")).toContain("Breakfast Bar has been removed");
  });

  it("no invented Monday regular bowling rate", () => {
    const r = runCase(6, ["bowling"], "2026-11-02");
    expect(mainPlan(r).name).not.toContain("Regular bowling");
  });

  it("mixed-group Blast charges children only", () => {
    const r = runCase(4, ["laser", "climbing"], "2026-11-06", { children: 4 });
    const blast = mainPlan(r).items.filter((i) => i.label.includes("Blast child"));
    expect(blast.length).toBeGreaterThan(0);
    for (const item of blast) {
      expect(item.quantity).toBe(4);
    }
  });

  it.each([
    ["null", null],
    ["array", []],
    ["boolean", true],
    ["string", "wrong"],
    ["integer", -1],
  ])("malformed attraction value rejected: %s", (_name, bad) => {
    const s = sampleWpInquiry();
    s.attractions.axe = bad;
    expect(isInvalid(s)).toBe(true);
  });

  it.each([1, 6, 7, 8, 10, 25, 26, 48, 49, 50, 51, 56, 57, 100, 125, 126])(
    "line totals reconcile for %i guests",
    (n) => {
      const p = mainPlan(runCase(n, ["bowling", "axe", "laser", "arcade"]));
      const sum = p.items.reduce((acc, i) => acc + i.subtotal_cents + i.tax_cents, 0);
      expect(p.total_cents).toBe(sum);
    },
  );
});
