/**
 * Read-only preflight: bowling-1h weekendDays only for Generations CRM Test on DEV.
 * Exit 0 when the sole catalog↔DB delta is weekendDays (or already in sync).
 */
import { config } from "dotenv";

import { createPrismaClient } from "@/lib/db/create-client";
import { parseRuntimeEnv } from "@/lib/env/validation";
import { loadBookingCatalogDataset } from "@/server/catalog/load-dataset";
import { PRODUCT_PRICE_STRATEGIES } from "@/types/catalog";

const TARGET_SLUG = "generations-crm-test-1788129640704833684";
const DEV_HOST_FRAGMENT = "ep-bold-art-avjy5nt4";
const PRODUCT_SLUG = "bowling-1h";
const EXPECTED_WEEKEND_DAYS = ["fri", "sat", "sun"];

config();
config({ path: ".env.local", override: true });

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function stable(value: unknown): string {
  return JSON.stringify(value);
}

function normalizeDays(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length === 0) {
    return null;
  }
  return [...value].filter((entry): entry is string => typeof entry === "string").sort();
}

function priceCore(price: {
  strategy: string;
  amountCents: number;
  additionalGuestCents?: number | null;
  includedGuests?: number | null;
  includedHours?: number | null;
  additionalHourCents?: number | null;
  minGuests?: number | null;
  weekdayAmountCents?: number | null;
  weekendAmountCents?: number | null;
  daysOfWeek?: unknown;
  afterHour?: number | null;
  afterHourAmountCents?: number | null;
  shoeAddOnCents?: number | null;
  unitLabel?: string | null;
}) {
  return stable({
    strategy: price.strategy,
    amountCents: price.amountCents,
    additionalGuestCents: price.additionalGuestCents ?? null,
    includedGuests: price.includedGuests ?? null,
    includedHours: price.includedHours ?? null,
    additionalHourCents: price.additionalHourCents ?? null,
    minGuests: price.minGuests ?? null,
    weekdayAmountCents: price.weekdayAmountCents ?? null,
    weekendAmountCents: price.weekendAmountCents ?? null,
    daysOfWeek: price.daysOfWeek ?? null,
    afterHour: price.afterHour ?? null,
    afterHourAmountCents: price.afterHourAmountCents ?? null,
    shoeAddOnCents: price.shoeAddOnCents ?? null,
    unitLabel: price.unitLabel ?? null,
  });
}

async function main() {
  if (process.env.MAGICCRM_DATABASE_ROLE === "test") {
    throw new Error("Preflight refused: MAGICCRM_DATABASE_ROLE=test.");
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("Preflight refused: NODE_ENV=production.");
  }

  const slug = (arg("--slug") ?? TARGET_SLUG).trim().toLowerCase();
  if (slug !== TARGET_SLUG) {
    throw new Error(`Preflight refused: slug must be ${TARGET_SLUG}.`);
  }

  const env = parseRuntimeEnv(process.env);
  const host = new URL(env.DATABASE_URL).hostname;
  if (!host.includes(DEV_HOST_FRAGMENT)) {
    throw new Error(`Preflight refused: unexpected database host "${host}".`);
  }

  const dataset = loadBookingCatalogDataset();
  const fileProduct = dataset.products.find((row) => row.slug === PRODUCT_SLUG);
  if (!fileProduct) {
    throw new Error(`Catalog file missing ${PRODUCT_SLUG}.`);
  }
  const filePrice = fileProduct.prices.find(
    (row) => row.strategy === PRODUCT_PRICE_STRATEGIES.PER_LANE_WEEKDAY_WEEKEND,
  );
  if (!filePrice) {
    throw new Error(`Catalog file missing PER_LANE_WEEKDAY_WEEKEND on ${PRODUCT_SLUG}.`);
  }
  const fileWeekendDays = normalizeDays(filePrice.weekendDays ?? EXPECTED_WEEKEND_DAYS);
  if (stable(fileWeekendDays) !== stable([...EXPECTED_WEEKEND_DAYS].sort())) {
    throw new Error(`Catalog file weekendDays unexpected: ${stable(fileWeekendDays)}`);
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
      include: { prices: true, experienceGrants: true },
    });
    if (!product) {
      throw new Error(`Database missing product ${PRODUCT_SLUG}.`);
    }

    const lanePrices = product.prices.filter(
      (row) => row.strategy === PRODUCT_PRICE_STRATEGIES.PER_LANE_WEEKDAY_WEEKEND,
    );
    if (lanePrices.length !== 1) {
      throw new Error(`Expected exactly one PER_LANE_WEEKDAY_WEEKEND row; found ${lanePrices.length}.`);
    }
    const dbPrice = lanePrices[0]!;
    const coreMatch = priceCore(dbPrice) === priceCore(filePrice);
    const dbWeekendDays = normalizeDays(dbPrice.weekendDays);
    const weekendDaysMatch = stable(dbWeekendDays) === stable(fileWeekendDays);
    const otherPriceDiffs = product.prices
      .filter((row) => row.strategy !== PRODUCT_PRICE_STRATEGIES.PER_LANE_WEEKDAY_WEEKEND)
      .flatMap((row) => {
        const matching = fileProduct.prices.find((price) => price.strategy === row.strategy);
        if (!matching || priceCore(row) !== priceCore(matching)) {
          return [{ strategy: row.strategy, detail: "non-lane price differs" }];
        }
        return [];
      });

    const blockers: string[] = [];
    if (!coreMatch) {
      blockers.push("bowling lane price core fields differ beyond weekendDays");
    }
    if (otherPriceDiffs.length > 0) {
      blockers.push("other bowling price rows differ");
    }

    const syncNeeded = !weekendDaysMatch;
    const safe = blockers.length === 0;
    const report = {
      host,
      organizationId: organization.id,
      organizationSlug: organization.slug,
      productSlug: PRODUCT_SLUG,
      priceId: dbPrice.id,
      dbWeekendDays,
      fileWeekendDays,
      weekendDaysMatch,
      syncNeeded,
      syncAllowed: safe && syncNeeded,
      alreadySynced: safe && !syncNeeded,
      blockers,
      grantCount: product.experienceGrants.length,
    };
    console.log(JSON.stringify(report, null, 2));
    if (!safe) {
      process.exitCode = 2;
    }
  } finally {
    await database.$disconnect();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
