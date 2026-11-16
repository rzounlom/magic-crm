import { describe, expect, it } from "vitest";

import {
  WpParityEngine,
  compactWpItinerary,
  createWpParityEngine,
  sampleWpInquiry,
  type AttractionKey,
  type RankedPlan,
  type RecommendSuccess,
} from "@/server/event-planner/wp-parity";

const engine = createWpParityEngine();

function runCase(
  n: number,
  attractions: AttractionKey[],
  date = "2026-12-13",
  changes: Record<string, unknown> = {},
): RecommendSuccess {
  const sample = sampleWpInquiry();
  sample.adults = n;
  for (const a of attractions) {
    sample.attractions[a] = "yes";
  }
  sample.dates = [date];
  const merged = { ...sample, ...changes, attractions: { ...sample.attractions, ...(changes.attractions as object) } };
  const result = engine.recommend(merged, { bowling_hours: 1 });
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

describe("wp parity itinerary compact (3.5.0)", () => {
  it("uses balanced 35/35 schedule labels for 70 bowling + axe", () => {
    const main = mainPlan(runCase(70, ["bowling", "axe"]));
    const labels = main.itinerary.map((row) => row.group);
    expect(labels.some((g) => g.includes("35 guests"))).toBe(true);
    expect(labels.some((g) => g.includes("50 guests"))).toBe(false);
    expect(labels.some((g) => g.includes("20 guests"))).toBe(false);
  });

  it("compacts 70-guest rotations into side-by-side rows with prep notes", () => {
    const main = mainPlan(runCase(70, ["bowling", "axe", "arcade"]));
    const compact = compactWpItinerary(main.itinerary);
    expect(compact.groups.length).toBe(2);
    expect(compact.rows.length).toBeGreaterThan(0);
    expect(compact.notes.some((n) => n.includes("Bowling shoes"))).toBe(true);
    expect(compact.notes.some((n) => n.includes("Axe briefing"))).toBe(true);
  });

  it("omits lane-1 note when no cohort exceeds 48 (70 guests)", () => {
    const main = mainPlan(runCase(70, ["bowling", "axe"]));
    expect(main.notes.join(" ")).not.toContain("lane 1");
  });

  it("keeps lane-1 note when a cohort exceeds 48 (100 guests)", () => {
    const main = mainPlan(runCase(100, ["bowling"]));
    expect(main.notes.join(" ")).toContain("lane 1");
  });

  it("exposes Engine.lanes via balanced cohorts", () => {
    expect(WpParityEngine.lanes(80)).toBe(14);
    expect(WpParityEngine.lanes(51)).toBe(10);
  });
});
