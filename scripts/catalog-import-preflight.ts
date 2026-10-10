/**
 * Read-only catalog import preflight for a single development tenant.
 * Does not write. Exit 0 when the diff is limited to intended grant/profile changes.
 */
import { config } from "dotenv";

import { createPrismaClient } from "@/lib/db/create-client";
import { parseRuntimeEnv } from "@/lib/env/validation";
import { loadBookingCatalogDataset } from "@/server/catalog/load-dataset";

const TARGET_SLUG = "generations-crm-test-1788129640704833684";
const DEV_HOST_FRAGMENT = "ep-bold-art-avjy5nt4";

config();
config({ path: ".env.local", override: true });

type DiffEntry = {
  area: string;
  slug?: string;
  detail: string;
};

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function stable(value: unknown): string {
  return JSON.stringify(value);
}

function priceKey(price: {
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

function grantKey(grant: {
  experienceKey: string;
  kind: string;
  durationMinutesPerParticipant?: number | null;
  sessionsPerParticipant?: number | null;
  servings?: number | null;
  participantRule?: string | null;
  fixedParticipants?: number | null;
  creditCents?: number | null;
  simultaneousGuestCapacity?: number | null;
  rotationMinutesPerParticipant?: number | null;
  minAge?: number | null;
  minWeightLbs?: number | null;
  requiresParticipantBreakdown?: boolean | null;
  optionalBenefit?: boolean | null;
}) {
  return stable({
    experienceKey: grant.experienceKey,
    kind: grant.kind,
    durationMinutesPerParticipant: grant.durationMinutesPerParticipant ?? null,
    sessionsPerParticipant: grant.sessionsPerParticipant ?? null,
    servings: grant.servings ?? null,
    participantRule: grant.participantRule ?? "ALL_GUESTS",
    fixedParticipants: grant.fixedParticipants ?? null,
    creditCents: grant.creditCents ?? null,
    simultaneousGuestCapacity: grant.simultaneousGuestCapacity ?? null,
    rotationMinutesPerParticipant: grant.rotationMinutesPerParticipant ?? null,
    minAge: grant.minAge ?? null,
    minWeightLbs: grant.minWeightLbs ?? null,
    requiresParticipantBreakdown: grant.requiresParticipantBreakdown ?? false,
    optionalBenefit: grant.optionalBenefit ?? false,
  });
}

function requirementKey(row: {
  resourceTypeSlug: string;
  quantityRule: string;
  quantity?: number | null;
  guestsPerUnit?: number | null;
  durationMinutes?: number | null;
  exclusive?: boolean | null;
}) {
  return stable({
    resourceTypeSlug: row.resourceTypeSlug,
    quantityRule: row.quantityRule,
    quantity: row.quantity ?? null,
    guestsPerUnit: row.guestsPerUnit ?? null,
    durationMinutes: row.durationMinutes ?? null,
    exclusive: row.exclusive ?? false,
  });
}

function isAllowedGrantOnlyDiff(entries: DiffEntry[]): boolean {
  return entries.every((entry) => entry.area === "grants" || entry.area === "profile-mixed-allowed");
}

function mixedProfileAllowed(existing: unknown, next: unknown): boolean {
  if (!existing || typeof existing !== "object" || !next || typeof next !== "object") {
    return false;
  }
  const left = existing as Record<string, unknown>;
  const right = next as Record<string, unknown>;
  const leftClone = structuredClone(left);
  const rightClone = structuredClone(right);
  delete leftClone.requireExplicitAttractions;
  delete rightClone.requireExplicitAttractions;
  delete leftClone.defaultAttractionSlugs;
  delete rightClone.defaultAttractionSlugs;
  const leftComp = leftClone.composition as { tiers?: Record<string, { coreAttractionSlugs?: string[] }> } | undefined;
  const rightComp = rightClone.composition as { tiers?: Record<string, { coreAttractionSlugs?: string[] }> } | undefined;
  if (leftComp?.tiers && rightComp?.tiers) {
    for (const key of ["good", "better", "best"] as const) {
      if (leftComp.tiers[key]) {
        leftComp.tiers[key] = { ...leftComp.tiers[key], coreAttractionSlugs: [] };
      }
      if (rightComp.tiers[key]) {
        rightComp.tiers[key] = { ...rightComp.tiers[key], coreAttractionSlugs: [] };
      }
    }
  }
  return stable(leftClone) === stable(rightClone);
}

async function main() {
  if (process.env.MAGICCRM_DATABASE_ROLE === "test") {
    throw new Error("Preflight refused: MAGICCRM_DATABASE_ROLE=test.");
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("Preflight refused: NODE_ENV=production.");
  }

  const slug = (arg("--slug") ?? TARGET_SLUG).trim().toLowerCase();
  const env = parseRuntimeEnv(process.env);
  const host = new URL(env.DATABASE_URL).hostname;
  if (!host.includes(DEV_HOST_FRAGMENT)) {
    throw new Error(`Preflight refused: unexpected database host "${host}".`);
  }

  const dataset = loadBookingCatalogDataset();
  const database = createPrismaClient(env.DATABASE_URL);
  try {
    const organization = await database.organization.findFirst({
      where: { slug },
      select: { id: true, name: true, slug: true, depositPercent: true },
    });
    if (!organization) {
      throw new Error(`No organization for slug "${slug}".`);
    }
    if (organization.slug !== TARGET_SLUG) {
      throw new Error(`Preflight refused: slug "${organization.slug}" is not the disposable Generations CRM Test tenant.`);
    }

    const location = await database.location.findFirst({
      where: { organizationId: organization.id },
      select: { id: true, name: true },
      orderBy: { createdAt: "asc" },
    });

    const products = await database.product.findMany({
      where: { organizationId: organization.id },
      include: {
        prices: true,
        resourceRequirements: { include: { resourceType: { select: { slug: true } } } },
        servings: true,
        experienceGrants: true,
        category: { select: { slug: true } },
      },
    });
    const profiles = await database.recommendationProfile.findMany({
      where: { organizationId: organization.id },
    });
    const resourceTypes = await database.resourceType.findMany({
      where: { organizationId: organization.id },
      include: { _count: { select: { resources: { where: { active: true } } } } },
    });

    const diffs: DiffEntry[] = [];
    const bySlug = new Map(products.map((row) => [row.slug, row]));

    for (const product of dataset.products) {
      const existing = bySlug.get(product.slug);
      if (!existing) {
        diffs.push({ area: "product-missing", slug: product.slug, detail: "present in file, absent in database" });
        continue;
      }
      if (
        existing.name !== product.name ||
        existing.kind !== product.kind ||
        existing.audience !== product.audience ||
        existing.shortDescription !== (product.shortDescription ?? null) ||
        existing.durationMinutes !== (product.durationMinutes ?? null) ||
        existing.schedulingBehavior !== (product.schedulingBehavior ?? null) ||
        existing.minGuests !== (product.minGuests ?? null) ||
        existing.maxGuests !== (product.maxGuests ?? null) ||
        existing.weekendOnly !== product.weekendOnly ||
        existing.fulfillmentGroup !== (product.fulfillmentGroup ?? null) ||
        existing.category.slug !== product.categorySlug
      ) {
        diffs.push({ area: "product-fields", slug: product.slug, detail: "product scalar fields differ" });
      }

      const dbPrices = [...existing.prices].map(priceKey).sort();
      const filePrices = product.prices.map(priceKey).sort();
      if (stable(dbPrices) !== stable(filePrices)) {
        diffs.push({ area: "prices", slug: product.slug, detail: "price rows differ" });
      }

      const dbReqs = existing.resourceRequirements
        .map((row) =>
          requirementKey({
            resourceTypeSlug: row.resourceType.slug,
            quantityRule: row.quantityRule,
            quantity: row.quantity,
            guestsPerUnit: row.guestsPerUnit,
            durationMinutes: row.durationMinutes,
            exclusive: row.exclusive,
          }),
        )
        .sort();
      const fileReqs = (product.requirements ?? []).map(requirementKey).sort();
      if (stable(dbReqs) !== stable(fileReqs)) {
        diffs.push({ area: "requirements", slug: product.slug, detail: "resource requirements differ" });
      }

      const dbServing = existing.servings[0]
        ? stable({
            servesMin: existing.servings[0].servesMin,
            servesMax: existing.servings[0].servesMax,
            unitCount: existing.servings[0].unitCount,
          })
        : null;
      const fileServing = product.serving
        ? stable({
            servesMin: product.serving.servesMin,
            servesMax: product.serving.servesMax,
            unitCount: product.serving.unitCount ?? null,
          })
        : null;
      if (dbServing !== fileServing) {
        diffs.push({ area: "servings", slug: product.slug, detail: "serving rows differ" });
      }

      const dbGrants = existing.experienceGrants.map(grantKey).sort();
      const fileGrants = (product.coverage ?? []).map(grantKey).sort();
      if (stable(dbGrants) !== stable(fileGrants)) {
        diffs.push({
          area: "grants",
          slug: product.slug,
          detail: `grants db=${dbGrants.length} file=${fileGrants.length}`,
        });
      }
    }

    for (const type of dataset.resourceTypes) {
      const existing = resourceTypes.find((row) => row.slug === type.slug);
      if (!existing) {
        diffs.push({ area: "resource-type", slug: type.slug, detail: "missing in database" });
        continue;
      }
      if (existing._count.resources !== type.count) {
        diffs.push({
          area: "resource-type",
          slug: type.slug,
          detail: `active resource count db=${existing._count.resources} file=${type.count}`,
        });
      }
    }

    for (const profile of dataset.recommendationProfiles) {
      const existing = profiles.find((row) => row.audience === profile.audience);
      if (!existing) {
        diffs.push({ area: "profile", slug: profile.audience, detail: "missing in database" });
        continue;
      }
      if (stable(existing.payload) === stable(profile.payload)) {
        continue;
      }
      if (profile.audience === "MIXED" && mixedProfileAllowed(existing.payload, profile.payload)) {
        diffs.push({
          area: "profile-mixed-allowed",
          slug: profile.audience,
          detail: "mixed explicit-attraction policy differs within allowed fields",
        });
        continue;
      }
      diffs.push({ area: "profile", slug: profile.audience, detail: "recommendation profile payload differs" });
    }

    if (
      dataset.depositPercent != null &&
      organization.depositPercent !== dataset.depositPercent
    ) {
      diffs.push({
        area: "deposit",
        detail: `depositPercent db=${organization.depositPercent} file=${dataset.depositPercent}`,
      });
    }

    const otherOrg = await database.organization.findFirst({
      where: { slug: { not: slug } },
      select: { id: true, slug: true, name: true },
    });

    const safe = diffs.length === 0 || isAllowedGrantOnlyDiff(diffs);
    const report = {
      host,
      organizationId: organization.id,
      organizationName: organization.name,
      organizationSlug: organization.slug,
      locationId: location?.id ?? null,
      locationName: location?.name ?? null,
      otherOrganizationSample: otherOrg,
      diffCount: diffs.length,
      diffs,
      importAllowed: safe,
      datasetProductCount: dataset.products.length,
      datasetGrantProducts: dataset.products.filter((row) => (row.coverage?.length ?? 0) > 0).map((row) => row.slug),
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
