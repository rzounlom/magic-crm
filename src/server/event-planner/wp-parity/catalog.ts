import { createHash } from "node:crypto";

/**
 * Port of Generations Event Planner 3.3.0 `includes/catalog.php`.
 *
 * IMPORTANT: every number in `wpCatalogDefaults()` is a PLUGIN DEFAULT shipped in the
 * WordPress plugin source. These are NOT verified live WordPress admin overrides
 * (`gapnext_price_overrides`) and NOT Production Neon catalog prices. Callers must
 * label any output derived from them as `pricing_source: "plugin_defaults"`.
 *
 * All money is integer cents.
 */
export const WP_CATALOG_VERSION = "2026-11-02";

export type WpCatalog = {
  bowling: {
    hour_weekday: number;
    hour_weekend: number;
    half_weekday: number;
    half_weekend: number;
    game_weekday: number;
    game_weekend: number;
    shoes: number;
    exclusive_hour: number;
    exclusive_two: number;
    exclusive_peak: number;
    pins: number;
    all_access: number;
  };
  axe: {
    half: number;
    hour: number;
    xtreme: number;
    private: number;
    private_sat: number;
  };
  laser: {
    game: number;
    pass: number;
    thursday: number;
    plex: number;
    games: number;
    blast: number;
    private: number;
    private_sat: number;
  };
  golf: { adult: number; child: number };
  climb: number;
  pitcher: number;
  drink_card: number;
  food: {
    combo: number;
    boneless: number;
    traditional: number;
    pretzels: number;
    strips: number;
    salad: number;
    boards: number;
    cookies: number;
    brownies: number;
    fajita: number;
    slider: number;
    bbq: number;
  };
  rooms: {
    lower: number;
    upper: number;
    cove: number;
    lower_extra: number;
    upper_extra: number;
  };
  mezzanine: {
    sun_thu: number;
    fri: number;
    sat_before: number;
    sat_after: number;
    two: number;
  };
  facility: {
    before: number;
    sat_before: number;
    sun_thu_after: number;
    fri_after: number;
    sat_after: number;
  };
};

/** Overrides use PHP field keys: `group.key` (e.g. `bowling.shoes`) or a top-level scalar (`climb`). */
export type WpCatalogOverrides = Readonly<Record<string, unknown>>;

/** `Catalog::defaults()` — plugin defaults, integer cents. Key order matters for the revision hash. */
export function wpCatalogDefaults(): WpCatalog {
  return {
    bowling: {
      hour_weekday: 3000,
      hour_weekend: 4000,
      half_weekday: 1750,
      half_weekend: 2500,
      game_weekday: 600,
      game_weekend: 800,
      shoes: 350,
      exclusive_hour: 52500,
      exclusive_two: 75000,
      exclusive_peak: 85000,
      pins: 4999,
      all_access: 5500,
    },
    axe: { half: 1750, hour: 3000, xtreme: 4500, private: 150000, private_sat: 199500 },
    laser: {
      game: 800,
      pass: 2500,
      thursday: 2000,
      plex: 2000,
      games: 3999,
      blast: 2999,
      private: 55000,
      private_sat: 59900,
    },
    golf: { adult: 1000, child: 800 },
    climb: 500,
    pitcher: 800,
    drink_card: 800,
    food: {
      combo: 2000,
      boneless: 3699,
      traditional: 3849,
      pretzels: 2699,
      strips: 4999,
      salad: 2499,
      boards: 18113,
      cookies: 2070,
      brownies: 4554,
      fajita: 2500,
      slider: 3000,
      bbq: 3500,
    },
    rooms: { lower: 15000, upper: 25000, cove: 65000, lower_extra: 7500, upper_extra: 9900 },
    mezzanine: { sun_thu: 275000, fri: 475000, sat_before: 549500, sat_after: 599500, two: 309500 },
    facility: {
      before: 549500,
      sat_before: 879500,
      sun_thu_after: 599500,
      fri_after: 979500,
      sat_after: 1079500,
    },
  };
}

/** Flat field keys (`Catalog::fields()` order == defaults order). */
export function wpCatalogFieldKeys(catalog: WpCatalog = wpCatalogDefaults()): string[] {
  const keys: string[] = [];
  for (const [group, values] of Object.entries(catalog)) {
    if (typeof values === "number") {
      keys.push(group);
    } else {
      for (const key of Object.keys(values as Record<string, number>)) {
        keys.push(`${group}.${key}`);
      }
    }
  }
  return keys;
}

/**
 * `Catalog::all()` override step. Only known monetary fields can be overridden;
 * values must be integers in [0, 1_000_000_000]. Returns a new catalog (never mutates).
 */
export function applyWpCatalogOverrides(
  overrides: WpCatalogOverrides,
  base: WpCatalog = wpCatalogDefaults(),
): WpCatalog {
  const prices: Record<string, number | Record<string, number>> = structuredClone(base) as Record<
    string,
    number | Record<string, number>
  >;
  for (const key of wpCatalogFieldKeys(base)) {
    const value = overrides[key];
    if (
      typeof value !== "number" ||
      !Number.isInteger(value) ||
      value < 0 ||
      value > 1_000_000_000
    ) {
      continue;
    }
    const parts = key.split(".");
    if (parts.length === 2) {
      const group = prices[parts[0] as string];
      if (group !== undefined && typeof group === "object") {
        group[parts[1] as string] = value;
      }
    } else {
      prices[key] = value;
    }
  }
  return prices as unknown as WpCatalog;
}

/** `Catalog::revision()` — first 12 hex of sha256(JSON of the effective catalog). */
export function wpCatalogRevision(catalog: WpCatalog): string {
  return createHash("sha256").update(JSON.stringify(catalog)).digest("hex").slice(0, 12);
}

/** PHP-style facade: `Catalog.VERSION`, `Catalog.defaults()`, `Catalog.applyOverrides()`, `Catalog.revision()`. */
export const Catalog = {
  VERSION: WP_CATALOG_VERSION,
  defaults: wpCatalogDefaults,
  applyOverrides: applyWpCatalogOverrides,
  revision: wpCatalogRevision,
} as const;
