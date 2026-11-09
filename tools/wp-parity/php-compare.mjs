#!/usr/bin/env node
/**
 * Live WordPress PHP Engine ↔ MagicCRM TypeScript comparison harness.
 *
 * 1. Runs the PHP Engine against shared fixtures (plugin defaults).
 * 2. Runs the TypeScript port against the same fixtures.
 * 3. Compares integer-cent totals and key plan fields.
 *
 * Usage:
 *   node tools/wp-parity/php-compare.mjs
 *   node tools/wp-parity/php-compare.mjs --json
 *   PHP_BIN=/path/to/php node tools/wp-parity/php-compare.mjs
 *
 * Env:
 *   WP_PLANNER_ROOT — plugin root (default: ~/Downloads/WP Plugging- Event Planner Intake/generations-event-planner-next)
 *   PHP_BIN — explicit php binary
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../..");
const defaultPlugin = join(
  homedir(),
  "Downloads/WP Plugging- Event Planner Intake/generations-event-planner-next",
);
const pluginRoot = process.env.WP_PLANNER_ROOT || defaultPlugin;
const wantJson = process.argv.includes("--json");

function findPhp() {
  if (process.env.PHP_BIN && existsSync(process.env.PHP_BIN)) {
    return process.env.PHP_BIN;
  }
  const candidates = [
    "php",
    "php8.4",
    "php8.3",
    "php8.2",
    "/usr/local/opt/php/bin/php",
    "/usr/local/opt/php@8.3/bin/php",
    "/opt/homebrew/opt/php/bin/php",
    "/opt/homebrew/opt/php@8.3/bin/php",
    `${homedir()}/.local/share/mise/shims/php`,
    join(repoRoot, "tmp/mamba-root/envs/php85/bin/php"),
  ];
  for (const name of candidates) {
    if (name.includes("/")) {
      if (existsSync(name)) return name;
      continue;
    }
    const found = spawnSync("which", [name], { encoding: "utf8" });
    if (found.status === 0 && found.stdout.trim()) return found.stdout.trim();
  }
  // Cellar glob
  for (const base of ["/usr/local/Cellar/php", "/usr/local/Cellar/php@8.3", "/opt/homebrew/Cellar/php"]) {
    const ls = spawnSync("bash", ["-lc", `ls -1d ${base}/*/bin/php 2>/dev/null | tail -1`], {
      encoding: "utf8",
    });
    if (ls.status === 0 && ls.stdout.trim() && existsSync(ls.stdout.trim())) {
      return ls.stdout.trim();
    }
  }
  return null;
}

const phpBin = findPhp();
if (!phpBin) {
  const message =
    "PHP CLI not found. Install PHP (brew install php / shivammathur/php/php@8.3) then re-run. Golden vitest suites still compare against recorded PHP expected totals.";
  const report = { ok: false, blocker: message, comparable: 0, passed: 0, failed: 0, mismatches: [] };
  if (wantJson) console.log(JSON.stringify(report, null, 2));
  else console.error(message);
  process.exit(2);
}

if (!existsSync(join(pluginRoot, "includes/engine.php"))) {
  console.error(`WordPress plugin not found at ${pluginRoot}`);
  process.exit(2);
}

const outDir = join(repoRoot, "tmp/wp-parity");
mkdirSync(outDir, { recursive: true });
const phpRunner = join(outDir, "export-engine-cases.php");
const pluginEsc = pluginRoot.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

writeFileSync(
  phpRunner,
  `<?php
if (PHP_SAPI !== 'cli') { fwrite(STDERR, "CLI only\\n"); exit(1); }
require '${pluginEsc}/includes/catalog.php';
require '${pluginEsc}/includes/engine.php';
require '${pluginEsc}/includes/plugin.php';
use Generations\\PlannerNext\\Engine;
use Generations\\PlannerNext\\Catalog;
use Generations\\PlannerNext\\Plugin;

function run_case($n, $attractions, $date = '2026-11-06', $changes = [], $options = []) {
  $engine = new Engine();
  $s = Plugin::sample();
  $s['adults'] = $n;
  foreach ($attractions as $a) $s['attractions'][$a] = 'yes';
  $s['dates'] = [$date];
  $s = array_replace_recursive($s, $changes);
  $options = array_merge(['bowling_hours' => 1], $options);
  $r = $engine->recommend($s, $options);
  if (!$r['valid']) throw new Exception(json_encode($r));
  return $r;
}
function main_plan($r) { return $r['dates'][0]['recommendation']; }
function summarize($r) {
  $p = main_plan($r);
  return [
    'total_cents' => $p['total_cents'],
    'subtotal_cents' => $p['subtotal_cents'],
    'tax_cents' => $p['tax_cents'],
    'name' => $p['name'],
    'dining_minutes' => $p['dining_minutes'] ?? null,
    'required_minutes' => $p['required_minutes'] ?? null,
    'axe_minutes' => $p['axe_minutes'] ?? null,
    'fits_duration' => !empty($p['fits_duration']),
    'hard_review' => !empty($p['hard_review']),
    'selected_attractions' => array_values($p['selected_attractions'] ?? []),
    'rules_version' => $r['rules_version'],
    'pricing_revision' => $r['pricing_revision'],
  ];
}

