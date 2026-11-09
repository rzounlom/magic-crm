/**
 * Reconcile a WordPress pricing export against the Generations booking-catalog seed.
 *
 * Usage:
 *   pnpm exec tsx --tsconfig tsconfig.json scripts/wp-parity-reconcile-pricing.ts \
 *     --file <export.json> \
 *     [--catalog scripts/data/generations-booking/booking-catalog.json] \
 *     [--out planning/wordpress-event-planner-parity/17-pricing-reconciliation.md]
 *
 * Does not merge or overwrite Production catalog prices.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { parseWpPricingExport } from "../src/server/event-planner/wp-parity/pricing-export";
import {
  formatReconcileReportMarkdown,
  reconcileWpExportAgainstMagicCrmCatalog,
  type MagicCrmCatalogProduct,
} from "../src/server/event-planner/wp-parity/reconcile-catalog";

function argValue(flag: string): string | null {
  const index = process.argv.indexOf(flag);
  if (index < 0) return null;
  return process.argv[index + 1] ?? null;
}

const file = argValue("--file");
if (!file) {
  console.error(
    "Usage: wp-parity-reconcile-pricing.ts --file <export.json> [--catalog <booking-catalog.json>] [--out <report.md>]",
  );
  process.exit(1);
}

const catalogPath =
  argValue("--catalog") ??
  path.join(process.cwd(), "scripts/data/generations-booking/booking-catalog.json");
const out =
  argValue("--out") ??
  path.join(
    process.cwd(),
    "planning/wordpress-event-planner-parity/17-pricing-reconciliation.md",
  );

const parsed = parseWpPricingExport(JSON.parse(readFileSync(file, "utf8")) as unknown);
if (!parsed.ok) {
  console.error("Invalid WordPress pricing export:");
  for (const error of parsed.errors) console.error(`  - ${error}`);
  process.exit(1);
}

const catalogJson = JSON.parse(readFileSync(catalogPath, "utf8")) as {
  products?: MagicCrmCatalogProduct[];
};
const products = catalogJson.products ?? [];
const report = reconcileWpExportAgainstMagicCrmCatalog({
  export: parsed.export,
  products,
});
const markdown = formatReconcileReportMarkdown(report);
mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(out, markdown, "utf8");

console.log(`Wrote ${out}`);
console.log(
  `match=${report.summary.matchCount} different=${report.summary.differentCount} missingProduct=${report.summary.missingProductCount} unmappedWp=${report.summary.unmappedWpKeyCount}`,
);
if (parsed.export.effective_source !== "live_wordpress") {
  console.warn(
    "WARNING: Reconcile used a non-live export. Live Generations overrides are still required before declaring pricing integration complete.",
  );
}
