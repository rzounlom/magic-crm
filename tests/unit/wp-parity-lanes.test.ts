import { describe, expect, it } from "vitest";

import { WpParityEngine } from "@/server/event-planner/wp-parity/engine";
import { wpBowlingLanes } from "@/server/event-planner/wp-parity";

describe("wp parity lanes (Engine::lanes)", () => {
  it("matches the WordPress cohort rules", () => {
    expect(wpBowlingLanes(0)).toBe(0);
    expect(wpBowlingLanes(6)).toBe(1);
    expect(wpBowlingLanes(7)).toBe(2);
    expect(wpBowlingLanes(48)).toBe(8);
    expect(wpBowlingLanes(49)).toBe(8);
    expect(wpBowlingLanes(50)).toBe(8);
    expect(wpBowlingLanes(51)).toBe(9);
    expect(wpBowlingLanes(100)).toBe(16);
  });

  it("is exposed on the engine as Engine::lanes", () => {
    expect(WpParityEngine.lanes(100)).toBe(16);
    expect(WpParityEngine.lanes(50)).toBe(8);
  });
});
