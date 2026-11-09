import { createHash } from "node:crypto";

import {
  isoWeekday,
  phpFloat,
  phpInt,
  phpJsonEncode,
  phpRound,
  phpStrToLower,
  phpStrlen,
  phpTrim,
} from "@/server/event-planner/wp-parity/php-compat";
import type {
  AttractionKey,
  MenuPath,
  RecommendOptions,
  ValidatedInquiry,
} from "@/server/event-planner/wp-parity/types";

/**
 * Port of the helpers in Generations Event Planner 3.3.0 `includes/packages.php` that the
 * engine depends on: `food_labels()`, `attractions()`, `has_food()` and `eligible()`.
 *
 * Admin-page, validation-for-save and WordPress option storage are intentionally NOT ported:
 * MagicCRM supplies already-validated definitions through `EngineConfig.packages`
 * (empty by default — no custom packages are active unless a tenant configures them).
 */

export const WP_EVENT_TYPES = [
  "Birthday",
  "Corporate or Team Event",
  "Sports Team",
  "School or Youth Group",
  "Family or Social Gathering",
  "Other",
] as const;

export type PackageFoodKey =
  | "combo"
  | "boneless"
  | "traditional"
  | "pitcher"
  | "salad"
  | "pretzels"
  | "strips"
  | "boards"
  | "cookies"
  | "brownies";

export type PackageBar = "none" | "fajita" | "slider" | "bbq";
export type PackageRoom = "none" | "lower" | "upper" | "cove";

/** A validated custom package (PHP `Packages::validate()` output). Money is integer cents. */
export type PackageDefinition = {
  id: string;
  name: string;
  status: "draft" | "active" | "archived";
  /** cents */
  price: number;
  basis: "person" | "group";
  size: number;
  minimum: number;
  maximum: number;
  audience: "all" | "adults" | "children";
  minimum_age: number;
  /** ISO weekday strings "1".."7" (Mon..Sun). */
  days: string[];
  event_types: string[];
  from_date: string;
  to_date: string;
  from_time: string;
  to_time: string;
  /** purchased minutes: 0, 30, 60 or 120 */
  bowling: number;
  shoes: boolean;
  /** purchased minutes: 0, 30 or 60 */
  axe: number;
  laser_games: number;
  laser_access: number;
  golf: boolean;
  climbs: number;
  arcade: boolean;
  /** cents */
  credit: number;
  bar: PackageBar;
  /** cents */
  food_amount: number;
  room: PackageRoom;
  room_minutes: number;
  notes: string;
  food_combo: number;
  food_boneless: number;
  food_traditional: number;
  food_pitcher: number;
  food_salad: number;
  food_pretzels: number;
  food_strips: number;
  food_boards: number;
  food_cookies: number;
  food_brownies: number;
};

/** Raw (form-shaped) package input: every scalar is a string; `days`/`event_types` are string lists. */
export type PackageRawInput = Record<string, unknown>;

export type PackageValidationResult =
  | { ok: true; data: PackageDefinition }
  | { ok: false; error: string };

const PACKAGE_DAYS = ["1", "2", "3", "4", "5", "6", "7"] as const;
const PACKAGE_ROOM_CAPACITY = { lower: 34, upper: 44, cove: 150 } as const;

/** `Packages::defaults()` — the raw (string) form of an empty draft package. */
export function packageRawDefaults(): PackageRawInput {
  return {
    id: "",
    name: "",
    status: "draft",
    price: "0.00",
    basis: "person",
    size: "1",
    minimum: "1",
    maximum: "50",
    audience: "all",
    minimum_age: "0",
    days: [...PACKAGE_DAYS],
    event_types: [...WP_EVENT_TYPES],
    from_date: "",
    to_date: "",
    from_time: "00:00",
    to_time: "23:59",
    bowling: "0",
    shoes: "0",
    axe: "0",
    laser_games: "0",
    laser_access: "0",
    golf: "0",
    climbs: "0",
    arcade: "0",
    credit: "0.00",
    bar: "none",
    food_amount: "0.00",
    room: "none",
    room_minutes: "0",
    notes: "",
    food_combo: "0",
    food_boneless: "0",
    food_traditional: "0",
    food_pitcher: "0",
    food_salad: "0",
    food_pretzels: "0",
    food_strips: "0",
    food_boards: "0",
    food_cookies: "0",
    food_brownies: "0",
  };
}

