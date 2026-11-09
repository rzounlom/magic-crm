/**
 * Import a WordPress effective pricing export into a tenant WP-parity pack file.
 *
 * Usage:
 *   pnpm exec tsx --tsconfig tsconfig.json scripts/wp-parity-import-pricing.ts \
 *     --org <organizationId> \
 *     --file <path-to-live-wordpress-export.json> \
 *     [--out scripts/data/wp-parity/tenant-packs/<org>.json] \
 *     [--allow-plugin-defaults-snapshot]
 *
 * Only live_wordpress exports become tenant_live by default.
 * Does NOT write Production Neon catalog rows.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  importWpPricingExportToTenantConfig,
  parseWpPricingExport,
} from "../src/server/event-planner/wp-parity/pricing-export";

function argValue(flag: string): string | null {
  const index = process.argv.indexOf(flag);
  if (index < 0) return null;
  return process.argv[index + 1] ?? null;
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

const organizationId = argValue("--org");
const file = argValue("--file");
const allowPluginDefaultsSnapshot = hasFlag("--allow-plugin-defaults-snapshot");

if (!organizationId || !file) {
  console.error(
    "Usage: wp-parity-import-pricing.ts --org <organizationId> --file <export.json> [--out <pack.json>] [--allow-plugin-defaults-snapshot]",
  );
  process.exit(1);
}

const out =
  argValue("--out") ??
  path.join(process.cwd(), "scripts/data/wp-parity/tenant-packs", `${organizationId}.json`);

const raw = JSON.parse(readFileSync(file, "utf8")) as unknown;
const parsed = parseWpPricingExport(raw);
if (!parsed.ok) {
  console.error("Invalid WordPress pricing export:");
  for (const error of parsed.errors) console.error(`  - ${error}`);
  process.exit(1);
}

const imported = importWpPricingExportToTenantConfig({
  organizationId,
  export: parsed.export,
  requireLiveSource: !allowPluginDefaultsSnapshot,
});
if (!imported.ok) {
  console.error("Import refused:");
  for (const error of imported.errors) console.error(`  - ${error}`);
  process.exit(1);
}

mkdirSync(path.dirname(out), { recursive: true });
const pack = {
  ...imported.tenantConfig,
  _importMeta: {
    importedAt: new Date().toISOString(),
    sourceFile: path.resolve(file),
    effectiveSource: parsed.export.effective_source,
    exportExportedAt: parsed.export.exported_at,
    exportCatalogRevision: parsed.export.catalog_revision,
    configurationHash: imported.configurationHash,
    activePackageCount: imported.activePackageCount,
    priceDiffCount: imported.priceDiffCount,
    warnings: imported.warnings,
    note: "Do not apply this pack to Production Neon catalog rows without an explicit reconcile + approval step.",
  },
};
writeFileSync(out, `${JSON.stringify(pack, null, 2)}\n`, "utf8");

console.log(`Wrote tenant pack ${out}`);
console.log(`pricingSource=${imported.tenantConfig.pricingSource}`);
console.log(`pricingRevision=${imported.tenantConfig.pricingRevision}`);
console.log(`configurationHash=${imported.configurationHash}`);
console.log(`activePackages=${imported.activePackageCount}`);
console.log(`priceDiffsFromDefaults=${imported.priceDiffCount}`);
for (const warning of imported.warnings) {
  console.warn(`warning: ${warning}`);
}
if (parsed.export.effective_source !== "live_wordpress") {
  console.warn(
    "WARNING: This pack was built from a non-live export. Do not claim Generations live pricing parity.",
  );
}
