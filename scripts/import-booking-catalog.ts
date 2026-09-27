import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

import { config } from "dotenv";

import { createPrismaClient } from "@/lib/db/create-client";
import { parseRuntimeEnv } from "@/lib/env/validation";
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
      "Usage: npm run tenant:import-booking-catalog -- --slug <organizationSlug> --confirm IMPORT",
    );
  }

  const dataset = loadBookingCatalogDataset();
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

    console.info("Import development booking catalog?");
    console.info(`  Organization: ${organization.name}`);
    console.info(`  Slug: ${organization.slug}`);
    console.info(`  Products: ${dataset.products.length}`);
    console.info(`  Resource types: ${dataset.resourceTypes.length}`);
    console.info(`  Ambiguities: ${dataset.ambiguities.length}`);

    const confirmed = await readConfirm("Type IMPORT to confirm: ");
    if (confirmed !== "IMPORT") {
      throw new Error("Aborted. Type IMPORT to confirm before writing catalog data.");
    }

    const result = await importBookingCatalog(database, {
      organizationSlug: organization.slug,
      dataset,
    });

    console.info("Booking catalog import complete.");
    console.info(`  Organization: ${result.organizationName}`);
    console.info(`  Slug: ${result.organizationSlug}`);
    console.info(
      `  Categories created/updated/unchanged: ${result.categoriesCreated}/${result.categoriesUpdated}/${result.categoriesUnchanged}`,
    );
    console.info(
      `  Products created/updated/unchanged: ${result.productsCreated}/${result.productsUpdated}/${result.productsUnchanged}`,
    );
    console.info(
      `  Resource types created/updated/unchanged: ${result.resourceTypesCreated}/${result.resourceTypesUpdated}/${result.resourceTypesUnchanged}`,
    );
    console.info(`  Numbered resources created/unchanged: ${result.resourcesCreated}/${result.resourcesUnchanged}`);
    console.info(
      `  Profiles created/updated/unchanged: ${result.profilesCreated}/${result.profilesUpdated}/${result.profilesUnchanged}`,
      `  Attraction interests created/updated/unchanged: ${result.interestsCreated}/${result.interestsUpdated}/${result.interestsUnchanged}`,
    );
    console.info("  Unresolved source ambiguities:");
    for (const item of result.ambiguities) {
      console.info(`    [${item.severity}] ${item.code}: ${item.message}`);
    }
  } finally {
    await database.$disconnect();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
