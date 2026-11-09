import { describe, expect, it } from "vitest";

import { createWpParityEngine } from "@/server/event-planner/wp-parity";
import {
  attractionsFromPackage,
  foodLabels,
  isPackageEligible,
  type PackageDefinition,
} from "@/server/event-planner/wp-parity/packages";
import { sampleWpInquiry } from "@/server/event-planner/wp-parity/sample";

function basePackage(overrides: Partial<PackageDefinition> = {}): PackageDefinition {
  return {
    id: "pkg_test",
    name: "Test Package",
    status: "active",
    price: 5500,
    basis: "person",
    size: 1,
    minimum: 1,
    maximum: 50,
    audience: "all",
    minimum_age: 0,
    days: ["1", "2", "3", "4", "5", "6", "7"],
    event_types: [
      "Birthday",
      "Corporate or Team Event",
      "Sports Team",
      "School or Youth Group",
      "Family or Social Gathering",
      "Other",
    ],
    from_date: "",
    to_date: "",
    from_time: "00:00",
    to_time: "23:59",
    bowling: 60,
    shoes: true,
    axe: 0,
    laser_games: 0,
    laser_access: 0,
    golf: false,
    climbs: 0,
    arcade: false,
    credit: 0,
    bar: "none",
    food_amount: 0,
    food_combo: 0,
    food_boneless: 0,
    food_traditional: 0,
    food_pretzels: 0,
    food_strips: 0,
    food_salad: 0,
    food_boards: 0,
    food_cookies: 0,
    food_brownies: 0,
    food_pitcher: 0,
    room: "none",
    room_minutes: 0,
    notes: "",
    ...overrides,
  };
}

describe("wp parity packages helpers", () => {
  it("exposes food labels and attraction mapping", () => {
    expect(foodLabels().combo).toContain("Pizza");
    expect(attractionsFromPackage(basePackage({ axe: 30, arcade: true }))).toEqual(
      expect.arrayContaining(["bowling", "axe", "arcade"]),
    );
  });

  it("rejects packages that require an excluded attraction", () => {
    const engine = createWpParityEngine();
    const validated = engine.validate({
      ...sampleWpInquiry(),
      adults: 10,
      attractions: {
        bowling: "yes",
        axe: "no",
        laser: "no",
        golf: "no",
        climbing: "no",
        arcade: "no",
      },
    });
    expect(validated.valid).toBe(true);
    if (!validated.valid) {
      return;
    }
    expect(
      isPackageEligible(
        basePackage({ axe: 30 }),
        validated.data,
        ["bowling", "axe"],
        {},
        "none",
        "2026-11-06",
      ),
    ).toBe(true);
    expect(
      isPackageEligible(basePackage({ axe: 30 }), validated.data, ["bowling"], {}, "none", "2026-11-06"),
    ).toBe(false);
  });
});
