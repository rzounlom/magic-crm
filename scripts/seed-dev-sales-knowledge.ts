import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

import { config } from "dotenv";

import { createPrismaClient } from "@/lib/db/create-client";
import { parseRuntimeEnv } from "@/lib/env/validation";
import { loadSalesKnowledgeDatasetFromDirectory } from "@/server/sales-knowledge/load-dataset-files";
import { importSalesKnowledgeItems } from "@/server/services/sales-knowledge-import-service";
import { syncResourceCatalogFromKnowledge } from "@/server/resources/sync-from-knowledge";

if (process.env.MAGICCRM_DATABASE_ROLE === "test") {
  throw new Error("Do not import development sales knowledge into the test database.");
}

if (process.env.NODE_ENV === "production") {
  throw new Error("Development sales-knowledge import is not allowed when NODE_ENV=production.");
}

config();
config({ path: ".env.local", override: true });

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
    throw new Error('Pass --confirm IMPORT. Non-interactive runs must confirm explicitly.');
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
      "Usage: pnpm tenant:import-sales-knowledge -- --slug <organizationSlug> --confirm IMPORT",
    );
  }

  const dataset = loadSalesKnowledgeDatasetFromDirectory();
  const env = parseRuntimeEnv(process.env);
  const database = createPrismaClient(env.DATABASE_URL);
  try {
    const organization = await database.organization.findFirst({
      where: { slug },
      select: { name: true, slug: true },
    });
    if (!organization) {
      throw new Error(`No organization found for slug "${slug}".`);
    }

    console.info("Import development sales knowledge?");
    console.info(`  Organization: ${organization.name}`);
    console.info(`  Slug: ${organization.slug}`);
    console.info(`  Records: ${dataset.items.length}`);
    console.info(`  Verification items skipped: ${dataset.skippedVerificationItems}`);

    const confirmed = await readConfirm("Type IMPORT to confirm: ");
    if (confirmed !== "IMPORT") {
      throw new Error("Aborted. Type IMPORT to confirm before writing knowledge.");
    }

    const result = await importSalesKnowledgeItems(database, {
      organizationSlug: organization.slug,
      items: dataset.items,
      skippedVerificationItems: dataset.skippedVerificationItems,
    });

    console.info("Sales knowledge import complete.");
    console.info(`  Organization: ${result.organizationName}`);
    console.info(`  Slug: ${result.organizationSlug}`);
    console.info(`  Created: ${result.created}`);
    console.info(`  Updated: ${result.updated}`);
    console.info(`  Unchanged: ${result.unchanged}`);
    console.info(`  Skipped verification items: ${result.skippedVerificationItems}`);
    console.info("  By type:");
    for (const [type, count] of Object.entries(result.byType)) {
      console.info(`    ${type}: ${count}`);
    }

    const resources = await syncResourceCatalogFromKnowledge(database, result.organizationId);
    console.info("Resource type sync from knowledge complete.");
    console.info(`  Resource type upserts: ${resources.resourceTypes}`);
    console.info(`  Knowledge requirement upserts: ${resources.requirements}`);
    console.info("  Numbered lane/room inventory was not created — counts are not published.");
  } finally {
    await database.$disconnect();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
