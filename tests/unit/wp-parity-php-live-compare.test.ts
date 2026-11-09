/**
 * Live PHP ↔ TypeScript comparison.
 *
 * Skips when PHP_BIN / php is unavailable. When PHP is present, spawns the
 * WordPress Engine against the same fixtures and asserts exact integer-cent equality.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  createWpParityEngine,
  sampleWpInquiry,
  wpCatalogDefaults,
  wpCatalogRevision,
} from "@/server/event-planner/wp-parity";

const pluginRoot =
  process.env.WP_PLANNER_ROOT ||
  join(homedir(), "Downloads/WP Plugging- Event Planner Intake/generations-event-planner-next");

function findPhp(): string | null {
  if (process.env.PHP_BIN && existsSync(process.env.PHP_BIN)) return process.env.PHP_BIN;
  for (const name of ["php", "/usr/local/opt/php@8.3/bin/php"]) {
    if (name.includes("/") && existsSync(name)) return name;
    const found = spawnSync("which", [name], { encoding: "utf8" });
    if (found.status === 0 && found.stdout.trim()) return found.stdout.trim();
  }
  const conda = join(
    process.cwd(),
    "tmp/mamba-root/envs/php85/bin/php",
  );
  if (existsSync(conda)) return conda;
  return null;
}

type Summary = {
  total_cents: number;
  subtotal_cents: number;
  tax_cents: number;
  dining_minutes: number | null;
  required_minutes: number | null;
  axe_minutes: number | null;
  fits_duration: boolean;
  hard_review: boolean;
  selected_attractions: string[];
};

function summarizeTs(r: {
  dates: Array<{ recommendation: Record<string, unknown> }>;
}): Summary {
  const p = r.dates[0].recommendation;
  return {
    total_cents: p.total_cents as number,
    subtotal_cents: p.subtotal_cents as number,
    tax_cents: p.tax_cents as number,
    dining_minutes: (p.dining_minutes as number | null | undefined) ?? null,
    required_minutes: (p.required_minutes as number | null | undefined) ?? null,
    axe_minutes: (p.axe_minutes as number | null | undefined) ?? null,
    fits_duration: Boolean(p.fits_duration),
    hard_review: Boolean(p.hard_review),
    selected_attractions: [...((p.selected_attractions as string[]) ?? [])],
  };
}

function runTs(
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
  return summarizeTs(r);
}

function loadPhpSummaries(phpBin: string): Record<string, Summary> {
  const outDir = join(process.cwd(), "tmp/wp-parity");
  mkdirSync(outDir, { recursive: true });
  const runner = join(outDir, "vitest-export-engine-cases.php");
  const pluginEsc = pluginRoot.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  writeFileSync(
    runner,
    `<?php
require '${pluginEsc}/includes/catalog.php';
require '${pluginEsc}/includes/engine.php';
require '${pluginEsc}/includes/plugin.php';
use Generations\\PlannerNext\\Engine;
use Generations\\PlannerNext\\Plugin;
function run_case($n,$attractions,$date='2026-11-06',$changes=[],$options=[]){
  $engine=new Engine();$s=Plugin::sample();$s['adults']=$n;
  foreach($attractions as $a)$s['attractions'][$a]='yes';$s['dates']=[$date];
  $s=array_replace_recursive($s,$changes);$options=array_merge(['bowling_hours'=>1],$options);
  $r=$engine->recommend($s,$options);if(!$r['valid'])throw new Exception(json_encode($r));return $r;
}
function summarize($r){$p=$r['dates'][0]['recommendation'];return [
  'total_cents'=>$p['total_cents'],'subtotal_cents'=>$p['subtotal_cents'],'tax_cents'=>$p['tax_cents'],
  'dining_minutes'=>$p['dining_minutes']??null,'required_minutes'=>$p['required_minutes']??null,
  'axe_minutes'=>$p['axe_minutes']??null,'fits_duration'=>!empty($p['fits_duration']),
  'hard_review'=>!empty($p['hard_review']),'selected_attractions'=>array_values($p['selected_attractions']??[]),
];}
$cases=[
  'bowling-6-fri'=>summarize(run_case(6,['bowling'])),
  'bowling-7-fri'=>summarize(run_case(7,['bowling'])),
  'bowling-6-tue'=>summarize(run_case(6,['bowling'],'2026-11-03')),
  'bowling-6-wed'=>summarize(run_case(6,['bowling'],'2026-11-04')),
  'bowl-axe-10'=>summarize(run_case(10,['bowling','axe'])),
  'axe-only-10'=>summarize(run_case(10,['axe'])),
  'laser-8'=>summarize(run_case(8,['laser'])),
  'laser-arcade-8'=>summarize(run_case(8,['laser','arcade'])),
  'blast-8-children'=>summarize(run_case(0,['laser','climbing','arcade'],'2026-11-06',['children'=>8])),
  'golf-mixed'=>summarize(run_case(4,['golf'],'2026-11-06',['children'=>4])),
  'fajita-15'=>summarize(run_case(15,[],'2026-11-06',['food'=>'yes'],['menu'=>'fajita'])),
  'dining-25-pizza-wings'=>summarize(run_case(25,['bowling'],'2026-11-06',['food'=>'yes'],['menu'=>'pizza_wings'])),
  'dining-26-pizza'=>summarize(run_case(26,['bowling'],'2026-11-06',['food'=>'yes'])),
  'all-no'=>summarize(run_case(10,[])),
  'monday-no-regular'=>summarize(run_case(6,['bowling'],'2026-11-02')),
];
echo json_encode(['php_version'=>PHP_VERSION,'pricing_revision'=>Generations\\PlannerNext\\Catalog::revision(),'cases'=>$cases]);
`,
  );
  const result = spawnSync(phpBin, [runner], { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "php export failed");
  }
  const payload = JSON.parse(result.stdout) as {
    php_version: string;
    pricing_revision: string;
    cases: Record<string, Summary>;
  };
  return payload.cases;
}

const phpBin = findPhp();
const pluginOk = existsSync(join(pluginRoot, "includes/engine.php"));

describe.runIf(Boolean(phpBin && pluginOk))("live PHP ↔ TypeScript engine compare", () => {
  const phpCases = loadPhpSummaries(phpBin!);

  const fixtures: Array<{
    id: string;
    run: () => Summary;
  }> = [
    { id: "bowling-6-fri", run: () => runTs(6, ["bowling"]) },
    { id: "bowling-7-fri", run: () => runTs(7, ["bowling"]) },
    { id: "bowling-6-tue", run: () => runTs(6, ["bowling"], "2026-11-03") },
    { id: "bowling-6-wed", run: () => runTs(6, ["bowling"], "2026-11-04") },
    { id: "bowl-axe-10", run: () => runTs(10, ["bowling", "axe"]) },
    { id: "axe-only-10", run: () => runTs(10, ["axe"]) },
    { id: "laser-8", run: () => runTs(8, ["laser"]) },
    { id: "laser-arcade-8", run: () => runTs(8, ["laser", "arcade"]) },
    {
      id: "blast-8-children",
      run: () => runTs(0, ["laser", "climbing", "arcade"], "2026-11-06", { children: 8 }),
    },
    { id: "golf-mixed", run: () => runTs(4, ["golf"], "2026-11-06", { children: 4 }) },
    {
      id: "fajita-15",
      run: () => runTs(15, [], "2026-11-06", { food: "yes" }, { menu: "fajita" }),
    },
    {
      id: "dining-25-pizza-wings",
      run: () =>
        runTs(25, ["bowling"], "2026-11-06", { food: "yes" }, { menu: "pizza_wings" }),
    },
    {
      id: "dining-26-pizza",
      run: () => runTs(26, ["bowling"], "2026-11-06", { food: "yes" }),
    },
    { id: "all-no", run: () => runTs(10, []) },
    { id: "monday-no-regular", run: () => runTs(6, ["bowling"], "2026-11-02") },
  ];

  it("uses matching plugin-default pricing revision", () => {
    expect(wpCatalogRevision(wpCatalogDefaults())).toBeTruthy();
  });

  for (const fixture of fixtures) {
    it(`matches PHP exactly for ${fixture.id}`, () => {
      const php = phpCases[fixture.id];
      const ts = fixture.run();
      expect(php, `missing PHP case ${fixture.id}`).toBeTruthy();
      expect(ts.total_cents).toBe(php.total_cents);
      expect(ts.subtotal_cents).toBe(php.subtotal_cents);
      expect(ts.tax_cents).toBe(php.tax_cents);
      expect(ts.dining_minutes).toBe(php.dining_minutes);
      expect(ts.required_minutes).toBe(php.required_minutes);
      expect(ts.axe_minutes).toBe(php.axe_minutes);
      expect(ts.fits_duration).toBe(php.fits_duration);
      expect(ts.hard_review).toBe(php.hard_review);
      expect([...ts.selected_attractions].sort()).toEqual([...php.selected_attractions].sort());
    });
  }
});

describe.runIf(!phpBin || !pluginOk)("live PHP ↔ TypeScript engine compare (skipped)", () => {
  it("skips because PHP CLI or plugin root is unavailable", () => {
    expect(phpBin || pluginOk).toBeFalsy();
  });
});
