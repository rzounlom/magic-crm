import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

import { config } from "dotenv";

import { createPrismaClient } from "@/lib/db/create-client";
import { parseRuntimeEnv } from "@/lib/env/validation";
import { formatCatalogImportReport } from "@/server/catalog/catalog-import-diff";
import { loadBookingCatalogDataset } from "@/server/catalog/load-dataset";
import { importBookingCatalog } from "@/server/services/catalog-import-service";

if (process.env.MAGICCRM_DATABASE_ROLE === "test") {
  throw new Error("Do not import a development booking catalog into the test database.");
}

if (process.env.NODE_ENV === "production") {
  throw new Error("Development booking-catalog import is not allowed when NODE_ENV=production.");
}

config();
config({ path: ".env.local", override: true });

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function readConfirm(promptLabel: string): Promise<string> {
  const fromArgs = arg("--confirm");
  if (fromArgs) {
    return fromArgs;
  }
  if (!process.stdin.isTTY) {
    throw new Error("Pass --confirm IMPORT. Non-interactive runs must confirm explicitly.");
  }
  const rl = createInterface({ input, output });
  try {
    return (await rl.question(promptLabel)).trim();
  } finally {
    rl.close();
  }
}

async function main() {
  if (arg("--organizationId") || arg("--organization-id")) {
    throw new Error("Pass --slug only. organizationId is not accepted.");
  }

  const slug = arg("--slug")?.trim().toLowerCase();
  if (!slug) {
    throw new Error(
      "Usage: npm run tenant:import-booking-catalog -- --slug <organizationSlug> [--dry-run | --confirm IMPORT]",
    );
  }

  const dryRun = hasFlag("--dry-run");
  const dataset = loadBookingCatalogDataset();
  const env = parseRuntimeEnv(process.env);
  const database = createPrismaClient(env.DATABASE_URL);
  try {
    if (dryRun) {
      const preview = await importBookingCatalog(database, {
        organizationSlug: slug,
        dataset,
        dryRun: true,
      });
      console.info(formatCatalogImportReport(preview, { dryRun: true, applied: false }));
      return;
    }

    const preview = await importBookingCatalog(database, {
      organizationSlug: slug,
      dataset,
      dryRun: true,
    });
    console.info(formatCatalogImportReport(preview, { dryRun: true, applied: false }));

    const confirmed = await readConfirm("Type IMPORT to apply this tenant-scoped catalog update: ");
    if (confirmed !== "IMPORT") {
      throw new Error("Aborted. Type IMPORT to confirm before writing catalog data.");
    }

    const result = await importBookingCatalog(database, {
      organizationSlug: slug,
      dataset,
    });
    console.info(formatCatalogImportReport(result, { dryRun: false, applied: true }));
  } finally {
    await database.$disconnect();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
