/**
 * Emit a non-live plugin-defaults pricing export for pipeline / reconcile testing.
 *
 * Usage:
 *   pnpm exec tsx --tsconfig tsconfig.json scripts/wp-parity-export-plugin-defaults.ts \
 *     [--out scripts/data/wp-parity/exports/plugin-defaults-snapshot.json]
 *
 * This is NOT live Generations WordPress pricing. Do not import as tenant_live.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { buildPluginDefaultsPricingExport } from "../src/server/event-planner/wp-parity/pricing-export";

function argValue(flag: string): string | null {
  const index = process.argv.indexOf(flag);
  if (index < 0) return null;
  return process.argv[index + 1] ?? null;
}

const out =
  argValue("--out") ??
  path.join(process.cwd(), "scripts/data/wp-parity/exports/plugin-defaults-snapshot.json");

const payload = buildPluginDefaultsPricingExport();
mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
console.log(`Wrote ${out}`);
console.log(`effective_source=${payload.effective_source} catalog_revision=${payload.catalog_revision}`);
console.log("NOT live WordPress pricing — do not import as tenant_live.");