/** `Packages::raw()` — turn a validated definition back into form-shaped strings. */
export function packageRawFromDefinition(def: PackageDefinition): PackageRawInput {
  const out = packageRawDefaults();
  for (const key of Object.keys(out)) {
    const value = (def as Record<string, unknown>)[key];
    if (value === undefined) {
      continue;
    }
    out[key] = Array.isArray(value)
      ? [...value]
      : typeof value === "boolean"
        ? value
          ? "1"
          : "0"
        : String(value);
  }
  for (const key of ["price", "credit", "food_amount"] as const) {
    const value = def[key];
    out[key] = Number.isInteger(value) ? (value / 100).toFixed(2) : "";
  }
  return out;
}

/** `Packages::money()` — dollars string to integer cents, or null when malformed/out of range. */
function parsePackageMoney(value: string): number | null {
  if (!/^(?:0|[1-9][0-9]{0,7})(?:\.[0-9]{1,2})?$/.test(value)) {
    return null;
  }
  const [whole, fraction = ""] = value.split(".") as [string, string?];
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return cents <= 1_000_000_000 ? cents : null;
}

/** `Packages::date_ok()` — strict `YYYY-MM-DD` that survives a calendar round trip. */
function isValidPackageDate(value: string): boolean {
  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value)) {
    return false;
  }
  const [y, m, d] = value.split("-").map((part) => Number(part)) as [number, number, number];
  const date = new Date(0);
  date.setUTCFullYear(y, m - 1, d);
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

