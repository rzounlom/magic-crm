/**
 * Scoped DEV sync: upsert managed Generations PricingPromotion rows only.
 * Does not rewrite prices, grants, resources, or recommendation profiles.
 */
import { config } from "dotenv";
import type { Prisma } from "@/generated/prisma/client";

import { createPrismaClient } from "@/lib/db/create-client";
import { parseRuntimeEnv } from "@/lib/env/validation";
import { loadBookingCatalogDataset } from "@/server/catalog/load-dataset";

const TARGET_SLUG = "generations-crm-test-1788129640704833684";
const DEV_HOST_FRAGMENT = "ep-bold-art-avjy5nt4";
const MANAGED_SLUGS = ["wed-regular-bowling-50", "wed-regular-axe-50", "thu-axe-30-bogo"] as const;

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
  if (arg("--confirm") !== "SYNC_PROMOTIONS") {
    throw new Error("Pass --confirm SYNC_PROMOTIONS.");
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
  const promotions = dataset.promotions.filter((row) =>
    (MANAGED_SLUGS as readonly string[]).includes(row.slug),
  );
  if (promotions.length !== MANAGED_SLUGS.length) {
    throw new Error("Catalog is missing one or more managed promotion slugs.");
  }

  const database = createPrismaClient(env.DATABASE_URL);
  try {
    const organization = await database.organization.findFirst({
      where: { slug },
      select: { id: true, slug: true },
    });
    if (!organization) {
      throw new Error(`No organization for slug "${slug}".`);
    }

    const locations = await database.location.findMany({
      where: { organizationId: organization.id },
      select: { id: true, slug: true },
    });
    const locationIds = new Map(locations.map((row) => [row.slug, row.id]));

    const before = await database.pricingPromotion.findMany({
      where: { organizationId: organization.id, slug: { in: [...MANAGED_SLUGS] } },
      select: { slug: true, active: true, type: true, version: true, productSlugs: true, daysOfWeek: true },
      orderBy: { slug: "asc" },
    });

    await database.$transaction(async (tx) => {
      await tx.pricingPromotion.deleteMany({
        where: { organizationId: organization.id, slug: { in: [...MANAGED_SLUGS] } },
      });
      await tx.pricingPromotion.createMany({
        data: promotions.map((promotion) => ({
          organizationId: organization.id,
          locationId: promotion.locationSlug
            ? (locationIds.get(promotion.locationSlug) ?? null)
            : null,
          slug: promotion.slug,
          name: promotion.name,
          type: promotion.type,
          version: promotion.version,
          active: promotion.active,
          stackable: promotion.stackable,
          stackingGroup: promotion.stackingGroup ?? null,
          priority: promotion.priority,
          allowsFurtherDiscount: promotion.allowsFurtherDiscount,
          productSlugs: promotion.productSlugs ?? undefined,
          categorySlugs: promotion.categorySlugs ?? undefined,
          daysOfWeek: promotion.daysOfWeek ?? undefined,
          localStartMinute: promotion.localStartMinute ?? null,
          localEndMinute: promotion.localEndMinute ?? null,
          effectiveFrom: promotion.effectiveFrom
            ? new Date(`${promotion.effectiveFrom.slice(0, 10)}T00:00:00.000Z`)
            : null,
          effectiveTo: promotion.effectiveTo
            ? new Date(`${promotion.effectiveTo.slice(0, 10)}T00:00:00.000Z`)
            : null,
          minQuantity: promotion.minQuantity ?? null,
          maxQuantity: promotion.maxQuantity ?? null,
          payload: promotion.payload as Prisma.InputJsonValue,
        })),
      });
    });

    const after = await database.pricingPromotion.findMany({
      where: { organizationId: organization.id, slug: { in: [...MANAGED_SLUGS] } },
      select: {
        slug: true,
        active: true,
        type: true,
        version: true,
        priority: true,
        stackable: true,
        productSlugs: true,
        daysOfWeek: true,
        payload: true,
      },
      orderBy: { slug: "asc" },
    });

    console.log(
      JSON.stringify(
        {
          host,
          organizationId: organization.id,
          organizationSlug: organization.slug,
          before,
          after,
          written: after.length,
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
