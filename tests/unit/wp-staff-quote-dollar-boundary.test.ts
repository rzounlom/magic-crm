import { describe, expect, it } from "vitest";

import { centsToDollarInputValue, parseDollarInputToCents } from "@/lib/event-planner/money";

/**
 * Mirrors the FormData → cents conversion used by updateWpStaffQuoteDraftAction
 * (lineUnitPriceDollars_*). Keeps the acceptance matrix for dollar edge cases without
 * requiring a browser session.
 */
function unitPriceCentsFromDollarField(raw: string): number | { error: string } {
  const parsed = parseDollarInputToCents(raw);
  if (!parsed.ok) {
    return { error: parsed.error };
  }
  return parsed.cents;
}

describe("staff quote dollar form boundary", () => {
  it("accepts the Phase 12G acceptance matrix", () => {
    expect(centsToDollarInputValue(4999)).toBe("49.99");
    expect(unitPriceCentsFromDollarField("55.00")).toEqual(5500);
    expect(unitPriceCentsFromDollarField("0.01")).toEqual(1);
    expect(unitPriceCentsFromDollarField("0.10")).toEqual(10);
    expect(unitPriceCentsFromDollarField("1.00")).toEqual(100);
    expect(unitPriceCentsFromDollarField("550.00")).toEqual(55000);
  });

  it("rejects invalid employee input", () => {
    for (const raw of ["", "abc", "-5", "12.345", "  "]) {
      const result = unitPriceCentsFromDollarField(raw);
      expect(typeof result).toBe("object");
      expect((result as { error: string }).error.length).toBeGreaterThan(0);
    }
  });

  it("never maps a present blank dollar field to 0 cents", () => {
    // Mirrors unitPriceCentsFromForm: when lineUnitPriceDollars_* is present (even blank),
    // parseDollarInputToCents must reject — do not coerce to 0.
    expect(unitPriceCentsFromDollarField("")).toEqual({
      error: "Enter a unit price.",
    });
    expect(unitPriceCentsFromDollarField("0.00")).toEqual(0);
  });

  it("round-trips 4999¢ → $49.99 → 4999¢ and 5500¢ after $55.00 edit", () => {
    expect(parseDollarInputToCents(centsToDollarInputValue(4999))).toEqual({ ok: true, cents: 4999 });
    expect(parseDollarInputToCents("55.00")).toEqual({ ok: true, cents: 5500 });
    expect(centsToDollarInputValue(5500)).toBe("55.00");
  });
});
