#!/usr/bin/env node
/**
 * Validate harness JSON exports against MagicCRM parseWpPricingExport + import schema.
 * Run after run-export.php (via package scripts or build-zip.sh).
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../../..");

// Prefer compiled-less TS via tsx when available; else dynamic import of built path fails —
// invoke through a small inline loader using child process instead.
import { spawnSync } from "node:child_process";

const outDir =
  process.argv[2] ||
  path.join(root, "tools/wp-parity/wordpress-plugin-export/dist/local-test-output");

const files = readdirSync(outDir).filter((name) => name.endsWith(".json"));
if (files.length === 0) {
  console.error(`No JSON files in ${outDir}`);
  process.exit(1);
}

const validator = path.join(
  root,
  "tools/wp-parity/wordpress-plugin-export/local-harness/validate-export-file.ts",
);

let failed = 0;
for (const file of files) {
  const full = path.join(outDir, file);
  const result = spawnSync(
    "pnpm",
    ["exec", "tsx", "--tsconfig", "tsconfig.json", validator, full],
    { cwd: root, encoding: "utf8" },
  );
  process.stdout.write(result.stdout || "");
  process.stderr.write(result.stderr || "");
  if (result.status !== 0) {
    failed += 1;
  }
}

if (failed > 0) {
  console.error(`Validation failed for ${failed} file(s)`);
  process.exit(1);
}
console.log(`Validated ${files.length} export file(s) against MagicCRM schema`);
