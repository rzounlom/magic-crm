import { describe, expect, it } from "vitest";

import {
  createWpParityEngine,
  packageDefinitionRevision,
  packageRawDefaults,
  packageRawFromDefinition,
  sampleWpInquiry,
  validatePackageDefinition,
  type InquiryRaw,
  type PackageDefinition,
  type PackageRawInput,
  type Plan,
  type RecommendOptions,
} from "@/server/event-planner/wp-parity";

/**
 * Golden parity tests ported from Generations Event Planner 3.3.0 `tests/packages-test.php`
 * (66 checks) and `docs/packages-test-results.txt`. Totals are PHP values — never weakened.
 *
 * Helpers mirror the PHP file: `definition()`, `install_package()` (new engine with that single
 * package), `inquiry()`, `plans()` and `custom_plan()` (ReflectionMethod on `Engine::candidates`
 * becomes `WpParityEngine.candidatesForTest`).
 *
 * Skipped (need WordPress, not pure engine logic):
 *  - baseline inquiry saves without custom packages (`Plugin::save`)
 *  - active validated package loads (`Packages::active()` reads the WP option)
 *  - adding package leaves historical inquiry unchanged (post meta)
 *  - saved recommendation retains full package definition snapshot (post meta; the pure part —
 *    the plan carries the full definition — is asserted below)
 *  - later package price changes do not rewrite saved inquiry (post meta)
 *  - anonymous visitor cannot render package editor / administrator sees structured package
 *    fields (`Packages::page()` admin HTML)
 */

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

/** PHP `definition()` — defaults, then the test fixture, then per-test changes, then validate. */
function definition(changes: PackageRawInput = {}): PackageDefinition {
  const raw: PackageRawInput = {
    ...packageRawDefaults(),
    id: "11111111-1111-4111-8111-111111111111",
    name: "Local test bundle",
    status: "active",
    price: "100.00",
    basis: "group",
    size: "6",
    bowling: "120",
    shoes: "1",
    axe: "30",
    ...changes,
  };
  const result = validatePackageDefinition(raw);
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.data;
}

/** PHP `install_package()` — an engine whose only configured package is `def`. */
function install(def: PackageDefinition) {
  return createWpParityEngine({ packages: [def] });
}

/** PHP `inquiry()`. */
function inquiry(changes: Record<string, unknown> = {}): InquiryRaw {
  const x = sampleWpInquiry();
  x.attractions.bowling = "yes";
  x.attractions.axe = "yes";
  return replaceRecursive({ ...x }, changes);
}

/** PHP `plans()` — recommendation first, then alternatives. */
function plans(engine: ReturnType<typeof install>, input: InquiryRaw, options: RecommendOptions = {}) {
  const r = engine.recommend(input, options);
  if (!r.valid) {
    throw new Error(JSON.stringify(r));
  }
  return [r.dates[0]!.recommendation, ...r.dates[0]!.alternatives];
}

/** PHP `custom_plan()` — the first custom-package candidate, or null. */
function customPlan(
  def: PackageDefinition,
  input: InquiryRaw,
  options: RecommendOptions = {},
): Plan | null {
  const engine = install(def);
  const v = engine.validate(input);
  if (!v.valid) {
    throw new Error(JSON.stringify(v));
  }
  const sel = Object.entries(v.data.attractions)
    .filter(([, answer]) => answer === "yes")
    .map(([key]) => key as keyof typeof v.data.attractions);
  for (const p of engine.candidatesForTest(v.data, sel, options, v.data.dates[0]!)) {
    if (p.custom_package) {
      return p;
    }
  }
  return null;
}

function mustPlan(plan: Plan | null): Plan {
  if (!plan) {
    throw new Error("expected a custom package plan");
  }
  return plan;
}

