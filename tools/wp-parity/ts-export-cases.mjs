#!/usr/bin/env node
/**
 * Export TS engine recommendations for the same fixtures as the PHP harness.
 * Invoked by php-compare.mjs when PHP is available, or standalone for debugging.
 */
import { pathToFileURL } from "node:url";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../..");

// Load TS via tsx if available
async function loadEngine() {
  try {
    const { register: registerTsx } = await import("tsx/esm/api");
    registerTsx();
  } catch {
    // fall through — vitest/tsx may already transpile when run via pnpm exec tsx
  }
  const mod = await import(
    pathToFileURL(join(repoRoot, "src/server/event-planner/wp-parity/index.ts")).href
  );
  return mod;
}

function summarize(r) {
  const p = r.dates[0].recommendation;
  return {
    total_cents: p.total_cents,
    subtotal_cents: p.subtotal_cents,
    tax_cents: p.tax_cents,
    name: p.name,
    dining_minutes: p.dining_minutes ?? null,
    required_minutes: p.required_minutes ?? null,
    axe_minutes: p.axe_minutes ?? null,
    fits_duration: p.fits_duration ?? null,
    hard_review: p.hard_review ?? null,
    selected_attractions: p.selected_attractions ?? [],
    rules_version: r.rules_version,
    pricing_revision: r.pricing_revision,
  };
}

function runCase(engine, sample, n, attractions, date = "2026-11-06", changes = {}, options = {}) {
  const s = structuredClone(sample);
  s.adults = n;
  for (const a of attractions) s.attractions[a] = "yes";
  s.dates = [date];
  const merged = { ...s, ...changes, attractions: { ...s.attractions, ...(changes.attractions || {}) } };
  const opts = { bowling_hours: 1, ...options };
  const r = engine.recommend(merged, opts);
  if (!r.valid) throw new Error(JSON.stringify(r));
  return r;
}

const { createWpParityEngine, sampleWpInquiry, wpCatalogRevision, wpCatalogDefaults } =
  await loadEngine();
const engine = createWpParityEngine();
const sample = sampleWpInquiry();

const cases = [
  { id: "bowling-6-fri", ts: summarize(runCase(engine, sample, 6, ["bowling"])) },
  { id: "bowling-7-fri", ts: summarize(runCase(engine, sample, 7, ["bowling"])) },
  { id: "bowling-6-tue", ts: summarize(runCase(engine, sample, 6, ["bowling"], "2026-11-03")) },
  { id: "bowling-6-wed", ts: summarize(runCase(engine, sample, 6, ["bowling"], "2026-11-04")) },
  { id: "bowl-axe-10", ts: summarize(runCase(engine, sample, 10, ["bowling", "axe"])) },
  { id: "axe-only-10", ts: summarize(runCase(engine, sample, 10, ["axe"])) },
  { id: "laser-8", ts: summarize(runCase(engine, sample, 8, ["laser"])) },
  { id: "laser-arcade-8", ts: summarize(runCase(engine, sample, 8, ["laser", "arcade"])) },
  {
    id: "blast-8-children",
    ts: summarize(
      runCase(engine, sample, 0, ["laser", "climbing", "arcade"], "2026-11-06", { children: 8 }),
    ),
  },
  {
    id: "golf-mixed",
    ts: summarize(runCase(engine, sample, 4, ["golf"], "2026-11-06", { children: 4 })),
  },
  {
    id: "fajita-15",
    ts: summarize(
      runCase(engine, sample, 15, [], "2026-11-06", { food: "yes" }, { menu: "fajita" }),
    ),
  },
  {
    id: "dining-25-pizza-wings",
    ts: summarize(
      runCase(
        engine,
        sample,
        25,
        ["bowling"],
        "2026-11-06",
        { food: "yes" },
        { menu: "pizza_wings" },
      ),
    ),
  },
  {
    id: "dining-26-pizza",
    ts: summarize(runCase(engine, sample, 26, ["bowling"], "2026-11-06", { food: "yes" })),
  },
  { id: "all-no", ts: summarize(runCase(engine, sample, 10, [])) },
  { id: "monday-no-regular", ts: summarize(runCase(engine, sample, 6, ["bowling"], "2026-11-02")) },
];

console.log(
  JSON.stringify(
    {
      catalog_version: cases[0]?.ts.rules_version,
      pricing_revision: wpCatalogRevision(wpCatalogDefaults()),
      cases,
    },
    null,
    2,
  ),
);