$cases = [];
$cases[] = ['id' => 'bowling-6-fri', 'php' => summarize(run_case(6, ['bowling']))];
$cases[] = ['id' => 'bowling-7-fri', 'php' => summarize(run_case(7, ['bowling']))];
$cases[] = ['id' => 'bowling-6-tue', 'php' => summarize(run_case(6, ['bowling'], '2026-11-03'))];
$cases[] = ['id' => 'bowling-6-wed', 'php' => summarize(run_case(6, ['bowling'], '2026-11-04'))];
$cases[] = ['id' => 'bowl-axe-10', 'php' => summarize(run_case(10, ['bowling', 'axe']))];
$cases[] = ['id' => 'axe-only-10', 'php' => summarize(run_case(10, ['axe']))];
$cases[] = ['id' => 'laser-8', 'php' => summarize(run_case(8, ['laser']))];
$cases[] = ['id' => 'laser-arcade-8', 'php' => summarize(run_case(8, ['laser', 'arcade']))];
$cases[] = ['id' => 'blast-8-children', 'php' => summarize(run_case(0, ['laser', 'climbing', 'arcade'], '2026-11-06', ['children' => 8]))];
$cases[] = ['id' => 'golf-mixed', 'php' => summarize(run_case(4, ['golf'], '2026-11-06', ['children' => 4]))];
$cases[] = ['id' => 'fajita-15', 'php' => summarize(run_case(15, [], '2026-11-06', ['food' => 'yes'], ['menu' => 'fajita']))];
$cases[] = ['id' => 'dining-25-pizza-wings', 'php' => summarize(run_case(25, ['bowling'], '2026-11-06', ['food' => 'yes'], ['menu' => 'pizza_wings']))];
$cases[] = ['id' => 'dining-26-pizza', 'php' => summarize(run_case(26, ['bowling'], '2026-11-06', ['food' => 'yes']))];
$cases[] = ['id' => 'all-no', 'php' => summarize(run_case(10, []))];
$cases[] = ['id' => 'monday-no-regular', 'php' => summarize(run_case(6, ['bowling'], '2026-11-02'))];

$v = trim(shell_exec('php -v') ?: '');
echo json_encode([
  'php_version' => PHP_VERSION,
  'php_sapi' => PHP_SAPI,
  'catalog_version' => Catalog::VERSION,
  'pricing_revision' => Catalog::revision(),
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

// TypeScript side: vitest live-compare suite (authoritative field-level asserts).
const vitest = spawnSync(
  "pnpm",
  ["exec", "vitest", "run", "tests/unit/wp-parity-php-live-compare.test.ts"],
  {
    encoding: "utf8",
    cwd: repoRoot,
    env: { ...process.env, PHP_BIN: phpBin },
  },
);
const vitestOk = vitest.status === 0;
const passedMatch = /Tests\s+(\d+)\s+passed/.exec(vitest.stdout + vitest.stderr);
const skippedMatch = /(\d+)\s+skipped/.exec(vitest.stdout + vitest.stderr);
const passed = passedMatch ? Number(passedMatch[1]) : 0;

const report = {
  ok: vitestOk,
  php_bin: phpBin,
  php_version: phpPayload.php_version,
  pluginRoot,
  catalog_version: phpPayload.catalog_version,
  php_pricing_revision: phpPayload.pricing_revision,
  php_fixture_export_count: phpPayload.cases.length,
  vitest_passed: passed,
  vitest_skipped: skippedMatch ? Number(skippedMatch[1]) : 0,
  vitest_output_tail: (vitest.stdout || "").trim().split("\n").slice(-12),
  note:
    "Live PHP Engine is the reference. Comparison executed via tests/unit/wp-parity-php-live-compare.test.ts. Pricing source: plugin Catalog::defaults(). Live WP admin overrides were not loaded.",
};

writeFileSync(join(outDir, "php-compare-report.json"), JSON.stringify(report, null, 2));
if (wantJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(
    `PHP ${report.php_version}: exported ${report.php_fixture_export_count} fixtures; vitest live-compare ${vitestOk ? "PASSED" : "FAILED"} (${passed} passed)`,
  );
  if (!vitestOk) {
    console.error(vitest.stdout || vitest.stderr);
    process.exit(1);
  }
}
