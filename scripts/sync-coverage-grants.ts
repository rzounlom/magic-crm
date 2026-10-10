/**
 * Grants-only sync for the disposable Generations CRM Test tenant.
 * Does not rewrite prices, requirements, servings, profiles, or resource inventory.
 */
import { config } from "dotenv";

import { createPrismaClient } from "@/lib/db/create-client";
import { parseRuntimeEnv } from "@/lib/env/validation";
import { loadBookingCatalogDataset } from "@/server/catalog/load-dataset";

const TARGET_SLUG = "generations-crm-test-1788129640704833684";
const DEV_HOST_FRAGMENT = "ep-bold-art-avjy5nt4";

config();
config({ path: ".env.local", override: true });

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  if (process.env.MAGICCRM_DATABASE_ROLE === "test") {
    throw new Error("Refused: MAGICCRM_DATABASE_ROLE=test.");
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refused: NODE_ENV=production.");
  }
  const confirm = arg("--confirm");
  if (confirm !== "SYNC_GRANTS") {
    throw new Error("Pass --confirm SYNC_GRANTS.");
  }

  const env = parseRuntimeEnv(process.env);
  const host = new URL(env.DATABASE_URL).hostname;
  if (!host.includes(DEV_HOST_FRAGMENT)) {
    throw new Error(`Refused: unexpected host "${host}".`);
  }

  const slug = (arg("--slug") ?? TARGET_SLUG).trim().toLowerCase();
  if (slug !== TARGET_SLUG) {
    throw new Error(`Refused: slug must be ${TARGET_SLUG}.`);
  }

  const dataset = loadBookingCatalogDataset();
  const withCoverage = dataset.products.filter((row) => (row.coverage?.length ?? 0) > 0);
  const database = createPrismaClient(env.DATABASE_URL);
  try {
    const organization = await database.organization.findFirst({
      where: { slug },
      select: { id: true, name: true, slug: true },
    });
    if (!organization) {
      throw new Error(`No organization for slug "${slug}".`);
    }

    const products = await database.product.findMany({
      where: {
        organizationId: organization.id,
        slug: { in: withCoverage.map((row) => row.slug) },
      },
      select: { id: true, slug: true },
    });
    const idBySlug = new Map(products.map((row) => [row.slug, row.id]));
    const missing = withCoverage.filter((row) => !idBySlug.has(row.slug)).map((row) => row.slug);
    if (missing.length > 0) {
      throw new Error(`Missing products in database: ${missing.join(", ")}`);
    }

    const productIds = products.map((row) => row.id);
    await database.productExperienceGrant.deleteMany({
      where: { organizationId: organization.id, productId: { in: productIds } },
    });

    const rows = withCoverage.flatMap((product) => {
      const productId = idBySlug.get(product.slug);
      if (!productId) {
        return [];
      }
      return (product.coverage ?? []).map((grant) => ({
        organizationId: organization.id,
        productId,
        experienceKey: grant.experienceKey,
        kind: grant.kind,
        durationMinutesPerParticipant: grant.durationMinutesPerParticipant ?? null,
        sessionsPerParticipant: grant.sessionsPerParticipant ?? null,
        servings: grant.servings ?? null,
        participantRule: grant.participantRule,
        fixedParticipants: grant.fixedParticipants ?? null,
        creditCents: grant.creditCents ?? null,
        simultaneousGuestCapacity: grant.simultaneousGuestCapacity ?? null,
        rotationMinutesPerParticipant: grant.rotationMinutesPerParticipant ?? null,
        minAge: grant.minAge ?? null,
        minWeightLbs: grant.minWeightLbs ?? null,
        requiresParticipantBreakdown: grant.requiresParticipantBreakdown,
        optionalBenefit: grant.optionalBenefit ?? false,
      }));
    });
    if (rows.length > 0) {
      await database.productExperienceGrant.createMany({ data: rows });
    }

    const after = await database.productExperienceGrant.findMany({
      where: { organizationId: organization.id, productId: { in: productIds } },
      include: { product: { select: { slug: true } } },
      orderBy: [{ productId: "asc" }, { experienceKey: "asc" }],
    });

    console.log(
      JSON.stringify(
        {
          host,
          organizationId: organization.id,
          organizationSlug: organization.slug,
          grantsWritten: after.length,
          byProduct: after.map((row) => ({
            slug: row.product.slug,
            experienceKey: row.experienceKey,
            kind: row.kind,
            durationMinutesPerParticipant: row.durationMinutesPerParticipant,
          })),
        },
        null,
        2,
      ),
    );
  } finally {
    await database.$disconnect();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
