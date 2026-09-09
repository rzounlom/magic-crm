import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

import { config } from "dotenv";

import { createPrismaClient } from "@/lib/db/create-client";
import { parseRuntimeEnv } from "@/lib/env/validation";
import { syncResourceCatalogFromKnowledge } from "@/server/resources/sync-from-knowledge";

if (process.env.MAGICCRM_DATABASE_ROLE === "test") {
  throw new Error("Do not sync resource types into the test database from this script.");
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
    throw new Error("Pass --confirm SYNC. Non-interactive runs must confirm explicitly.");
  }
  const rl = createInterface({ input, output });
  try {
    return (await rl.question(promptLabel)).trim();
  } finally {
    rl.close();
  }
}

async function main() {
  const slug = arg("--slug")?.trim().toLowerCase();
  if (!slug) {
    throw new Error("Usage: pnpm tenant:sync-resource-types -- --slug <organizationSlug> --confirm SYNC");
  }

  const env = parseRuntimeEnv(process.env);
  const database = createPrismaClient(env.DATABASE_URL);
  try {
    const organization = await database.organization.findFirst({
      where: { slug },
      select: { id: true, name: true, slug: true },
    });
    if (!organization) {
      throw new Error(`No organization found for slug "${slug}".`);
    }

    console.info("Sync finite resource types from this tenant's sales knowledge?");
    console.info(`  Organization: ${organization.name}`);
    console.info(`  Slug: ${organization.slug}`);
    console.info("  This creates resource types and knowledge links. It does not invent lane or room counts.");

    const confirmed = await readConfirm("Type SYNC to confirm: ");
    if (confirmed !== "SYNC") {
      throw new Error("Aborted. Type SYNC to confirm.");
    }

    const result = await syncResourceCatalogFromKnowledge(database, organization.id);
    console.info("Done.");
    console.info(`  Resource type upserts: ${result.resourceTypes}`);
    console.info(`  Knowledge requirement upserts: ${result.requirements}`);
  } finally {
    await database.$disconnect();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
