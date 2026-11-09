import {
  WP_CATALOG_VERSION,
  wpCatalogDefaults,
  wpCatalogRevision,
  type WpCatalog,
} from "@/server/event-planner/wp-parity/catalog";
import { wpBowlingLanes } from "@/server/event-planner/wp-parity/lanes";
import {
  WP_EVENT_TYPES,
  foodLabels,
  isPackageEligible,
  packageDefinitionRevision,
  packageFoodKeys,
  packageFoodQuantity,
  type PackageDefinition,
} from "@/server/event-planner/wp-parity/packages";
import {
  isPhpScalar,
  isoWeekday,
  phpFloat,
  phpInt,
  phpIsNumeric,
  phpMoneyFromCents,
  phpRound,
  phpStrToLower,
  phpStrlen,
  phpTrim,
} from "@/server/event-planner/wp-parity/php-compat";
import type {
  AttractionAnswer,
  AttractionKey,
  DayRecommendation,
  EngineConfig,
  ExtraKey,
  InquiryRaw,
  ItineraryRow,
  MenuPath,
  Plan,
  PlanDraft,
  RankedPlan,
  RecommendOptions,
  RecommendResult,
  RentalKind,
  RoomKey,
  ValidatedInquiry,
  ValidationResult,
  WingType,
} from "@/server/event-planner/wp-parity/types";

/**
 * Faithful TypeScript port of Generations Event Planner 3.3.0 `includes/engine.php`
 * (`Generations\PlannerNext\Engine`). Method order and control flow intentionally follow the
 * PHP source. Money is integer cents.
 *
 * Pricing inputs are PLUGIN DEFAULTS unless the caller injects another catalog.
 *
 * Known representation differences from PHP (see also the port report):
 *  - FILTER_VALIDATE_EMAIL is approximated with an RFC 5322 dot-atom regex.
 *  - Itinerary clock strings use Intl with America/Indiana/Indianapolis (no luxon).
 *  - PHP int/float strictness on `bowling_minutes === 120` is preserved via a marker flag.
 */

const ATTRACTIONS: Readonly<Record<AttractionKey, string>> = {
  bowling: "Bowling",
  axe: "Axe Throwing",
  laser: "Laser Tag",
  golf: "Mini Golf",
  climbing: "Climbing",
  arcade: "Arcade",
};
const ATTRACTION_KEYS = Object.keys(ATTRACTIONS) as AttractionKey[];

const MENU_PATHS: readonly string[] = [
  "pizza",
  "pizza_wings",
  "wings",
  "appetizers",
  "fajita",
  "slider",
  "bbq",
];
const ROOM_KEYS: readonly string[] = ["lower", "upper", "cove"];
const RENTAL_KINDS: readonly string[] = ["bowling", "axe", "laser", "mezzanine", "full"];
const EXTRA_KEYS: readonly ExtraKey[] = [
  "salad",
  "pretzels",
  "strips",
  "brownies",
  "cookies",
  "traditional",
];
const STRING_FIELDS = [
  "first_name",
  "last_name",
  "company",
  "event_type",
  "phone",
  "email",
  "time",
  "duration",
  "food",
  "private_room",
  "craft",
  "has_budget",
  "description",
  "referral",
] as const;

/** PHP `PHP_INT_MAX` stand-in for the schedule "earliest start" scan. */
const PHP_INT_MAX_LIKE = Number.MAX_SAFE_INTEGER;
const SCHEDULE_TIME_ZONE = "America/Indiana/Indianapolis";

type FoodKey = keyof WpCatalog["food"];
type Working = PlanDraft & Partial<Omit<Plan, keyof PlanDraft>>;

type ScheduleJob = {
  id: number;
  n: number;
  order: ("b" | "a")[];
  step: number;
  ready: number;
};

function isRoomKey(value: unknown): value is RoomKey {
  return typeof value === "string" && ROOM_KEYS.includes(value);
}

function isMenuPath(value: unknown): value is Exclude<MenuPath, "none"> {
  return typeof value === "string" && MENU_PATHS.includes(value);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function unique<T>(values: readonly T[]): T[] {
  return Array.from(new Set(values));
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** `DateTimeImmutable::createFromFormat('!Y-m-d')` round-trip check. */
function isValidCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return false;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1) {
    return false;
  }
  const dim = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= (dim[month - 1] as number);
}

