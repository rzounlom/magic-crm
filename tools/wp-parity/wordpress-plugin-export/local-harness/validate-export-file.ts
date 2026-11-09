/**
 * Validate one WordPress pricing export JSON against MagicCRM import schema.
 *
 *   pnpm exec tsx --tsconfig tsconfig.json \
 *     tools/wp-parity/wordpress-plugin-export/local-harness/validate-export-file.ts <file.json>
 */
import { readFileSync } from "node:fs";

import {
  importWpPricingExportToTenantConfig,
  parseWpPricingExport,
} from "../../../../src/server/event-planner/wp-parity/pricing-export";

const file = process.argv[2];
if (!file) {
  console.error("Usage: validate-export-file.ts <export.json>");
  process.exit(1);
}

const raw = JSON.parse(readFileSync(file, "utf8")) as unknown;
const parsed = parseWpPricingExport(raw);
if (!parsed.ok) {
  console.error(`FAIL ${file}`);
  for (const error of parsed.errors) console.error(`  - ${error}`);
  process.exit(1);
}

if (parsed.export.effective_source !== "live_wordpress") {
  console.error(`FAIL ${file}: expected effective_source=live_wordpress`);
  process.exit(1);
}
if (parsed.export.format !== "gapnext_effective_pricing_v1") {
  console.error(`FAIL ${file}: unexpected format`);
  process.exit(1);
}

const imported = importWpPricingExportToTenantConfig({
  organizationId: "org_local_harness",
  export: parsed.export,
  requireLiveSource: true,
});
if (!imported.ok) {
  console.error(`FAIL ${file}: import refused`);
  for (const error of imported.errors) console.error(`  - ${error}`);
  process.exit(1);
}

console.log(
  `OK ${file} revision=${parsed.export.catalog_revision} packages=${imported.activePackageCount} diffs=${imported.priceDiffCount} hash=${imported.configurationHash}`,
);