function pickEnum<T extends string>(value: string, allowed: readonly T[]): T | null {
  return (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

const PACKAGE_STRING_FIELDS = Object.keys(packageRawDefaults()).filter(
  (key) => key !== "days" && key !== "event_types",
);

const PACKAGE_INT_BOUNDS: Record<string, readonly [number, number]> = {
  size: [1, 999],
  minimum: [1, 999],
  maximum: [1, 999],
  minimum_age: [0, 99],
  bowling: [0, 120],
  axe: [0, 60],
  laser_games: [0, 10],
  laser_access: [0, 180],
  climbs: [0, 10],
  room_minutes: [0, 180],
};

/**
 * `Packages::validate()` — port of the pure validation rules. Differences from WordPress by
 * design: `sanitize_text_field`/`sanitize_textarea_field` become `trim()`, and `WP_Error`
 * becomes `{ ok: false, error }`. Money is returned as integer cents.
 */
export function validatePackageDefinition(raw: unknown): PackageValidationResult {
  const fail = (error: string): PackageValidationResult => ({ ok: false, error });
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return fail("Package information is missing.");
  }
  const input = raw as PackageRawInput;
  const s: Record<string, string> = {};
  for (const key of PACKAGE_STRING_FIELDS) {
    const value = input[key];
    if (typeof value !== "string") {
      return fail("Complete every package field before saving.");
    }
    s[key] = value;
  }
  const str = (key: string): string => s[key] as string;

  const name = phpTrim(str("name"));
  const notes = phpTrim(str("notes"));
  if (name === "" || phpStrlen(name) > 120 || phpStrlen(notes) > 2000) {
    return fail("Enter a package name (up to 120 characters) and notes up to 2,000 characters.");
  }
  const id = str("id");
  if (id !== "" && !/^[a-f0-9-]{36}$/.test(id)) {
    return fail("Invalid package ID.");
  }

  const status = pickEnum(str("status"), ["draft", "active", "archived"] as const);
  if (status === null) return fail("Choose a valid status.");
  const basis = pickEnum(str("basis"), ["person", "group"] as const);
  if (basis === null) return fail("Choose a valid basis.");
  const audience = pickEnum(str("audience"), ["all", "adults", "children"] as const);
  if (audience === null) return fail("Choose a valid audience.");
  const bar = pickEnum(str("bar"), ["none", "fajita", "slider", "bbq"] as const);
  if (bar === null) return fail("Choose a valid bar.");
  const room = pickEnum(str("room"), ["none", "lower", "upper", "cove"] as const);
  if (room === null) return fail("Choose a valid room.");

  const price = parsePackageMoney(str("price"));
  const credit = parsePackageMoney(str("credit"));
  const foodAmount = parsePackageMoney(str("food_amount"));
  if (price === null || credit === null || foodAmount === null) {
    return fail("Enter dollar amounts with up to two decimal places.");
  }
  if (foodAmount > price) {
    return fail("The taxable food/beverage portion cannot exceed the package price.");
  }

  const ints: Record<string, number> = {};
  for (const [key, [min, max]] of Object.entries(PACKAGE_INT_BOUNDS)) {
    const text = str(key);
    const value = /^[0-9]+$/.test(text) ? Number(text) : Number.NaN;
    if (!Number.isFinite(value) || value < min || value > max) {
      return fail(`Invalid whole-number value for ${key}.`);
    }
    ints[key] = value;
  }
  const size = basis === "person" ? 1 : (ints.size as number);
  const minimum = ints.minimum as number;
  const maximum = ints.maximum as number;
  const bowling = ints.bowling as number;
  const axe = ints.axe as number;
  const laserGames = ints.laser_games as number;
  const laserAccess = ints.laser_access as number;
  if (minimum > maximum) {
    return fail("Minimum guests cannot exceed maximum guests.");
  }
  if (![0, 30, 60, 120].includes(bowling) || ![0, 30, 60].includes(axe)) {
    return fail("Use supported purchased bowling and axe durations.");
  }

  const flags: Record<string, boolean> = {};
  for (const key of ["shoes", "golf", "arcade"] as const) {
    const value = str(key);
    if (value !== "0" && value !== "1") {
      return fail("Invalid inclusion selection.");
    }
    flags[key] = value === "1";
  }
  const shoes = flags.shoes as boolean;
  const golf = flags.golf as boolean;
  const arcade = flags.arcade as boolean;
  if (shoes && !bowling) return fail("Included shoes require bowling.");
  if (laserGames && laserAccess) {
    return fail("Choose laser games OR a laser access window, rather than promising both.");
  }
  if (arcade && credit === 0) {
    return fail("An arcade package must include funded play credit.");
  }

  const food: Record<PackageFoodKey, number> = {
    combo: 0,
    boneless: 0,
    traditional: 0,
    pitcher: 0,
    salad: 0,
    pretzels: 0,
    strips: 0,
    boards: 0,
    cookies: 0,
    brownies: 0,
  };
  for (const key of packageFoodKeys()) {
    const text = str(`food_${key}`);
    if (!/^[0-9]+$/.test(text) || Number(text) > 99) {
      return fail("Food quantities must be whole numbers from 0 to 99 per purchased unit.");
    }
    food[key] = Number(text);
  }
  if (bar !== "none" && (minimum < 15 || food.combo || food.boneless || food.traditional)) {
    return fail(
      "Catering-bar packages need at least 15 guests and cannot also define pizza/wing meal quantities.",
    );
  }
  const roomMinutes = ints.room_minutes as number;
  if ((room === "none") !== (roomMinutes === 0)) {
    return fail("Select both an included room and its purchased room time, or neither.");
  }
  if (room !== "none" && maximum > PACKAGE_ROOM_CAPACITY[room]) {
    return fail("Maximum guests exceed the included room’s seated capacity.");
  }
  const hasFood = bar !== "none" || packageFoodKeys().some((key) => food[key] !== 0);
  if (price > 0 && hasFood && foodAmount === 0) {
    return fail("Enter the food/beverage portion of this package price so tax can be calculated.");
  }
  if (!hasFood && foodAmount) {
    return fail("A food/beverage tax allocation requires an included food or pitcher item.");
  }
  const climbs = ints.climbs as number;
  if (
    status === "active" &&
    !bowling &&
    !axe &&
    !laserGames &&
    !laserAccess &&
    !golf &&
    !climbs &&
    !arcade &&
    !hasFood &&
    room === "none"
  ) {
    return fail("Include at least one attraction, food item, or private room before activating.");
  }

  const lists: Record<"days" | "event_types", string[]> = { days: [], event_types: [] };
  for (const [key, allowed] of [
    ["days", PACKAGE_DAYS],
    ["event_types", WP_EVENT_TYPES],
  ] as const) {
    const values = input[key] ?? [];
    if (!Array.isArray(values) || values.length === 0) {
      return fail("Select days and event types.");
    }
    for (const value of values) {
      if (typeof value !== "string" || !(allowed as readonly string[]).includes(value)) {
        return fail("Invalid availability choice.");
      }
    }
    lists[key] = [...new Set(values as string[])];
  }

  const fromDate = str("from_date");
  const toDate = str("to_date");
  for (const date of [fromDate, toDate]) {
    if (date !== "" && !isValidPackageDate(date)) {
      return fail("Use valid availability dates.");
    }
  }
  if (fromDate !== "" && toDate !== "" && fromDate > toDate) {
    return fail("The first available date must precede the last date.");
  }
  const fromTime = str("from_time");
  const toTime = str("to_time");
  for (const time of [fromTime, toTime]) {
    if (!/^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/.test(time)) {
      return fail("Use valid start-window times.");
    }
  }
  if (fromTime > toTime) {
    return fail("Start windows cannot cross midnight.");
  }

  return {
    ok: true,
    data: {
      id,
      name,
      status,
      price,
      basis,
      size,
      minimum,
      maximum,
      audience,
      minimum_age: ints.minimum_age as number,
      days: lists.days,
      event_types: lists.event_types,
      from_date: fromDate,
      to_date: toDate,
      from_time: fromTime,
      to_time: toTime,
      bowling,
      shoes,
      axe,
      laser_games: laserGames,
      laser_access: laserAccess,
      golf,
      climbs,
      arcade,
      credit,
      bar,
      food_amount: foodAmount,
      room,
      room_minutes: roomMinutes,
      notes,
      food_combo: food.combo,
      food_boneless: food.boneless,
      food_traditional: food.traditional,
      food_pitcher: food.pitcher,
      food_salad: food.salad,
      food_pretzels: food.pretzels,
      food_strips: food.strips,
      food_boards: food.boards,
      food_cookies: food.cookies,
      food_brownies: food.brownies,
    },
  };
}

/** Default: no active custom packages. */
export const EMPTY_ACTIVE_PACKAGES: readonly PackageDefinition[] = Object.freeze([]);

/** `Packages::food_labels()` (insertion order is significant). */
export function foodLabels(): Record<PackageFoodKey, string> {
  return {
    combo: "Pizza & pitcher combos",
    boneless: "36-piece boneless wing platters",
    traditional: "36-piece traditional wing platters",
    pitcher: "Separate fountain pitchers",
    salad: "Salad pans",
    pretzels: "Pretzel platters",
    strips: "Chicken strip platters",
    boards: "Sets of veggie, fruit & cheese boards",
    cookies: "Cookie trays",
    brownies: "Brownie trays",
  };
}

export function packageFoodKeys(): PackageFoodKey[] {
  return Object.keys(foodLabels()) as PackageFoodKey[];
}

export function packageFoodQuantity(def: PackageDefinition, key: PackageFoodKey): number {
  return def[`food_${key}`];
}

/** `Packages::has_food()` */
export function packageHasFood(def: PackageDefinition): boolean {
  if (def.bar !== "none") {
    return true;
  }
  return packageFoodKeys().some((key) => packageFoodQuantity(def, key) !== 0);
}

/** `Packages::attractions()` */
export function attractionsFromPackage(def: PackageDefinition): AttractionKey[] {
  const out: AttractionKey[] = [];
  if (def.bowling) out.push("bowling");
  if (def.axe) out.push("axe");
  if (def.golf) out.push("golf");
  if (def.climbs) out.push("climbing");
  if (def.arcade) out.push("arcade");
  if (def.laser_games || def.laser_access) out.push("laser");
  return out;
}

/**
 * `Packages::eligible()`. Mirrors the PHP order of checks exactly.
 * `selected` is the attraction set under evaluation (`$sel`).
 */
export function isPackageEligible(
  def: PackageDefinition,
  inquiry: ValidatedInquiry,
  selected: readonly AttractionKey[],
  options: RecommendOptions,
  menu: MenuPath,
  date: string,
): boolean {
  const n = inquiry.guests;
  const day = String(isoWeekday(date));
  if (
    n < def.minimum ||
    n > def.maximum ||
    !def.days.includes(day) ||
    !def.event_types.includes(inquiry.event_type) ||
    inquiry.time < def.from_time ||
    inquiry.time > def.to_time ||
    (def.from_date !== "" && date < def.from_date) ||
    (def.to_date !== "" && date > def.to_date)
  ) {
    return false;
  }
  if (
    (def.audience === "adults" && inquiry.children > 0) ||
    (def.audience === "children" && inquiry.adults > 0) ||
    attractionsFromPackage(def).some((key) => !selected.includes(key))
  ) {
    return false;
  }
  if (packageHasFood(def) && menu === "none") {
    return false;
  }
  if (def.food_combo && menu !== "pizza" && menu !== "pizza_wings") {
    return false;
  }
  if (
    (def.food_boneless || def.food_traditional) &&
    menu !== "pizza_wings" &&
    menu !== "wings" &&
    menu !== "appetizers"
  ) {
    return false;
  }
  const text = phpStrToLower(`${inquiry.description} ${inquiry.comments}`);
  const wing =
    options.wing_type ??
    (/\btraditional\s+wings\b/.test(text) && !/\b(?:no|not|without)\s+traditional\s+wings\b/.test(text)
      ? "traditional"
      : "boneless");
  if (
    (def.food_boneless && wing !== "boneless") ||
    (def.food_traditional && wing !== "traditional")
  ) {
    return false;
  }
  if (def.bar !== "none" && def.bar !== menu) {
    return false;
  }
  if (
    def.room !== "none" &&
    (inquiry.private_room !== "yes" ||
      (options.room != null && options.room !== def.room) ||
      Math.max(inquiry.minutes, phpFloat(options.room_hours ?? 0) * 60) > def.room_minutes)
  ) {
    return false;
  }
  if (
    def.bowling &&
    options.bowling_hours != null &&
    def.bowling !== phpRound(phpFloat(options.bowling_hours) * 60)
  ) {
    return false;
  }
  if (def.axe && options.axe_minutes != null && def.axe !== phpInt(options.axe_minutes)) {
    return false;
  }
  return true;
}

const REVISION_KEY_ORDER = [
  "id",
  "name",
  "status",
  "price",
  "basis",
  "size",
  "minimum",
  "maximum",
  "audience",
  "minimum_age",
  "from_date",
  "to_date",
  "from_time",
  "to_time",
  "bowling",
  "shoes",
  "axe",
  "laser_games",
  "laser_access",
  "golf",
  "climbs",
  "arcade",
  "credit",
  "bar",
  "food_amount",
  "room",
  "room_minutes",
  "notes",
  "food_combo",
  "food_boneless",
  "food_traditional",
  "food_pitcher",
  "food_salad",
  "food_pretzels",
  "food_strips",
  "food_boards",
  "food_cookies",
  "food_brownies",
  "days",
  "event_types",
] as const satisfies readonly (keyof PackageDefinition)[];

/**
 * `substr(hash('sha256', json_encode($def)), 0, 16)` — key order follows PHP's
 * `Packages::validate()` output (defaults order, with `days`/`event_types` appended last).
 */
export function packageDefinitionRevision(def: PackageDefinition): string {
  const ordered: Record<string, unknown> = {};
  for (const key of REVISION_KEY_ORDER) {
    ordered[key] = def[key];
  }
  return createHash("sha256").update(phpJsonEncode(ordered)).digest("hex").slice(0, 16);
}
