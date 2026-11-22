import { describe, expect, it } from "vitest";

import {
  centsToDollarInputValue,
  parseDollarInputToCents,
} from "@/lib/event-planner/money";

describe("centsToDollarInputValue", () => {
  it("formats integer cents with two decimals without float drift", () => {
    expect(centsToDollarInputValue(4999)).toBe("49.99");
    expect(centsToDollarInputValue(55000)).toBe("550.00");
    expect(centsToDollarInputValue(0)).toBe("0.00");
    expect(centsToDollarInputValue(100)).toBe("1.00");
  });
});

describe("parseDollarInputToCents", () => {
  it("parses common dollar strings exactly", () => {
    expect(parseDollarInputToCents("49.99")).toEqual({ ok: true, cents: 4999 });
    expect(parseDollarInputToCents("$550.00")).toEqual({ ok: true, cents: 55000 });
    expect(parseDollarInputToCents("550")).toEqual({ ok: true, cents: 55000 });
    expect(parseDollarInputToCents("1,234.56")).toEqual({ ok: true, cents: 123456 });
    expect(parseDollarInputToCents("10.5")).toEqual({ ok: true, cents: 1050 });
  });

  it("rejects malformed or over-precise input", () => {
    expect(parseDollarInputToCents("").ok).toBe(false);
    expect(parseDollarInputToCents("abc").ok).toBe(false);
    expect(parseDollarInputToCents("12.345").ok).toBe(false);
    expect(parseDollarInputToCents("12.3.4").ok).toBe(false);
  });

  it("round-trips display values", () => {
    for (const cents of [0, 1, 99, 100, 4999, 55000, 123456]) {
      const display = centsToDollarInputValue(cents);
      expect(parseDollarInputToCents(display)).toEqual({ ok: true, cents });
    }
  });
});
