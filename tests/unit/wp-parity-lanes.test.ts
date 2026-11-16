import { describe, expect, it } from "vitest";

import { WpParityEngine } from "@/server/event-planner/wp-parity/engine";
import { wpBowlingLanes, wpGroupSizes } from "@/server/event-planner/wp-parity";

describe("wp parity group_sizes / lanes (Engine 3.5.0)", () => {
  it("splits guests evenly within capacity", () => {
    expect(wpGroupSizes(0, 50)).toEqual([]);
    expect(wpGroupSizes(70, 50)).toEqual([35, 35]);
    expect(wpGroupSizes(71, 50)).toEqual([36, 35]);
    expect(wpGroupSizes(100, 50)).toEqual([50, 50]);
    expect(wpGroupSizes(101, 50)).toEqual([34, 34, 33]);
    expect(wpGroupSizes(70, 56)).toEqual([35, 35]);
  });

  it("matches balanced cohort lane rules", () => {
    expect(wpBowlingLanes(0)).toBe(0);
    expect(wpBowlingLanes(6)).toBe(1);
    expect(wpBowlingLanes(7)).toBe(2);
    expect(wpBowlingLanes(48)).toBe(8);
    expect(wpBowlingLanes(49)).toBe(8);
    expect(wpBowlingLanes(50)).toBe(8);
    expect(wpBowlingLanes(51)).toBe(10);
    expect(wpBowlingLanes(56)).toBe(10);
    expect(wpBowlingLanes(70)).toBe(12);
    expect(wpBowlingLanes(80)).toBe(14);
    expect(wpBowlingLanes(100)).toBe(16);
    expect(wpBowlingLanes(101)).toBe(18);
  });

  it("is exposed on the engine as Engine::lanes", () => {
    expect(WpParityEngine.lanes(100)).toBe(16);
    expect(WpParityEngine.lanes(80)).toBe(14);
    expect(WpParityEngine.lanes(50)).toBe(8);
  });
});