describe("wp parity packages golden (packages-test.php)", () => {
  describe("recommendation and pricing", () => {
    const base = definition();

    it("group units round up and eligible custom package can be recommended", () => {
      const plan = plans(install(base), inquiry())[0]!;
      expect(plan.custom_package).toBeDefined();
      expect(plan.total_cents).toBe(20000);
    });

    it("purchased times and separate axe briefing are preserved", () => {
      const plan = plans(install(base), inquiry())[0]!;
      expect(plan.bowling_minutes).toBe(120);
      expect(plan.axe_minutes).toBe(30);
      expect(plan.required_minutes).toBe(165);
    });

    it("included bowling shoes and attractions are not added twice", () => {
      const plan = plans(install(base), inquiry())[0]!;
      expect(plan.items).toHaveLength(1);
    });

    it("saved recommendation retains full package definition snapshot (pure part)", () => {
      const plan = plans(install(base), inquiry())[0]!;
      expect(plan.custom_package?.definition.price).toBe(10000);
      expect(plan.custom_package?.id).toBe(base.id);
      expect(plan.custom_package?.revision).toBe(packageDefinitionRevision(base));
    });

    it("per-person pricing charges every participating guest", () => {
      const p = definition({ basis: "person", size: "6", price: "30.00" });
      const plan = mustPlan(customPlan(p, inquiry()));
      expect(p.size).toBe(1);
      expect(plan.total_cents).toBe(30000);
    });

    it("normal shoe rental is added when not included", () => {
      const plan = mustPlan(customPlan(definition({ shoes: "0" }), inquiry()));
      expect(plan.total_cents).toBe(23500);
    });
  });

  describe("eligibility", () => {
    it("draft package is excluded from recommendations", () => {
      expect(customPlan(definition({ status: "draft" }), inquiry())).toBeNull();
    });

    it("archived package is excluded", () => {
      expect(customPlan(definition({ status: "archived" }), inquiry())).toBeNull();
    });

    it("excluded attraction blocks incompatible package", () => {
      expect(customPlan(definition(), inquiry({ attractions: { axe: "no" } }))).toBeNull();
    });

    it("explicit bowling duration cannot be replaced by different package time", () => {
      expect(customPlan(definition(), inquiry(), { bowling_hours: 1 })).toBeNull();
    });

    it("explicit axe duration cannot be shortened by package", () => {
      expect(customPlan(definition(), inquiry(), { axe_minutes: 60 })).toBeNull();
    });

    it("minimum guest count enforced", () => {
      expect(customPlan(definition({ minimum: "11" }), inquiry())).toBeNull();
    });

    it("maximum guest count enforced", () => {
      expect(customPlan(definition({ maximum: "9" }), inquiry())).toBeNull();
    });

    it("children-only package cannot price adults", () => {
      expect(customPlan(definition({ audience: "children" }), inquiry())).toBeNull();
    });

    it("adults-only package cannot price mixed group", () => {
      expect(
        customPlan(definition({ audience: "adults" }), inquiry({ adults: 9, children: 1 })),
      ).toBeNull();
    });

    it("available weekdays enforced", () => {
      expect(customPlan(definition({ days: ["6"] }), inquiry())).toBeNull();
    });

    it("event-type availability enforced", () => {
      expect(customPlan(definition({ event_types: ["Birthday"] }), inquiry())).toBeNull();
    });

    it("date range enforced", () => {
      expect(customPlan(definition({ from_date: "2026-11-07" }), inquiry())).toBeNull();
    });

    it("availability boundaries are inclusive", () => {
      const p = definition({
        from_date: "2026-11-06",
        to_date: "2026-11-06",
        from_time: "13:00",
        to_time: "13:00",
      });
      expect(customPlan(p, inquiry())).not.toBeNull();
    });

    it("start time outside window rejected", () => {
      const p = definition({
        from_date: "2026-11-06",
        to_date: "2026-11-06",
        from_time: "13:00",
        to_time: "13:00",
      });
      expect(customPlan(p, inquiry({ time: "12:59" }))).toBeNull();
    });

    it("children-only custom package works for an all-child participating group", () => {
      const p = definition({ audience: "children" });
      expect(customPlan(p, inquiry({ adults: 0, children: 10 }))).not.toBeNull();
    });

    it("package age requirement is flagged for actual-participant verification", () => {
      const plan = mustPlan(customPlan(definition({ minimum_age: "18" }), inquiry()));
      expect(plan.review.join(" ")).toContain("minimum age 18");
    });
  });

  describe("food", () => {
    const foodPackage = definition({
      food_combo: "1",
      food_boneless: "1",
      food_amount: "30.00",
    });
    const food = inquiry({ food: "yes" });

    it("included food offsets once and allocated package food tax is applied", () => {
      const plan = mustPlan(customPlan(foodPackage, food));
      expect(plan.total_cents).toBe(22560);
    });

    it("boneless package follows the existing negated traditional-wing preference", () => {
      expect(
        customPlan(foodPackage, inquiry({ food: "yes", comments: "No traditional wings" }), {
          menu: "pizza_wings",
        }),
      ).not.toBeNull();
    });

    it("only uncovered meal combo purchased", () => {
      const plan = mustPlan(customPlan(foodPackage, food));
      const combo = plan.items.filter((x) => x.label.startsWith("Pizza & Pitcher Combo"));
      expect(combo).toHaveLength(1);
      expect(combo[0]!.quantity).toBe(1);
    });

    it("included wing platters are not purchased again", () => {
      const plan = mustPlan(customPlan(foodPackage, food));
      expect(plan.items.filter((x) => x.label.includes("wing platter"))).toHaveLength(0);
    });

    it("food package not offered when food declined", () => {
      expect(customPlan(foodPackage, inquiry())).toBeNull();
    });

    it("large-group dining still needs time and can trigger hold", () => {
      const plan = mustPlan(customPlan(foodPackage, inquiry({ food: "yes", adults: 27 })));
      expect(plan.fits_duration).toBe(false);
      expect(plan.dining_minutes).toBe(30);
    });

    it("included dessert requires separate dining even for small bowlers", () => {
      const p = definition({ food_brownies: "1", food_amount: "10.00" });
      const plan = mustPlan(customPlan(p, food));
      expect(plan.dining_minutes).toBe(30);
    });

    it("full included catering bar and pitchers are offset without double charge", () => {
      const p = definition({
        bowling: "0",
        shoes: "0",
        axe: "0",
        bar: "fajita",
        minimum: "15",
        maximum: "30",
        food_pitcher: "4",
        food_amount: "50.00",
      });
      const plan = mustPlan(
        customPlan(p, inquiry({ food: "yes", adults: 15, description: "Fajita catering" })),
      );
      expect(
        plan.items.filter(
          (l) => l.label === "Fajita Bar" || l.label === "Fountain beverage pitcher",
        ),
      ).toHaveLength(0);
    });
  });

  describe("room", () => {
    const roomPackage = definition({ room: "lower", room_minutes: "180", maximum: "34" });

    it("included room avoids duplicate rental", () => {
      const plan = mustPlan(customPlan(roomPackage, inquiry({ private_room: "yes" })));
      expect(plan.room_included).toBe(true);
      expect(plan.items.filter((l) => l.label.startsWith("Lower Event Room"))).toHaveLength(0);
    });

    it("room package does not override declined private room", () => {
      expect(customPlan(roomPackage, inquiry())).toBeNull();
    });

    it("included room window cannot silently extend to longer event", () => {
      expect(
        customPlan(
          roomPackage,
          inquiry({ private_room: "yes", duration: "Other", other_hours: "4" }),
        ),
      ).toBeNull();
    });
  });

  describe("arcade credit and flexible attractions", () => {
    it("included group play credit reduces arcade funding once", () => {
      const p = definition({ credit: "20.00", arcade: "1" });
      const plan = mustPlan(customPlan(p, inquiry({ attractions: { arcade: "yes" } })));
      const fund = plan.items.filter((l) => l.label.startsWith("Arcade credit"));
      expect(fund).toHaveLength(1);
      expect(fund[0]!.subtotal_cents).toBe(6000);
    });

    it("bonus credit does not schedule excluded arcade", () => {
      const p = definition({ credit: "20.00", arcade: "0" });
      const plan = mustPlan(customPlan(p, inquiry()));
      expect(plan.selected_attractions).not.toContain("arcade");
    });

    it("included laser games and arcade credit are not purchased twice", () => {
      const p = definition({
        bowling: "0",
        shoes: "0",
        axe: "0",
        price: "29.99",
        basis: "person",
        laser_games: "2",
        credit: "20.00",
        arcade: "1",
      });
      const plan = mustPlan(
        customPlan(
          p,
          inquiry({ attractions: { bowling: "no", axe: "no", laser: "yes", arcade: "yes" } }),
        ),
      );
      expect(plan.total_cents).toBe(29990);
      expect(
        plan.items.filter(
          (l) => l.label.includes("additional funding") && l.subtotal_cents > 0,
        ),
      ).toHaveLength(0);
    });

    describe("golf/climbs/laser access package", () => {
      const p = definition({
        bowling: "0",
        shoes: "0",
        axe: "0",
        price: "40.00",
        basis: "person",
        laser_access: "90",
        climbs: "2",
        golf: "1",
        arcade: "1",
        credit: "15.00",
      });
      const attractions = {
        bowling: "no",
        axe: "no",
        laser: "yes",
        climbing: "yes",
        golf: "yes",
        arcade: "yes",
      };

      it("included golf/climbs and funded arcade keep purchased laser access window", () => {
        const plan = mustPlan(customPlan(p, inquiry({ attractions })));
        expect(plan.total_cents).toBe(40000);
        expect(plan.access_minutes).toBe(90);
      });

      it("custom flexible activities use leisure windows", () => {
        const plan = mustPlan(customPlan(p, inquiry({ attractions })));
        expect(plan.itinerary.map((row) => row.label).join(" ")).toContain("at leisure");
      });

      it("package cannot smuggle excluded laser through other included activities", () => {
        expect(
          customPlan(
            p,
            inquiry({ attractions: { laser: "no", golf: "yes", climbing: "yes", arcade: "yes" } }),
          ),
        ).toBeNull();
      });
    });
  });

  describe("validatePackageDefinition (Packages::validate)", () => {
    const raw = packageRawFromDefinition(definition());

    it("round-trips a validated definition through raw form", () => {
      const again = validatePackageDefinition(raw);
      expect(again.ok).toBe(true);
      if (again.ok) {
        expect(again.data).toEqual(definition());
        expect(again.data.price).toBe(10000);
      }
    });

    const invalid: [string, unknown][] = [
      ["price", "-1"],
      ["price", "1.001"],
      ["food_amount", "101.00"],
      ["name", ""],
      ["bowling", "45"],
      ["axe", "15"],
      ["size", "0"],
      ["maximum", "0"],
      ["status", "published"],
      ["days", [["5"]]],
      ["event_types", ["Invented category"]],
      ["from_date", "2026-02-30"],
      ["to_time", "25:00"],
      ["food_brownies", "-1"],
      ["room", "invented"],
    ];
    it.each(invalid)("reject invalid package %s %j", (key, value) => {
      const result = validatePackageDefinition({ ...raw, [key]: value });
      expect(result.ok).toBe(false);
    });

    it("missing required package field rejected", () => {
      const x: PackageRawInput = { ...raw };
      delete x.price;
      expect(validatePackageDefinition(x).ok).toBe(false);
    });

    it("food inclusion requires explicit tax allocation", () => {
      expect(validatePackageDefinition({ ...raw, food_combo: "1" }).ok).toBe(false);
    });

    it("room capacity cannot be increased through package definition", () => {
      expect(
        validatePackageDefinition({ ...raw, room: "lower", room_minutes: "180", maximum: "35" }).ok,
      ).toBe(false);
    });

    it("catering-bar minimum remains fifteen", () => {
      expect(
        validatePackageDefinition({ ...raw, bar: "slider", food_amount: "20.00" }).ok,
      ).toBe(false);
    });

    it("named draft may be saved before defining its experience", () => {
      const draft = { ...packageRawDefaults(), name: "Work in progress" };
      expect(validatePackageDefinition(draft).ok).toBe(true);
    });

    it("empty draft cannot be activated as a priced experience", () => {
      const draft = { ...packageRawDefaults(), name: "Work in progress", status: "active" };
      expect(validatePackageDefinition(draft).ok).toBe(false);
    });

    it("per-person basis forces size 1 and money is integer cents", () => {
      const result = validatePackageDefinition({
        ...raw,
        basis: "person",
        size: "6",
        price: "29.99",
        credit: "20",
        food_amount: "0",
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.size).toBe(1);
        expect(result.data.price).toBe(2999);
        expect(result.data.credit).toBe(2000);
      }
    });

    it("rejects non-object input", () => {
      expect(validatePackageDefinition(null).ok).toBe(false);
      expect(validatePackageDefinition("package").ok).toBe(false);
    });
  });
});
