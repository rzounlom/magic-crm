/**
 * Scoped DEV sync: set bowling-1h PER_LANE_WEEKDAY_WEEKEND.weekendDays only.
 * Does not rewrite amounts, grants, resources, or profiles.
 */
import { config } from "dotenv";

import { createPrismaClient } from "@/lib/db/create-client";
import { parseRuntimeEnv } from "@/lib/env/validation";
import { PRODUCT_PRICE_STRATEGIES } from "@/types/catalog";

const TARGET_SLUG = "generations-crm-test-1788129640704833684";
const DEV_HOST_FRAGMENT = "ep-bold-art-avjy5nt4";
const PRODUCT_SLUG = "bowling-1h";
const WEEKEND_DAYS = ["fri", "sat", "sun"];

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
  if (confirm !== "SYNC_WEEKEND_DAYS") {
    throw new Error("Pass --confirm SYNC_WEEKEND_DAYS.");
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

  const database = createPrismaClient(env.DATABASE_URL);
  try {
    const organization = await database.organization.findFirst({
      where: { slug },
      select: { id: true, name: true, slug: true },
    });
    if (!organization) {
      throw new Error(`No organization for slug "${slug}".`);
    }

    const product = await database.product.findFirst({
      where: { organizationId: organization.id, slug: PRODUCT_SLUG },
      select: { id: true, slug: true },
    });
    if (!product) {
      throw new Error(`Missing product ${PRODUCT_SLUG}.`);
    }

    const prices = await database.productPrice.findMany({
      where: {
        organizationId: organization.id,
        productId: product.id,
        strategy: PRODUCT_PRICE_STRATEGIES.PER_LANE_WEEKDAY_WEEKEND,
      },
    });
    if (prices.length !== 1) {
      throw new Error(`Expected one PER_LANE_WEEKDAY_WEEKEND row; found ${prices.length}.`);
    }
    const price = prices[0]!;

    const before = price.weekendDays;
    await database.productPrice.update({
      where: { id: price.id },
      data: { weekendDays: WEEKEND_DAYS },
    });
    const after = await database.productPrice.findFirstOrThrow({
      where: { id: price.id },
      select: {
        id: true,
        strategy: true,
        weekdayAmountCents: true,
        weekendAmountCents: true,
        shoeAddOnCents: true,
        weekendDays: true,
      },
    });

    console.log(
      JSON.stringify(
        {
          host,
          organizationId: organization.id,
          organizationSlug: organization.slug,
          productSlug: PRODUCT_SLUG,
          priceId: after.id,
          beforeWeekendDays: before,
          afterWeekendDays: after.weekendDays,
          weekdayAmountCents: after.weekdayAmountCents,
          weekendAmountCents: after.weekendAmountCents,
          shoeAddOnCents: after.shoeAddOnCents,
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
