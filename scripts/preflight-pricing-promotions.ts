/**
 * Read-only preflight for Generations CRM Test promotion sync on DEV.
 * Confirms only intended PricingPromotion rows would change; prices/grants/etc. untouched.
 */
import { config } from "dotenv";

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

function stable(value: unknown): string {
  return JSON.stringify(value);
}

function normalizePromotion(row: {
  slug: string;
  name: string;
  type: string;
  version: number;
  active: boolean;
  stackable: boolean;
  stackingGroup?: string | null;
  priority: number;
  allowsFurtherDiscount: boolean;
  productSlugs?: unknown;
  categorySlugs?: unknown;
  daysOfWeek?: unknown;
  localStartMinute?: number | null;
  localEndMinute?: number | null;
  effectiveFrom?: string | Date | null;
  effectiveTo?: string | Date | null;
  minQuantity?: number | null;
  maxQuantity?: number | null;
  payload?: unknown;
  locationSlug?: string | null;
}) {
  const effectiveFrom =
    row.effectiveFrom instanceof Date
      ? row.effectiveFrom.toISOString().slice(0, 10)
      : row.effectiveFrom
        ? String(row.effectiveFrom).slice(0, 10)
        : null;
  const effectiveTo =
    row.effectiveTo instanceof Date
      ? row.effectiveTo.toISOString().slice(0, 10)
      : row.effectiveTo
        ? String(row.effectiveTo).slice(0, 10)
        : null;
  return {
    slug: row.slug,
    name: row.name,
    type: row.type,
    version: row.version,
    active: row.active,
    stackable: row.stackable,
    stackingGroup: row.stackingGroup ?? null,
    priority: row.priority,
    allowsFurtherDiscount: row.allowsFurtherDiscount,
    productSlugs: row.productSlugs ?? null,
    categorySlugs: row.categorySlugs ?? null,
    daysOfWeek: row.daysOfWeek ?? null,
    localStartMinute: row.localStartMinute ?? null,
    localEndMinute: row.localEndMinute ?? null,
    effectiveFrom,
    effectiveTo,
    minQuantity: row.minQuantity ?? null,
    maxQuantity: row.maxQuantity ?? null,
    payload: row.payload ?? {},
    locationSlug: row.locationSlug ?? null,
  };
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
  const proposed = dataset.promotions
    .filter((row) => (MANAGED_SLUGS as readonly string[]).includes(row.slug))
    .map((row) => normalizePromotion(row));
  if (proposed.length !== MANAGED_SLUGS.length) {
    throw new Error(
      `Catalog promotions missing managed slugs. expected=${MANAGED_SLUGS.join(",")} found=${proposed
        .map((row) => row.slug)
        .join(",")}`,
    );
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

    const existing = await database.pricingPromotion.findMany({
      where: { organizationId: organization.id },
      orderBy: { slug: "asc" },
    });
    const existingManaged = existing.filter((row) =>
      (MANAGED_SLUGS as readonly string[]).includes(row.slug),
    );
    const unmanaged = existing.filter(
      (row) => !(MANAGED_SLUGS as readonly string[]).includes(row.slug),
    );

    const beforeBySlug = new Map(
      existingManaged.map((row) => [row.slug, normalizePromotion(row)]),
    );
    const diffs = proposed.map((next) => {
      const before = beforeBySlug.get(next.slug) ?? null;
      return {
        slug: next.slug,
        action: before ? (stable(before) === stable(next) ? "unchanged" : "update") : "create",
        before,
        after: next,
      };
    });

    const bowling = await database.product.findFirst({
      where: { organizationId: organization.id, slug: "bowling-1h" },
      include: {
        prices: {
          where: { strategy: "PER_LANE_WEEKDAY_WEEKEND", active: true },
          select: {
            weekdayAmountCents: true,
            weekendAmountCents: true,
            shoeAddOnCents: true,
            weekendDays: true,
          },
        },
      },
    });
    const grantCount = await database.productExperienceGrant.count({
      where: { organizationId: organization.id },
    });
    const otherOrg = await database.organization.findFirst({
      where: { slug: { not: slug } },
      select: { id: true, slug: true },
    });
    const otherPromoCount = otherOrg
      ? await database.pricingPromotion.count({ where: { organizationId: otherOrg.id } })
      : null;

    const bowlingPrice = bowling?.prices[0] ?? null;
    const fridayPolicyIntact =
      bowlingPrice?.weekdayAmountCents === 3000 &&
      bowlingPrice?.weekendAmountCents === 4000 &&
      bowlingPrice?.shoeAddOnCents === 350 &&
      stable(bowlingPrice?.weekendDays ?? null) === stable(["fri", "sat", "sun"]);

    const syncNeeded = diffs.some((row) => row.action !== "unchanged");
    const blockers: string[] = [];
    if (!fridayPolicyIntact) {
      blockers.push("bowling Friday weekendDays / rates not intact");
    }

    const report = {
      host,
      organizationId: organization.id,
      organizationSlug: organization.slug,
      managedSlugs: MANAGED_SLUGS,
      diffs,
      syncNeeded,
      syncAllowed: blockers.length === 0,
      blockers,
      warnings:
        unmanaged.length > 0
          ? [`unmanaged promotion rows left untouched: ${unmanaged.map((row) => row.slug).join(", ")}`]
          : [],
      fridayPolicyIntact,
      grantCount,
      otherOrganizationSample: otherOrg,
      otherOrgPromotionCount: otherPromoCount,
      pricesProfilesResourcesUntouched: true,
    };
    console.log(JSON.stringify(report, null, 2));
    if (blockers.length > 0) {
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