/** Approximates PHP FILTER_VALIDATE_EMAIL (ASCII dot-atom local part, dotted LDH domain). */
function isValidEmail(value: string): boolean {
  if (value.length > 254) {
    return false;
  }
  const at = value.lastIndexOf("@");
  if (at < 1) {
    return false;
  }
  const local = value.slice(0, at);
  const domain = value.slice(at + 1);
  if (local.length > 64) {
    return false;
  }
  if (!/^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/.test(local)) {
    return false;
  }
  if (domain.length > 253) {
    return false;
  }
  return /^(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(
    domain,
  );
}

function compareScore(a: readonly number[], b: readonly number[]): number {
  for (let i = 0; i < a.length; i += 1) {
    const x = a[i] as number;
    const y = b[i] as number;
    if (x !== y) {
      return x < y ? -1 : 1;
    }
  }
  return 0;
}

// --- Itinerary clock (America/Indiana/Indianapolis) without luxon ------------------------

let offsetFormatter: Intl.DateTimeFormat | undefined;
let clockFormatter: Intl.DateTimeFormat | undefined;

function getOffsetFormatter(): Intl.DateTimeFormat {
  offsetFormatter ??= new Intl.DateTimeFormat("en-US", {
    timeZone: SCHEDULE_TIME_ZONE,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  });
  return offsetFormatter;
}

function getClockFormatter(): Intl.DateTimeFormat {
  clockFormatter ??= new Intl.DateTimeFormat("en-US", {
    timeZone: SCHEDULE_TIME_ZONE,
    hourCycle: "h12",
    hour: "numeric",
    minute: "2-digit",
  });
  return clockFormatter;
}

function zoneOffsetMs(utcMs: number): number {
  const parts = getOffsetFormatter().formatToParts(new Date(utcMs));
  const pick = (type: string): number =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");
  const localAsUtc = Date.UTC(
    pick("year"),
    pick("month") - 1,
    pick("day"),
    pick("hour") % 24,
    pick("minute"),
    pick("second"),
  );
  return localAsUtc - Math.floor(utcMs / 1000) * 1000;
}

/** UTC instant for a wall-clock date/time in the schedule time zone. */
function scheduleStartUtcMs(date: string, time: string): number {
  const [y, mo, d] = date.split("-").map((part) => Number(part)) as [number, number, number];
  const [h, mi] = time.split(":").map((part) => Number(part)) as [number, number];
  const guess = Date.UTC(y, mo - 1, d, h, mi, 0);
  const first = zoneOffsetMs(guess);
  let utc = guess - first;
  const second = zoneOffsetMs(utc);
  if (second !== first) {
    utc = guess - second;
  }
  return utc;
}

/** PHP `format('g:i A')` equivalent. */
function formatClock(utcMs: number): string {
  const parts = getClockFormatter().formatToParts(new Date(utcMs));
  const hour = parts.find((part) => part.type === "hour")?.value ?? "12";
  const minute = parts.find((part) => part.type === "minute")?.value ?? "00";
  const period = (parts.find((part) => part.type === "dayPeriod")?.value ?? "AM").toUpperCase();
  return `${hour}:${minute} ${period}`;
}

// ------------------------------------------------------------------------------------------

export class WpParityEngine {
  static readonly ATTRACTIONS = ATTRACTIONS;
  static readonly EVENT_TYPES = WP_EVENT_TYPES;

  readonly catalog: WpCatalog;
  readonly packages: readonly PackageDefinition[];
  private readonly c: WpCatalog;

  constructor(config: Partial<EngineConfig> = {}) {
    this.c = config.catalog ?? wpCatalogDefaults();
    this.catalog = this.c;
    // PHP `Packages::active()`: only active packages are recommended, capped at twenty.
    this.packages = (config.packages ?? []).filter((def) => def.status === "active").slice(0, 20);
  }

  static money(cents: number): string {
    return phpMoneyFromCents(cents);
  }

  static lanes(n: number): number {
    return wpBowlingLanes(n);
  }

  validate(raw: InquiryRaw): ValidationResult {
    const errors: Record<string, string> = {};
    const d: ValidatedInquiry = {
      first_name: "",
      last_name: "",
      company: "",
      event_type: "",
      phone: "",
      email: "",
      time: "",
      duration: "",
      food: "",
      private_room: "",
      craft: "",
      has_budget: "",
      description: "",
      referral: "",
      dates: [],
      adults: 0,
      children: 0,
      guests: 0,
      minutes: 0,
      other_hours: null,
      budget: null,
      attractions: {},
      comments: "",
    };
    for (const f of STRING_FIELDS) {
      const value = raw[f];
      d[f] = value != null && isPhpScalar(value) ? phpTrim(String(value)) : "";
      if (d[f] === "") {
        errors[f] = "Please complete this field.";
      }
      if (phpStrlen(d[f]) > 4000) {
        errors[f] = "Please use fewer than 4,000 characters.";
      }
    }
    if (!(WP_EVENT_TYPES as readonly string[]).includes(d.event_type)) {
      errors.event_type = "Choose an event type.";
    }
    if (!isValidEmail(d.email) || /[\r\n]/.test(d.email)) {
      errors.email = "Enter a valid email address.";
    }
    if (!/^[+()0-9 .x-]{7,30}$/i.test(d.phone) || d.phone.replace(/\D/g, "").length < 7) {
      errors.phone = "Enter a valid phone number.";
    }
    if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(d.time)) {
      errors.time = "Choose a valid start time.";
    }
    const rawDates = raw.dates ?? [];
    const dates: unknown[] = Array.isArray(rawDates)
      ? rawDates
      : isPlainObject(rawDates)
        ? Object.values(rawDates)
        : [];
    if (dates.length < 1 || dates.length > 5) {
      errors.dates = "Choose between one and five preferred dates.";
    }
    for (const s of dates) {
      if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) {
        errors.dates = "Choose valid dates.";
        continue;
      }
      if (!isValidCalendarDate(s)) {
        errors.dates = "Choose valid dates.";
      } else {
        d.dates.push(s);
      }
    }
    d.dates = unique(d.dates);
    for (const f of ["adults", "children"] as const) {
      const v = raw[f] ?? null;
      if (!isPhpScalar(v) || !/^\d{1,3}(?=\n?$)/.test(String(v))) {
        errors[f] = "Enter a whole-number guest count.";
        d[f] = 0;
      } else {
        d[f] = phpInt(v);
      }
    }
    d.guests = d.adults + d.children;
    if (d.guests < 1 || d.guests > 999) {
      errors.adults = "Enter a combined guest count between 1 and 999.";
    }
    if (!["2 hours", "3 hours", "Other"].includes(d.duration)) {
      errors.duration = "Choose an event duration.";
    }
    const v = raw.other_hours ?? "";
    if (
      d.duration === "Other" &&
      (!isPhpScalar(v) || !phpIsNumeric(v) || phpFloat(v) <= 0 || phpFloat(v) > 24)
    ) {
      errors.other_hours = "Enter the desired duration in hours, up to 24.";
    }
    d.minutes =
      d.duration === "2 hours"
        ? 120
        : d.duration === "3 hours"
          ? 180
          : phpIsNumeric(v)
            ? phpRound(phpFloat(v) * 60)
            : 0;
    d.other_hours = d.duration === "Other" ? phpFloat(phpIsNumeric(v) ? v : 0) : null;
    for (const f of ["food", "private_room", "craft", "has_budget"] as const) {
      if (!["yes", "no"].includes(d[f])) {
        errors[f] = "Choose Yes or No.";
      }
    }
    const b = raw.budget ?? "";
    if (
      d.has_budget === "yes" &&
      (!isPhpScalar(b) || !phpIsNumeric(b) || phpFloat(b) <= 0 || phpFloat(b) > 10000000)
    ) {
      errors.budget = "Enter a positive total event budget.";
    }
    d.budget = d.has_budget === "yes" && phpIsNumeric(b) ? phpRound(phpFloat(b) * 100) : null;
    d.attractions = {};
    const rawAttractions = raw.attractions;
    for (const k of ATTRACTION_KEYS) {
      const a = isPlainObject(rawAttractions) ? (rawAttractions[k] ?? null) : null;
      if (typeof a !== "string" || !["yes", "no", "open"].includes(a)) {
        errors[`attractions.${k}`] = `Choose an answer for ${ATTRACTIONS[k]}.`;
      } else {
        d.attractions[k] = a as AttractionAnswer;
      }
    }
    d.comments = typeof raw.comments === "string" ? phpTrim(raw.comments) : "";
    if (phpStrlen(d.comments) > 8000) {
      errors.comments = "Please use fewer than 8,000 characters.";
    }
    return { valid: Object.keys(errors).length === 0, errors, data: d };
  }

  private line(
    p: PlanDraft,
    label: string,
    qty: number,
    unit: number,
    taxable = false,
    allocation = 1.0,
  ): void {
    if (qty <= 0) {
      return;
    }
    const sub = phpRound(qty * unit);
    const tax = taxable ? phpRound(sub * 0.07 * allocation) : 0;
    p.items.push({
      label,
      quantity: qty,
      unit_cents: unit,
      subtotal_cents: sub,
      tax_cents: tax,
    });
    p.subtotal_cents += sub;
    p.tax_cents += tax;
    p.total_cents += sub + tax;
  }

  private product(label: string, tier = 0): PlanDraft {
    return {
      name: label,
      tier,
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

  private weekday(date: string): number {
    return isoWeekday(date);
  }

  private foodPath(d: ValidatedInquiry, o: RecommendOptions): MenuPath {
    if (d.food === "no") {
      return "none";
    }
    if (isMenuPath(o.menu)) {
      return o.menu;
    }
    const text = phpStrToLower(`${d.description} ${d.comments}`);
    const positive = text.replace(/\b(?:no|not|without|do not|don't)\b[^,.;\n]*/gi, "");
    const words: [string, MenuPath][] = [
      ["fajita", "fajita"],
      ["slider", "slider"],
      ["smokehouse", "bbq"],
      ["bbq", "bbq"],
    ];
    for (const [word, path] of words) {
      if (new RegExp(`\\b${word}\\b`).test(positive)) {
        return path;
      }
    }
    if (/\bwings\b/.test(positive)) {
      return /\bpizza\b/.test(positive) ? "pizza_wings" : "wings";
    }
    if (
      /\bpizza\b/.test(positive) ||
      /\b(?:no|without)\s+(?:boneless\s+|traditional\s+)?wings\b/.test(text)
    ) {
      return "pizza";
    }
    return d.adults > 0 && d.children === 0 ? "pizza_wings" : "pizza";
  }

  private foodLine(p: PlanDraft, label: string, quantity: number, key: FoodKey | "pitcher"): void {
    const available = p.included_food?.[key] ?? 0;
    const included = Math.min(quantity, available);
    if (included && p.included_food) {
      p.included_food[key] = available - included;
      p.notes.push(`${included} included ${label} offset the additional purchase.`);
    }
    const unit = key === "pitcher" ? this.c.pitcher : this.c.food[key];
    this.line(p, label, Math.max(0, quantity - included), unit, true);
  }

  /** Show guest cards and top-ups, never a pooled dollar balance as one card. */
  private arcadeLines(p: PlanDraft, d: ValidatedInquiry, target: number, applied: number): void {
    const groups: ["adult" | "child" | "guest", number, number][] = p.child_credit_only
      ? [
          ["adult", d.adults, 0],
          ["child", d.children, applied],
        ]
      : [["guest", d.guests, applied]];
    p.arcade_cards = [];
    for (const [audience, count, included] of groups) {
      if (!count) {
        continue;
      }
      const extra = count * target - included;
      const base = Math.floor(extra / count);
      const remainder = extra % count;
      const parts: [number, number][] = [
        [count - remainder, base],
        [remainder, base + 1],
      ];
      for (const [quantity, unit] of parts) {
        if (!quantity) {
          continue;
        }
        const includedEach = target - unit;
        let label = `Arcade credit — ${audience} card, ${WpParityEngine.money(target)} total credit`;
        if (includedEach) {
          label += ` (${WpParityEngine.money(includedEach)} included; ${unit ? "top-up" : "no additional charge"})`;
        }
        this.line(p, label, quantity, unit);
        p.arcade_cards.push({
          audience,
          quantity,
          credit_cents: target,
          included_cents_each: includedEach,
          additional_cents_each: unit,
        });
      }
      p.notes.push(
        `Prepare ${count} ${audience} arcade card${count === 1 ? "" : "s"} with ${WpParityEngine.money(target)} total credit each: ${WpParityEngine.money(included)} from included credit and ${WpParityEngine.money(extra)} additional funding for this group.`,
      );
    }
  }

  private complete(
    plan: PlanDraft,
    d: ValidatedInquiry,
    sel: AttractionKey[],
    o: RecommendOptions,
    menu: MenuPath,
    date: string,
  ): Plan {
    const p: Working = plan;
    const n = d.guests;
    const w = this.weekday(date);
    const factor = w === 3 ? 0.5 : 1;
    // Included monetary credit may fund requested flexible attractions. Never schedule a No attraction.
    const need = new Map<string, number>(Object.entries(p.deferred_play ?? {}));
    if (sel.includes("golf") && !p.covers_golf) {
      need.set(
        `Mini golf — one round: ${d.adults} adults + ${d.children} children`,
        phpRound((d.adults * this.c.golf.adult + d.children * this.c.golf.child) * factor),
      );
    }
    if (sel.includes("climbing") && !p.covers_climbing) {
      need.set(
        "Climbing — one climb per participant",
        phpRound((p.climb_count ?? n) * this.c.climb * factor),
      );
    }
    if (sel.includes("arcade") && !p.covers_arcade) {
      need.set("Arcade credit", n * (p.arcade_target ?? 1000));
    }
    // Preserve the promised arcade allowance before funding other requested play.
    const arcadeNeed = need.get("Arcade credit");
    const ordered =
      arcadeNeed !== undefined
        ? new Map<string, number>([["Arcade credit", arcadeNeed], ...need])
        : need;
    let credit = p.included_credit_cents;
    for (const [label, rawAmount] of ordered) {
      let amount = rawAmount;
      let eligible = amount;
      if (p.child_credit_only) {
        eligible = label.startsWith("Mini golf")
          ? phpRound(d.children * this.c.golf.child * factor)
          : label.startsWith("Arcade")
            ? d.children * 1500
            : 0;
      }
      const applied = Math.min(credit, amount, eligible);
      credit -= applied;
      amount -= applied;
      if (applied) {
        p.notes.push(
          `${WpParityEngine.money(applied)} included play credit allocated to ${p.child_credit_only ? "participating children’s " : ""}${label}.`,
        );
      }
      if (label === "Arcade credit") {
        this.arcadeLines(p, d, p.arcade_target ?? 1000, applied);
      } else {
        this.line(p, `${label} (additional funding)`, 1, amount);
      }
    }
    if (credit > 0) {
      p.notes.push(
        `${WpParityEngine.money(credit)} included play credit remains available; no excluded attraction is added to the itinerary.`,
      );
    }
    if (menu === "pizza" || menu === "pizza_wings") {
      const combos = Math.ceil(d.adults / 4 + d.children / 5);
      this.foodLine(
        p,
        "Pizza & Pitcher Combo (additional)",
        Math.max(0, combos - p.included_combos),
        "combo",
      );
      if (menu === "pizza_wings") {
        const wing = this.wingType(d, o);
        this.foodLine(p, `36-piece ${wing} wing platter`, Math.ceil((n * 4) / 36), wing);
      }
    } else if (menu === "wings") {
      const wing = this.wingType(d, o);
      this.foodLine(p, `36-piece ${wing} wing platter`, Math.ceil((n * 4) / 36), wing);
      this.foodLine(
        p,
        "Fountain beverage pitcher",
        Math.ceil(d.adults / 4 + d.children / 5),
        "pitcher",
      );
    } else if (menu === "fajita" || menu === "slider" || menu === "bbq") {
      const barLabel = { fajita: "Fajita Bar", slider: "Slider Bar", bbq: "Smokehouse BBQ" }[menu];
      this.foodLine(p, barLabel, n, menu);
      if (n < 15) {
        p.review.push(
          "Catering bars require at least 15 guests; this requested menu needs staff follow-up.",
        );
      }
      this.foodLine(
        p,
        "Fountain beverage pitcher",
        Math.ceil(d.adults / 4 + d.children / 5),
        "pitcher",
      );
    } else if (menu === "appetizers") {
      const wing = this.wingType(d, o);
      this.foodLine(p, `36-piece ${wing} wing platter`, Math.ceil((n * 4) / 36), wing);
      this.foodLine(
        p,
        "Veggie, fruit and cheese — set of 3 boards",
        Math.min(4, Math.ceil(n / 30)),
        "boards",
      );
      if (n > 120) {
        p.review.push(
          "Confirm appetizer quantities above the retained four-set board planning limit.",
        );
      }
      this.foodLine(p, "Cookie tray", Math.ceil(n / 20), "cookies");
      this.foodLine(
        p,
        "Fountain beverage pitcher",
        Math.ceil(d.adults / 4 + d.children / 5),
        "pitcher",
      );
    }
    const extra = o.extras ?? {};
    for (const k of EXTRA_KEYS) {
      const value = extra[k];
      if (value != null && phpIsNumeric(value) && phpInt(value) > 0 && menu !== "none") {
        this.foodLine(
          p,
          `${k.charAt(0).toUpperCase()}${k.slice(1)} platter / tray`,
          phpInt(value),
          k,
        );
      }
    }
    p.dining_minutes =
      menu === "none"
        ? 0
        : Object.keys(extra).filter((k) => k !== "traditional").length === 0 &&
            n <= 25 &&
            sel.includes("bowling") &&
            (menu === "pizza" || menu === "pizza_wings" || menu === "wings")
          ? 0
          : 30;
    if (p.separate_package_dining && menu !== "none") {
      p.dining_minutes = 30;
    }
    if (d.craft === "yes") {
      this.line(
        p,
        "Beer Wall drink card — eligible adult estimate",
        d.adults,
        this.c.drink_card,
        true,
      );
      p.review.push("Verify eligible adult drink-card recipients before finalizing.");
    }
    if (d.private_room === "yes" && !p.room_included) {
      let room: RoomKey =
        n <= 34 && !sel.includes("bowling") && !sel.includes("axe")
          ? "lower"
          : n <= 44
            ? "upper"
            : "cove";
      if (isRoomKey(o.room)) {
        room = o.room;
      }
      const label = {
        lower: "Lower Event Room",
        upper: "Skybox / Upper Event Room",
        cove: o.room === "cove" ? "Climbers Cove" : "Private gathering space",
      }[room];
      this.line(p, `${label} — 3 hours`, 1, this.c.rooms[room]);
      if (n > 150) {
        p.review.push(
          "The requested group exceeds the 150-seat space; seating/private-space configuration requires staff review.",
        );
      }
      const roomHours =
        o.room_hours != null && phpIsNumeric(o.room_hours) && Number.isFinite(phpFloat(o.room_hours))
          ? phpFloat(o.room_hours)
          : 3;
      if (roomHours > 3) {
        const extraHours = roomHours - 3;
        if (room === "cove") {
          this.line(
            p,
            `Explicitly requested prorated gathering-space extension — ${extraHours} hours`,
            1,
            phpRound((extraHours * this.c.rooms.cove) / 3),
          );
          p.review.push("Confirm availability for the explicitly requested prorated room extension.");
        } else {
          this.line(
            p,
            "Explicitly requested extra room hour",
            Math.ceil(extraHours),
            this.c.rooms[room === "upper" ? "upper_extra" : "lower_extra"],
          );
        }
      } else if (d.minutes > 180) {
        p.review.push(
          "Private space is priced for three hours. Confirm whether any room extension is actually requested; no extension has been added automatically.",
        );
      }
    }
    if (sel.includes("axe")) {
      p.review.push(
        "Axe eligibility: regular weekdays 10+, weekends 16+; private axe 10+; check actual participants.",
      );
    }
    if (sel.includes("climbing")) {
      p.review.push("Climbing participants must weigh at least 40 lbs.");
    }
    if (sel.includes("laser")) {
      p.review.push(
        "Laser tag age 4+; play is unscheduled, with no guaranteed number of turns for access passes.",
      );
    }
    if (sel.includes("golf")) {
      p.review.push("Confirm outdoor mini golf availability and weather.");
    }
    if (w === 1 && sel.includes("bowling") && p.bowl_mode === "regular") {
      p.review.push(
        "Monday regular bowling rate is not published; do not treat this reference estimate as a Monday quote.",
      );
    }
    if (d.comments !== "") {
      p.review.push("Review the customer’s special requests before final approval.");
    }
    const breakfastRequested =
      menu !== "none" && phpStrToLower(`${d.description} ${d.comments}`).includes("breakfast");
    if (breakfastRequested) {
      p.review.push(
        "Breakfast Bar has been removed. Any alternative food shown is provisional and requires staff discussion; no breakfast is quoted.",
      );
    }
    const emptyScope = sel.length === 0 && menu === "none" && d.private_room === "no";
    if (emptyScope) {
      p.unpriced = true;
    }
    if (emptyScope) {
      p.review.push(
        "No attraction, dining or private space was requested. Staff follow-up is required before quoting an event.",
      );
    }
    p.selected_attractions = sel;
    const itinerary = this.schedule(p, d, date);
    p.itinerary = itinerary;
    let rentalConflict = false;
    const windows: ["private_bowl_window" | "private_axe_window", string[]][] = [
      ["private_bowl_window", ["Bowling"]],
      ["private_axe_window", ["Axe Check-In & Safety Briefing", "Axe Throwing"]],
    ];
    for (const [key, labels] of windows) {
      const windowMinutes = p[key];
      if (!windowMinutes) {
        continue;
      }
      const blocks = itinerary.filter((r) => labels.includes(r.label));
      if (blocks.length > 0) {
        const span =
          Math.max(...blocks.map((r) => r.end_minute)) -
          Math.min(...blocks.map((r) => r.start_minute));
        if (span > windowMinutes) {
          rentalConflict = true;
          p.review.push(
            "The cohort schedule exceeds the published private rental window; a different configuration or staff-approved extension is needed.",
          );
        }
      }
    }
    if (sel.includes("bowling") && n > 48) {
      p.notes.push(
        "Large-group rotation uses lane 1’s approved up-to-10 capacity to allow 50-person bowling cohorts. Verify lane 1 availability.",
      );
    }
    p.per_guest_cents = phpRound(p.total_cents / n);
    const requiredMinutes = p.required_minutes ?? 0;
    p.fits_duration = requiredMinutes <= d.minutes;
    if (!p.fits_duration) {
      p.review.push(
        `This plan needs ${requiredMinutes} minutes; requested event is ${d.minutes} minutes. Do not shorten purchased play time.`,
      );
    }
    const shorterThanRequested =
      o.axe_minutes != null && p.axe_minutes > 0 && p.axe_minutes < phpInt(o.axe_minutes);
    if (shorterThanRequested) {
      p.review.push("This shorter alternative does not provide the explicitly requested axe duration.");
    }
    const shorterBowling =
      o.bowling_hours != null &&
      p.bowling_minutes > 0 &&
      p.bowling_minutes < phpFloat(o.bowling_hours) * 60;
    if (shorterBowling) {
      p.review.push(
        "This shorter alternative does not provide the explicitly requested bowling duration.",
      );
    }
    const missingRental =
      o.rental != null &&
      RENTAL_KINDS.includes(o.rental) &&
      !(p.rental_kinds ?? []).includes(o.rental as RentalKind);
    if (missingRental) {
      p.review.push(
        "This configuration does not provide the explicitly requested private attraction rental. Resolve the request before quoting; exclusions remain in force.",
      );
    }
    if ((p.rental_kinds ?? []).includes("mezzanine") && d.private_room === "yes" && n > 44) {
      p.review.push(
        "Included Skybox seats 44; confirm the actual gathering/seating arrangement for the larger event.",
      );
    }
    p.hard_review =
      (n < 15 && (menu === "fajita" || menu === "slider" || menu === "bbq")) ||
      (n > 150 && d.private_room === "yes" && !p.room_included) ||
      shorterThanRequested ||
      shorterBowling ||
      breakfastRequested ||
      emptyScope ||
      rentalConflict ||
      missingRental ||
      Boolean(p.missing_leisure_time);
    p.budget_over_cents = d.budget === null ? 0 : Math.max(0, p.total_cents - d.budget);
    return p as Plan;
  }

  private wingType(d: ValidatedInquiry, o: RecommendOptions): WingType {
    if (o.wing_type === "boneless" || o.wing_type === "traditional") {
      return o.wing_type;
    }
    const text = phpStrToLower(`${d.description} ${d.comments}`);
    return /\btraditional\s+wings\b/.test(text) &&
      !/\b(?:no|not|without)\s+traditional\s+wings\b/.test(text)
      ? "traditional"
      : "boneless";
  }

  private schedule(p: Working, d: ValidatedInquiry, date: string): ItineraryRow[] {
    const rows: ItineraryRow[] = [];
    const n = d.guests;
    const offset = p.dining_minutes ?? 0;
    const add = (start: number, end: number, label: string, cohort = "All guests"): void => {
      rows.push({ start_minute: start, end_minute: end, label, group: cohort });
    };
    const selected = p.selected_attractions ?? [];
    if (offset) {
      add(0, offset, "Dining");
    }
    const b = p.bowling_minutes;
    const a = p.axe_minutes;
    let last = offset;
    if (b && a) {
      const groups = Math.ceil(n / 50);
      const resource: Record<"b" | "a", number> = { b: offset, a: offset };
      const jobs: ScheduleJob[] = [];
      for (let i = 0; i < groups; i += 1) {
        jobs.push({
          id: i,
          n: Math.min(50, n - i * 50),
          order: i % 2 === 0 ? ["b", "a"] : ["a", "b"],
          step: 0,
          ready: offset,
        });
      }
      for (let step = 0; step < groups * 2; step += 1) {
        let pick = -1;
        let time = PHP_INT_MAX_LIKE;
        for (let j = 0; j < jobs.length; j += 1) {
          const candidate = jobs[j] as ScheduleJob;
          if (candidate.step >= 2) {
            continue;
          }
          const candidateOp = candidate.order[candidate.step] as "b" | "a";
          const prep = candidateOp === "b" && candidate.step > 0 ? 5 : 0;
          const start = Math.max(candidate.ready + prep, resource[candidateOp]);
          if (start < time) {
            time = start;
            pick = j;
          }
        }
        if (pick < 0) {
          break;
        }
        const job = jobs[pick] as ScheduleJob;
        const op = job.order[job.step] as "b" | "a";
        const label = `Group ${String.fromCharCode(65 + job.id)} — ${job.n} guests`;
        let end: number;
        if (op === "b") {
          const prepEnd = offset > 0 && job.step === 0 ? 0 : time;
          add(prepEnd - 5, prepEnd, "Bowling check-in & shoes", label);
          add(time, time + b, "Bowling", label);
          end = time + b;
        } else {
          add(time, time + 15, "Axe Check-In & Safety Briefing", label);
          add(time + 15, time + 15 + a, "Axe Throwing", label);
          end = time + 15 + a;
        }
        resource[op] = end;
        job.ready = end;
        job.step += 1;
        last = Math.max(last, end);
      }
    } else if (b) {
      for (let i = 0; i < Math.ceil(n / 50); i += 1) {
        const label = `Group ${i + 1} — ${Math.min(50, n - i * 50)} guests`;
        const start = offset + i * b;
        const prepEnd = offset > 0 ? 0 : start;
        add(prepEnd - 5, prepEnd, "Bowling check-in & shoes", label);
        add(start, start + b, "Bowling", label);
        last = start + b;
      }
    } else if (a) {
      for (let i = 0; i < Math.ceil(n / 56); i += 1) {
        const label = `Group ${i + 1} — ${Math.min(56, n - i * 56)} guests`;
        add(last, last + 15, "Axe Check-In & Safety Briefing", label);
        add(last + 15, last + 15 + a, "Axe Throwing", label);
        last += 15 + a;
      }
    }
    const flex = (["laser", "golf", "climbing", "arcade"] as const).filter((k) =>
      selected.includes(k),
    );
    const names = flex.map((k) => ATTRACTIONS[k]);
    if (p.access_minutes) {
      const accessStart = last;
      last += p.access_minutes;
      add(accessStart, last, p.access_label ?? "Laser tag at leisure — access window");
      const excluded: AttractionKey[] = p.covers_climbing ? ["laser", "climbing"] : ["laser"];
      const otherFlex = flex.filter((k) => !excluded.includes(k));
      if (otherFlex.length > 0) {
        const otherNames = otherFlex.map((k) => ATTRACTIONS[k]);
        add(accessStart, last, `Enjoy ${otherNames.join(", ")} at leisure during this window`);
      }
    } else if (flex.length > 0) {
      const end = Math.max(d.minutes, p.rental_minutes ?? 0);
      if (end > last) {
        add(last, end, `Enjoy ${names.join(", ")} at leisure`);
      } else {
        // A rotation may leave different free windows for each cohort.
        const groups = new Map<string, ItineraryRow[]>();
        for (const row of rows) {
          if (row.group !== "All guests") {
            const list = groups.get(row.group);
            if (list) {
              list.push(row);
            } else {
              groups.set(row.group, [row]);
            }
          }
        }
        let allHaveFree = groups.size > 0;
        for (const [group, blocks] of groups) {
          blocks.sort((x, y) => x.start_minute - y.start_minute);
          let cursor = offset;
          let free = false;
          for (const block of blocks) {
            const s = Math.max(0, block.start_minute);
            if (s > cursor && cursor < end) {
              add(cursor, Math.min(s, end), `Enjoy ${names.join(", ")} at leisure`, group);
              free = true;
            }
            cursor = Math.max(cursor, block.end_minute);
          }
          if (end > cursor) {
            add(cursor, end, `Enjoy ${names.join(", ")} at leisure`, group);
            free = true;
          }
          if (!free) {
            allHaveFree = false;
          }
        }
        if (!allHaveFree) {
          p.missing_leisure_time = true;
          p.review.push(
            "No leisure window remains for every participant. Add event time or revise fixed activities before including the requested flexible play.",
          );
        }
      }
    }
    // Account for the requested window without inventing paid activity or space.
    let coveredEnd = last;
    if (flex.length > 0 && !p.access_minutes && rows.length > 0) {
      coveredEnd = Math.max(coveredEnd, Math.max(...rows.map((r) => r.end_minute)));
    }
    p.unallocated_minutes = Math.max(0, d.minutes - coveredEnd);
    p.duration_review = p.unallocated_minutes > 15;
    if (p.unallocated_minutes > 0) {
      if (p.duration_review) {
        add(coveredEnd, d.minutes, "Unallocated event time — staff to resolve");
        p.review.push(
          `${p.unallocated_minutes} minutes of the requested event have no planned activity or dining. Resolve before presenting this as a full-length event; no extra attraction or seating is promised.`,
        );
      } else {
        add(coveredEnd, d.minutes, "Event wrap-up / departure");
      }
    }
    if (!offset && d.food === "yes") {
      p.notes.push(
        "Pizza, wings and drinks may be enjoyed at the bowling lanes for this group of 25 or fewer.",
      );
    }
    p.required_minutes = Math.max(last, p.rental_minutes ?? 0);
    rows.sort((x, y) => x.start_minute - y.start_minute);
    const startUtc = scheduleStartUtcMs(date, d.time);
    for (const row of rows) {
      row.start = formatClock(startUtc + row.start_minute * 60000);
      row.end = formatClock(startUtc + row.end_minute * 60000);
    }
    return rows;
  }

  private candidates(
    d: ValidatedInquiry,
    sel: AttractionKey[],
    o: RecommendOptions,
    date: string,
  ): Plan[] {
    const n = d.guests;
    const w = this.weekday(date);
    const peak = (w === 5 || w === 6) && d.time >= "16:00";
    const discount = w === 3 ? 0.5 : 1;
    const menu = this.foodPath(d, o);
    const bowls: PlanDraft[] = [];
    const axes: PlanDraft[] = [];
    const flex: PlanDraft[] = [];
    const b = sel.includes("bowling");
    const a = sel.includes("axe");
    const laser = sel.includes("laser");
    const arcade = sel.includes("arcade");
    const requestedBowlingHours = o.bowling_hours != null ? phpFloat(o.bowling_hours) : null;
    const bh =
      requestedBowlingHours !== null && [0.5, 1.0, 2.0].includes(requestedBowlingHours)
        ? requestedBowlingHours
        : 1.0;
    const requestedAxe = o.axe_minutes != null ? phpInt(o.axe_minutes) : null;
    const am = requestedAxe !== null && [30, 60].includes(requestedAxe) ? requestedAxe : b ? 30 : 60;
    if (b) {
      for (const playHours of unique([bh, 0.5])) {
        const short = playHours < bh ? 1 : 0;
        const half = playHours === 0.5;
        let x = this.product(half ? "30-minute bowling" : "Regular bowling", short);
        x.alternative_only = Boolean(short);
        x.bowl_mode = "regular";
        x.bowling_minutes = phpRound(playHours * 60);
        const rate =
          this.c.bowling[
            half
              ? w <= 4
                ? "half_weekday"
                : "half_weekend"
              : w <= 4
                ? "hour_weekday"
                : "hour_weekend"
          ];
        this.line(
          x,
          half ? "Bowling lane — 30 minutes" : "Bowling lane-hour",
          WpParityEngine.lanes(n) * (half ? 1 : playHours),
          phpRound(rate * discount),
        );
        this.line(x, "Bowling shoes", n, this.c.bowling.shoes);
        if (w !== 1) {
          bowls.push(x);
        }
        const hours = Math.max(1, Math.ceil(Math.ceil(n / 50) * playHours));
        if (hours <= 2) {
          x = this.product(short ? "Private bowling — shorter play" : "Private bowling buyout", short);
          x.alternative_only = Boolean(short);
          x.bowling_minutes = phpRound(playHours * 60);
          x.private_activities = true;
          x.rental_minutes = hours * 60;
          x.private_bowl_window = hours * 60;
          x.rental_kind = "bowling";
          this.line(
            x,
            `${hours}-hour private bowling rental — shoes included`,
            1,
            this.c.bowling[hours === 1 ? "exclusive_hour" : peak ? "exclusive_peak" : "exclusive_two"],
          );
          bowls.push(x);
        }
      }
      if ((menu === "pizza" || menu === "pizza_wings") && bh === 1) {
        const x = this.product("Pizza & Pins");
        x.bowling_minutes = 60;
        x.included_combos = Math.ceil(n / 6);
        x.included_credit_cents = x.included_combos * 2500;
        this.line(
          x,
          "Pizza & Pins — up to 6 per package",
          x.included_combos,
          this.c.bowling.pins,
          true,
          0.2,
        );
        x.notes.push(
          "Each package includes one pizza, one pitcher, shoes and one issued $25 play card; credit can be distributed.",
        );
        bowls.push(x);
      }
    } else {
      bowls.push(this.product(""));
    }
    if (a) {
      for (const minutes of unique([am, 30])) {
        const x = this.product(`${minutes === 60 ? "1-hour" : "30-minute"} axe`, minutes < am ? 1 : 0);
        x.alternative_only = minutes < am;
        x.axe_minutes = minutes;
        const count = w === 4 ? Math.ceil(n / 2) : n;
        this.line(
          x,
          `Axe throwing — ${minutes} minutes${w === 4 ? " (2-for-1)" : ""}`,
          count,
          phpRound(this.c.axe[minutes === 30 ? "half" : "hour"] * discount),
        );
        axes.push(x);
      }
      if (sel.some((k) => k === "laser" || k === "golf" || k === "climbing" || k === "arcade")) {
        const x = this.product("AxeTreme");
        x.axe_minutes = 60;
        x.included_credit_cents = n * 2000;
        this.line(x, "AxeTreme — 1 hour axe + $20 play card", n, this.c.axe.xtreme);
        axes.push(x);
      }
      if (Math.ceil(n / (b ? 50 : 56)) * (am + 15) <= 120) {
        const x = this.product("Private Axe Den");
        x.axe_minutes = am;
        x.rental_minutes = 120;
        x.private_axe_window = 120;
        x.rental_kind = "axe";
        x.private_activities = true;
        this.line(x, "Private Axe Den — 2 hours", 1, this.c.axe[w === 6 ? "private_sat" : "private"]);
        x.notes.push(
          "Two-hour private rental access; proposed rotations protect the desired throwing time per participant. Confirm rental/briefing arrangements with staff.",
        );
        axes.push(x);
      }
    } else {
      axes.push(this.product(""));
    }
    if (laser) {
      const single = o.laser_mode === "single";
      let x = this.product("Laser tag games", single ? 0 : 1);
      x.deferred_play = {
        "Laser tag — one game per guest": phpRound(n * this.c.laser.game * discount),
      };
      flex.push(x);
      x = this.product(w === 4 ? "Thursday laser special" : "90-Minute Laser Tag Pass", single ? 1 : 0);
      this.line(x, x.name, n, this.c.laser[w === 4 ? "thursday" : "pass"]);
      if (w !== 4) {
        x.access_minutes = 90;
      }
      flex.push(x);
      x = this.product("Private laser tag buyout", single ? 1 : 0);
      x.rental_kind = "laser";
      x.private_activities = true;
      x.access_minutes = w === 6 ? 60 : 90;
      x.access_label = `Private laser tag at leisure — ${x.access_minutes}-minute rental`;
      this.line(
        x,
        `Private laser tag — ${x.access_minutes} minutes`,
        1,
        this.c.laser[w === 6 ? "private_sat" : "private"],
      );
      flex.push(x);
      if (arcade) {
        x = this.product("LaserPlex", 1);
        x.included_credit_cents = n * 1500;
        x.arcade_target = 1500;
        this.line(x, "LaserPlex — 1 laser game + $15 arcade", n, this.c.laser.plex);
        flex.push(x);
        x = this.product("Laser Tag & Games");
        x.included_credit_cents = n * 3000;
        x.arcade_target = 3000;
        this.line(x, "Laser Tag & Games — 2 games + $30 play card", n, this.c.laser.games);
        flex.push(x);
        x = this.product("Laser + arcade purchased separately");
        x.arcade_target = 3000;
        x.deferred_play = {
          "Laser tag — 2 games per guest": phpRound(n * 2 * this.c.laser.game * discount),
        };
        flex.push(x);
        x = this.product("One laser game + $15 arcade separately", 1);
        x.arcade_target = 1500;
        x.deferred_play = {
          "Laser tag — 1 game per guest": phpRound(n * this.c.laser.game * discount),
        };
        flex.push(x);
      }
      if (sel.includes("climbing") && d.children > 0) {
        x = this.product(
          `Adventure Blast Pass${d.adults ? " for children + separate adult access" : ""}`,
        );
        x.included_credit_cents = d.children * 1500;
        x.child_credit_only = true;
        x.arcade_target = 1500;
        x.covers_climbing = d.adults === 0;
        x.climb_count = d.adults;
        x.access_minutes = 90;
        x.access_label = "Laser tag and climbing at leisure — 90-minute access";
        x.notes.push(
          "Only children receive Blast wristbands and $15 arcade credit. Adults priced separately. No seating is promised.",
        );
        this.line(x, "Adventure Blast child wristband", d.children, this.c.laser.blast);
        if (d.adults) {
          this.line(
            x,
            w === 4 ? "Adult Thursday laser special" : "Adult 90-Minute Laser Tag Pass",
            d.adults,
            this.c.laser[w === 4 ? "thursday" : "pass"],
          );
        }
        flex.push(x);
      }
      if (arcade) {
        for (const f of flex) {
          if (f.arcade_target === undefined) {
            f.arcade_target = 3000;
          }
        }
      }
    } else {
      flex.push(this.product(""));
    }
    const out: Plan[] = [];
    for (const bo of bowls) {
      for (const ax of axes) {
        for (const fl of flex) {
          const p = this.merge([bo, ax, fl]);
          if (d.private_room === "yes") {
            p.notes.push("Private gathering space is separate from attraction exclusivity.");
          }
          out.push(this.complete(p, d, sel, o, menu, date));
        }
      }
    }
    if (b && a && bh === 1) {
      for (const fl of flex) {
        const x = this.product("All-Access");
        x.bowling_minutes = 60;
        x.axe_minutes = 60;
        x.included_credit_cents = n * 2000;
        this.line(x, "All-Access — bowling, shoes, axe, $20 card", n, this.c.bowling.all_access);
        out.push(this.complete(this.merge([x, fl]), d, sel, o, menu, date));
      }
    }
    if (n <= 125 && b && a && (n >= 50 || o.rental === "mezzanine")) {
      for (const mins of [180, 120]) {
        if (mins === 120 && w !== 5 && w !== 6) {
          continue;
        }
        const x = this.product(`Mezzanine buyout — ${mins / 60} hours`);
        x.rental_kind = "mezzanine";
        x.bowling_minutes = bh * 60;
        x.bowling_minutes_is_php_float = true;
        x.axe_minutes = am;
        x.room_included = true;
        x.rental_minutes = mins;
        x.private_activities = true;
        const price =
          this.c.mezzanine[
            mins === 120
              ? "two"
              : w === 6
                ? d.time >= "16:00"
                  ? "sat_after"
                  : "sat_before"
                : w === 5
                  ? "fri"
                  : "sun_thu"
          ];
        this.line(x, x.name, 1, price);
        for (const fl of flex) {
          out.push(this.complete(this.merge([x, fl]), d, sel, o, menu, date));
        }
      }
    }
    if (n > 125 || o.rental === "full" || (d.private_room === "yes" && sel.length >= 3)) {
      const x = this.product("Full Facility — 3 hours");
      x.room_included = true;
      x.rental_minutes = 180;
      x.private_activities = true;
      x.rental_kind = "full";
      x.rental_kinds = ["full"];
      x.bowling_minutes = b ? bh * 60 : 0;
      if (b) {
        x.bowling_minutes_is_php_float = true;
      }
      x.axe_minutes = a ? am : 0;
      x.covers_climbing = true;
      x.covers_golf = true;
      x.covers_arcade = true;
      const price =
        this.c.facility[
          w === 6
            ? d.time >= "16:00"
              ? "sat_after"
              : "sat_before"
            : d.time >= "16:00"
              ? w === 5
                ? "fri_after"
                : "sun_thu_after"
              : "before"
        ];
      this.line(x, "Full Facility rental — food and drinks extra", 1, price);
      x.notes.push(
        "Facility attraction access included; only selected attractions are proposed. Food/drink cards are extra.",
      );
      const p = this.complete(x, d, sel, o, menu, date);
      p.review.push(
        "Verify distributed attraction access and seating for this large group; no guaranteed play cycles.",
      );
      out.push(p);
    }
    for (const p of this.customCandidates(d, sel, o, menu, date, bowls, axes, flex)) {
      out.push(p);
    }
    if (out.length === 0) {
      const p: Working = this.product("Staff quote required");
      p.unpriced = true;
      p.dining_minutes = 0;
      p.selected_attractions = sel;
      p.itinerary = [];
      p.required_minutes = 0;
      p.fits_duration = false;
      p.hard_review = true;
      p.per_guest_cents = 0;
      p.budget_over_cents = 0;
      p.review.push(
        "No fully priced eligible configuration is available for these parameters. Staff must prepare the quote; no missing rate has been invented.",
      );
      out.push(p as Plan);
    }
    return out;
  }

  private customCandidates(
    d: ValidatedInquiry,
    sel: AttractionKey[],
    o: RecommendOptions,
    menu: MenuPath,
    date: string,
    bowls: PlanDraft[],
    axes: PlanDraft[],
    flex: PlanDraft[],
  ): Plan[] {
    const out: Plan[] = [];
    const n = d.guests;
    for (const def of this.packages) {
      if (!isPackageEligible(def, d, sel, o, menu, date)) {
        continue;
      }
      const units = def.basis === "person" ? n : Math.ceil(n / def.size);
      const laser = Boolean(def.laser_games || def.laser_access);
      const tier = laser && def.laser_games === 1 && o.laser_mode !== "single" ? 1 : 0;
      const x = this.product(def.name, tier);
      x.bowling_minutes = def.bowling;
      x.axe_minutes = def.axe;
      x.access_minutes = def.laser_access;
      x.covers_golf = def.golf;
      x.covers_climbing = def.climbs > 0;
      x.included_credit_cents = units * def.credit;
      const includedFood: Record<string, number> = {};
      x.included_food = includedFood;
      this.line(
        x,
        `Custom package — ${def.name}`,
        units,
        def.price,
        def.food_amount > 0,
        def.price > 0 ? def.food_amount / def.price : 0,
      );
      const labels = foodLabels();
      for (const key of packageFoodKeys()) {
        const perUnit = packageFoodQuantity(def, key);
        if (perUnit) {
          includedFood[key] = units * perUnit;
          x.notes.push(`${includedFood[key]} included ${labels[key]}.`);
          if (!["combo", "boneless", "traditional", "pitcher"].includes(key)) {
            x.separate_package_dining = true;
          }
        }
      }
      if (def.bar !== "none") {
        includedFood[def.bar] = n;
        x.separate_package_dining = true;
        x.notes.push(
          `Included ${def.bar} catering bar for all ${n} participants; pitchers as specified separately.`,
        );
      }
      if (def.bowling && !def.shoes) {
        this.line(x, "Bowling shoes", n, this.c.bowling.shoes);
      }
      if (def.bowling && def.shoes) {
        x.notes.push("Bowling shoes included for all participants.");
      }
      if (def.laser_games) {
        x.notes.push(
          `${def.laser_games} laser game(s) per guest included; play at leisure, no fixed cycles.`,
        );
      }
      if (def.climbs) {
        x.notes.push(`${def.climbs} climb(s) per participant included; play at leisure.`);
      }
      if (def.arcade) {
        x.arcade_target = Math.max(1000, Math.ceil(x.included_credit_cents / n));
      }
      if (def.room !== "none") {
        x.room_included = true;
        const roomName = { lower: "Lower Event Room", upper: "Skybox", cove: "Climbers Cove" }[
          def.room
        ];
        x.notes.push(`${roomName} included for ${def.room_minutes} minutes, subject to availability.`);
      }
      if (def.minimum_age) {
        x.review.push(
          `Custom package minimum age ${def.minimum_age}; verify actual participants in addition to venue attraction age rules.`,
        );
      }
      if (def.notes !== "") {
        x.review.push(`Package notes: ${def.notes}`);
      }
      x.custom_package = {
        id: def.id,
        revision: packageDefinitionRevision(def),
        definition: def,
      };
      const bs = def.bowling ? [this.product("")] : bowls;
      const as = def.axe ? [this.product("")] : axes;
      const fs = laser ? [this.product("")] : flex;
      for (const bo of bs) {
        for (const ax of as) {
          for (const fl of fs) {
            // A child-restricted pool cannot absorb unrestricted custom credit.
            if (def.credit > 0 && fl.child_credit_only) {
              continue;
            }
            out.push(this.complete(this.merge([x, bo, ax, fl]), d, sel, o, menu, date));
          }
        }
      }
    }
    return out;
  }

  /**
   * Parity-test seam: PHP tests reach `Engine::candidates` through `ReflectionMethod`. This wraps
   * the private method so TypeScript parity suites can inspect every candidate (including custom
   * packages) without going through `recommend()` ranking. Not used by production code.
   */
  candidatesForTest(
    d: ValidatedInquiry,
    sel: AttractionKey[],
    options: RecommendOptions,
    date: string,
  ): Plan[] {
    return this.candidates(d, sel, options, date);
  }

  /**
   * Parity-test seam for PHP `Engine::arcade_lines` (called via `ReflectionMethod` in
   * `arcade-allocation-test.php`). Mutates and returns `plan` like the PHP by-reference call.
   */
  arcadeLinesForTest(
    plan: PlanDraft,
    d: ValidatedInquiry,
    target: number,
    applied: number,
  ): PlanDraft {
    this.arcadeLines(plan, d, target, applied);
    return plan;
  }

  private merge(parts: PlanDraft[]): PlanDraft {
    const p = this.product("");
    const rentalKinds: RentalKind[] = [];
    p.rental_kinds = rentalKinds;
    p.rental_minutes = 0;
    const names: string[] = [];
    let bowlingFloat = false;
    for (const x of parts) {
      if (x.rental_kind !== undefined) {
        rentalKinds.push(x.rental_kind);
      }
      if (x.name !== "") {
        names.push(x.name);
      }
      p.subtotal_cents += x.subtotal_cents;
      p.tax_cents += x.tax_cents;
      p.total_cents += x.total_cents;
      p.included_credit_cents += x.included_credit_cents;
      p.included_combos += x.included_combos;
      p.items = p.items.concat(x.items);
      p.notes = p.notes.concat(x.notes);
      p.review = p.review.concat(x.review);
      p.tier = Math.max(p.tier, x.tier);
      if (x.bowling_minutes > p.bowling_minutes) {
        p.bowling_minutes = x.bowling_minutes;
        bowlingFloat = Boolean(x.bowling_minutes_is_php_float);
      }
      p.axe_minutes = Math.max(p.axe_minutes, x.axe_minutes);
      p.access_minutes = Math.max(p.access_minutes, x.access_minutes);
      p.rental_minutes = Math.max(p.rental_minutes ?? 0, x.rental_minutes ?? 0);
      p.room_included = p.room_included || x.room_included;
      p.private_activities = p.private_activities || x.private_activities;
      p.covers_climbing = Boolean(p.covers_climbing) || Boolean(x.covers_climbing);
      p.covers_golf = Boolean(p.covers_golf) || Boolean(x.covers_golf);
      p.covers_arcade = Boolean(p.covers_arcade) || Boolean(x.covers_arcade);
      p.alternative_only = Boolean(p.alternative_only) || Boolean(x.alternative_only);
      p.separate_package_dining =
        Boolean(p.separate_package_dining) || Boolean(x.separate_package_dining);
      if (x.arcade_target !== undefined) p.arcade_target = x.arcade_target;
      if (x.access_label !== undefined) p.access_label = x.access_label;
      if (x.bowl_mode !== undefined) p.bowl_mode = x.bowl_mode;
      if (x.climb_count !== undefined) p.climb_count = x.climb_count;
      if (x.private_bowl_window !== undefined) p.private_bowl_window = x.private_bowl_window;
      if (x.private_axe_window !== undefined) p.private_axe_window = x.private_axe_window;
      if (x.child_credit_only !== undefined) p.child_credit_only = x.child_credit_only;
      if (x.deferred_play !== undefined) p.deferred_play = { ...x.deferred_play };
      if (x.rental_kind !== undefined) p.rental_kind = x.rental_kind;
      if (x.included_food !== undefined) p.included_food = { ...x.included_food };
      if (x.custom_package !== undefined) p.custom_package = x.custom_package;
    }
    if (bowlingFloat) {
      p.bowling_minutes_is_php_float = true;
    }
    p.name = names.join(" + ") || "Gathering and catering";
    return p;
  }

  recommend(data: InquiryRaw, options: RecommendOptions = {}): RecommendResult {
    // Always revalidate; callers cannot bypass required-field validation.
    const raw: InquiryRaw = { ...data };
    if (
      typeof data.budget === "number" &&
      Number.isInteger(data.budget) &&
      data.guests != null
    ) {
      raw.budget = data.budget / 100;
    }
    const v = this.validate(raw);
    if (!v.valid) {
      return { valid: false, errors: v.errors };
    }
    const d = v.data;
    const results: DayRecommendation[] = [];
    const required: AttractionKey[] = [];
    const open: AttractionKey[] = [];
    for (const k of ATTRACTION_KEYS) {
      const answer = d.attractions[k];
      if (answer === "yes") {
        required.push(k);
      } else if (answer === "open") {
        open.push(k);
      }
    }
    const preferred: AttractionKey[] =
      d.children > 0 ? ["laser", "climbing", "arcade"] : ["bowling", "axe"];
    let target = open.filter((k) => preferred.includes(k));
    if (required.length === 0 && target.length === 0 && open.length > 0) {
      target = [open[0] as AttractionKey];
    }
    const sets: AttractionKey[][] = [required];
    for (const suggestion of open) {
      sets.push(unique([...required, suggestion]));
    }
    if (target.length > 0) {
      sets.push(unique([...required, ...target]));
    }
    for (const k of target) {
      sets.push(unique([...required, k]));
    }
    const uniqueSets = new Map<string, AttractionKey[]>();
    for (const s of sets) {
      const sorted = [...s].sort();
      uniqueSets.set(sorted.join(","), sorted);
    }
    for (const date of d.dates) {
      const all: RankedPlan[] = [];
      for (const s of uniqueSets.values()) {
        const plans = this.candidates(d, s, options, date);
        if (s.includes("bowling") && options.bowling_hours == null && d.minutes >= 120) {
          const long: RecommendOptions = { ...options, bowling_hours: 2 };
          for (const extra of this.candidates(d, s, long, date)) {
            if (extra.bowling_minutes === 120 && !extra.bowling_minutes_is_php_float) {
              extra.notes.push(
                "Longer bowling is recommended to use the requested event time; its full price is included.",
              );
              plans.push(extra);
            }
          }
        }
        for (const p of plans) {
          all.push({
            ...p,
            suggested_attractions: s.filter((k) => !required.includes(k)),
            optional_fit: s.filter((k) => target.includes(k)).length,
          });
        }
      }
      const budget = d.budget;
      const fillBowling = required.includes("bowling") && options.bowling_hours == null;
      const score = (x: RankedPlan): number[] => [
        !x.fits_duration || x.hard_review ? 1 : 0,
        budget !== null && x.total_cents > budget ? 1 : 0,
        -x.optional_fit,
        fillBowling ? Math.max(0, (x.unallocated_minutes ?? 0) - 15) : 0,
        x.tier,
        x.total_cents,
      ];
      all.sort((x, y) => compareScore(score(x), score(y)));
      let mainSource = all[0] as RankedPlan;
      for (const candidate of all) {
        if (!candidate.alternative_only) {
          mainSource = candidate;
          break;
        }
      }
      const main: RankedPlan = { ...mainSource };
      const seen = new Set<string>([`${main.name}-${main.total_cents}`]);
      const alts: RankedPlan[] = [];
      // Include a shorter/lower-price alternative, then useful different configurations.
      const cheap = [...all];
      cheap.sort((x, y) =>
        compareScore(
          [x.hard_review ? 1 : 0, x.fits_duration ? 0 : 1, x.total_cents],
          [y.hard_review ? 1 : 0, y.fits_duration ? 0 : 1, y.total_cents],
        ),
      );
      for (const p of [...cheap, ...all]) {
        const key = `${p.name}-${p.total_cents}`;
        if (seen.has(key) || alts.length >= 3) {
          continue;
        }
        seen.add(key);
        alts.push(p);
      }
      main.why =
        main.hard_review || !main.fits_duration || main.duration_review
          ? "Planning hold: resolve the flagged requirements before quoting this configuration."
          : main.tier === 0
            ? "Fits the selected attractions and the preferred experience; compared with eligible packages, specials and rentals."
            : "Lower-cost or shorter experience selected to fit the requested time or budget.";
      results.push({ date, recommendation: main, alternatives: alts });
    }
    return {
      valid: true,
      rules_version: WP_CATALOG_VERSION,
      pricing_revision: wpCatalogRevision(this.c),
      inquiry: d,
      dates: results,
      status:
        "Proposed internal recommendation — availability and eligibility require staff confirmation",
    };
  }
}
