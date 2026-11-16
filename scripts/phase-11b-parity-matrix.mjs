#!/usr/bin/env node
/**
 * Phase 11B synthetic PHP ↔ TypeScript parity matrix.
 * Compares lanes/group sizes and recommendation totals against the in-repo 3.5.0 plugin.
 *
 * Usage:
 *   PHP_BIN=./tmp/mamba-root/envs/php85/bin/php node scripts/phase-11b-parity-matrix.mjs
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const pluginRoot =
  process.env.WP_PLANNER_ROOT ||
  join(repoRoot, "planning/pluggin/3.5/generations-event-planner-next");
const phpBin =
  process.env.PHP_BIN ||
  [
    join(repoRoot, "tmp/mamba-root/envs/php85/bin/php"),
    "/opt/homebrew/opt/php/bin/php",
    "/usr/local/opt/php@8.3/bin/php",
  ].find((p) => existsSync(p));

if (!phpBin) {
  console.error("PHP_BIN not found");
  process.exit(2);
}
if (!existsSync(join(pluginRoot, "includes/engine.php"))) {
  console.error(`Plugin missing at ${pluginRoot}`);
  process.exit(2);
}

const guestCounts = [1, 10, 48, 49, 50, 51, 70, 80, 99, 100, 101];
const outDir = join(repoRoot, "tmp/wp-parity");
mkdirSync(outDir, { recursive: true });
const phpRunner = join(outDir, "phase-11b-matrix.php");
const pluginEsc = pluginRoot.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

writeFileSync(
  phpRunner,
  `<?php
require '${pluginEsc}/includes/catalog.php';
require '${pluginEsc}/includes/engine.php';
require '${pluginEsc}/includes/plugin.php';
use Generations\\PlannerNext\\Engine;
use Generations\\PlannerNext\\Plugin;

function run_case($n, $attractions, $date = '2026-11-06', $changes = [], $options = []) {
  $engine = new Engine();
  $s = Plugin::sample();
  $s['adults'] = $n;
  $s['children'] = 0;
  foreach ($attractions as $a) $s['attractions'][$a] = 'yes';
  $s['dates'] = [$date];
  $s = array_replace_recursive($s, $changes);
  $options = array_merge(['bowling_hours' => 1], $options);
  $r = $engine->recommend($s, $options);
  if (!$r['valid']) throw new Exception(json_encode($r));
  return $r;
}
function summarize($r) {
  $p = $r['dates'][0]['recommendation'];
  $alt = array_map(function ($a) {
    return ['name' => $a['name'], 'total_cents' => $a['total_cents']];
  }, $r['dates'][0]['alternatives'] ?? []);
  $itinerary = array_map(function ($row) {
    return [
      'label' => $row['label'] ?? null,
      'start' => $row['start'] ?? null,
      'end' => $row['end'] ?? null,
      'group' => $row['group'] ?? null,
      'note' => $row['note'] ?? null,
    ];
  }, $p['itinerary'] ?? []);
  return [
    'total_cents' => $p['total_cents'],
    'subtotal_cents' => $p['subtotal_cents'],
    'tax_cents' => $p['tax_cents'],
    'name' => $p['name'],
    'required_minutes' => $p['required_minutes'] ?? null,
    'dining_minutes' => $p['dining_minutes'] ?? null,
    'hard_review' => !empty($p['hard_review']),
    'review' => array_values($p['review'] ?? []),
    'selected_attractions' => array_values($p['selected_attractions'] ?? []),
    'lanes' => Engine::lanes(($r['inquiry']['guests'] ?? 0)),
    'groups' => Engine::group_sizes(($r['inquiry']['guests'] ?? 0), 50),
    'alternatives' => $alt,
    'itinerary' => $itinerary,
  ];
}

$guest_counts = [1,10,48,49,50,51,70,80,99,100,101];
$cases = [];
foreach ($guest_counts as $n) {
  $cases["bowling-only-$n"] = summarize(run_case($n, ['bowling']));
  $cases["axe-only-$n"] = summarize(run_case($n, ['axe']));
  $cases["mixed-bowl-axe-$n"] = summarize(run_case($n, ['bowling', 'axe']));
}
$cases['multi-rotation-100'] = summarize(run_case(100, ['bowling', 'axe', 'laser']));
$cases['food-fajita-15'] = summarize(run_case(15, [], '2026-11-06', ['food' => 'yes'], ['menu' => 'fajita']));
$cases['food-pizza-wings-25'] = summarize(run_case(25, ['bowling'], '2026-11-06', ['food' => 'yes'], ['menu' => 'pizza_wings']));
$cases['craft-yes-10'] = summarize(run_case(10, ['bowling'], '2026-11-06', ['craft' => 'yes']));
$cases['private-room-20'] = summarize(run_case(20, ['bowling'], '2026-11-06', ['private_room' => 'yes']));
$cases['arcade-8'] = summarize(run_case(8, ['arcade']));
$cases['extra-hours-other'] = summarize(run_case(10, ['bowling'], '2026-11-06', ['duration' => 'Other', 'other_hours' => '4'], ['bowling_hours' => 2]));

echo json_encode([
  'php_version' => PHP_VERSION,
  'plugin' => '${pluginEsc}',
  'cases' => $cases,
], JSON_PRETTY_PRINT);
`,
);

const phpResult = spawnSync(phpBin, [phpRunner], { encoding: "utf8", cwd: pluginRoot });
if (phpResult.status !== 0) {
  console.error(phpResult.stderr || phpResult.stdout);
  process.exit(1);
}
const phpPayload = JSON.parse(phpResult.stdout);

const tsRunner = join(outDir, "phase-11b-matrix-ts.mjs");
writeFileSync(
  tsRunner,
  `
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
const require = createRequire(process.cwd() + '/');
`,
);

// Use vitest/tsx path via a tiny TypeScript file executed with pnpm exec tsx
const tsSource = join(outDir, "phase-11b-matrix-ts.ts");
writeFileSync(
  tsSource,
  `
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  createWpParityEngine,
  sampleWpInquiry,
  wpBowlingLanes,
  wpGroupSizes,
} from "../../src/server/event-planner/wp-parity/index.ts";

function runCase(
  n: number,
  attractions: string[],
  date = "2026-11-06",
  changes: Record<string, unknown> = {},
  options: Record<string, unknown> = {},
) {
  const engine = createWpParityEngine();
  const sample = sampleWpInquiry();
  const s = {
    ...sample,
    adults: n,
    children: 0,
    dates: [date],
    attractions: { ...sample.attractions },
    ...changes,
  };
  for (const a of attractions) {
    (s.attractions as Record<string, string>)[a] = "yes";
  }
  if (changes.attractions) {
    s.attractions = { ...s.attractions, ...(changes.attractions as object) };
  }
  const r = engine.recommend(s, { bowling_hours: 1, ...options });
  if (!r.valid) throw new Error(JSON.stringify(r));
  const p = r.dates[0].recommendation;
  return {
    total_cents: p.total_cents,
    subtotal_cents: p.subtotal_cents,
    tax_cents: p.tax_cents,
    name: p.name,
    required_minutes: p.required_minutes ?? null,
    dining_minutes: p.dining_minutes ?? null,
    hard_review: Boolean(p.hard_review),
    review: [...(p.review ?? [])],
    selected_attractions: [...(p.selected_attractions ?? [])],
    lanes: wpBowlingLanes(r.inquiry.guests),
    groups: wpGroupSizes(r.inquiry.guests, 50),
    alternatives: (r.dates[0].alternatives ?? []).map((a) => ({
      name: a.name,
      total_cents: a.total_cents,
    })),
    itinerary: (p.itinerary ?? []).map((row) => ({
      label: row.label ?? null,
      start: row.start ?? null,
      end: row.end ?? null,
      group: row.group ?? null,
      note: row.note ?? null,
    })),
  };
}

const guestCounts = ${JSON.stringify(guestCounts)};
const cases: Record<string, unknown> = {};
for (const n of guestCounts) {
  cases[\`bowling-only-\${n}\`] = runCase(n, ["bowling"]);
  cases[\`axe-only-\${n}\`] = runCase(n, ["axe"]);
  cases[\`mixed-bowl-axe-\${n}\`] = runCase(n, ["bowling", "axe"]);
}
cases["multi-rotation-100"] = runCase(100, ["bowling", "axe", "laser"]);
cases["food-fajita-15"] = runCase(15, [], "2026-11-06", { food: "yes" }, { menu: "fajita" });
cases["food-pizza-wings-25"] = runCase(
  25,
  ["bowling"],
  "2026-11-06",
  { food: "yes" },
  { menu: "pizza_wings" },
);
cases["craft-yes-10"] = runCase(10, ["bowling"], "2026-11-06", { craft: "yes" });
cases["private-room-20"] = runCase(20, ["bowling"], "2026-11-06", { private_room: "yes" });
cases["arcade-8"] = runCase(8, ["arcade"]);
cases["extra-hours-other"] = runCase(
  10,
  ["bowling"],
  "2026-11-06",
  { duration: "Other", other_hours: "4" },
  { bowling_hours: 2 },
);

writeFileSync(join(process.cwd(), "tmp/wp-parity/phase-11b-ts-cases.json"), JSON.stringify({ cases }, null, 2));
console.log(Object.keys(cases).length);
`,
);

const tsResult = spawnSync(
  "pnpm",
  ["exec", "tsx", "--tsconfig", "tsconfig.json", tsSource],
  { encoding: "utf8", cwd: repoRoot },
);
if (tsResult.status !== 0) {
  console.error(tsResult.stderr || tsResult.stdout);
  process.exit(1);
}

const { readFileSync } = await import("node:fs");
const tsPayload = JSON.parse(readFileSync(join(outDir, "phase-11b-ts-cases.json"), "utf8"));

const mismatches = [];
const keys = Object.keys(phpPayload.cases);
for (const id of keys) {
  const php = phpPayload.cases[id];
  const ts = tsPayload.cases[id];
  if (!ts) {
    mismatches.push({ id, reason: "missing TS case" });
    continue;
  }
  const fields = [
    "total_cents",
    "subtotal_cents",
    "tax_cents",
    "name",
    "required_minutes",
    "dining_minutes",
    "hard_review",
    "lanes",
  ];
  for (const field of fields) {
    if (JSON.stringify(php[field]) !== JSON.stringify(ts[field])) {
      mismatches.push({ id, field, php: php[field], ts: ts[field] });
    }
  }
  if (JSON.stringify(php.groups) !== JSON.stringify(ts.groups)) {
    mismatches.push({ id, field: "groups", php: php.groups, ts: ts.groups });
  }
  if (JSON.stringify(php.selected_attractions?.slice().sort()) !== JSON.stringify(ts.selected_attractions?.slice().sort())) {
    mismatches.push({
      id,
      field: "selected_attractions",
      php: php.selected_attractions,
      ts: ts.selected_attractions,
    });
  }
  if (JSON.stringify(php.alternatives) !== JSON.stringify(ts.alternatives)) {
    mismatches.push({ id, field: "alternatives", php: php.alternatives, ts: ts.alternatives });
  }
  // Itinerary: compare labels/start/end/group/note length and content
  if (JSON.stringify(php.itinerary) !== JSON.stringify(ts.itinerary)) {
    mismatches.push({
      id,
      field: "itinerary",
      php_len: php.itinerary?.length,
      ts_len: ts.itinerary?.length,
      php: php.itinerary,
      ts: ts.itinerary,
    });
  }
}

const report = {
  ok: mismatches.length === 0,
  php_version: phpPayload.php_version,
  pluginRoot,
  case_count: keys.length,
  mismatch_count: mismatches.length,
  mismatches,
  sample_totals: Object.fromEntries(
    ["bowling-only-1", "bowling-only-50", "bowling-only-51", "bowling-only-100", "mixed-bowl-axe-100", "food-fajita-15"].map(
      (id) => [
        id,
        {
          php_total: phpPayload.cases[id]?.total_cents,
          ts_total: tsPayload.cases[id]?.total_cents,
          lanes: phpPayload.cases[id]?.lanes,
          groups: phpPayload.cases[id]?.groups,
        },
      ],
    ),
  ),
  note: "Plugin-default catalog only. Live WordPress admin overrides were not loaded.",
};

writeFileSync(join(outDir, "phase-11b-parity-matrix-report.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
process.exit(report.ok ? 0 : 1);
