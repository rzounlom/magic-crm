import type { PrismaClient } from "@/generated/prisma/client";

import { catalogPriceFromRow } from "@/server/catalog/pricing";
import { PRODUCT_QUANTITY_RULES } from "@/types/catalog";
import { resourcesInLocationWhere } from "@/server/resources/location-scope";
import {
  COVERAGE_KINDS,
  FOOD_INCLUSIONS,
  PARTICIPANT_RULES,
  type CoverageKind,
  type ExperienceGrant,
  type FoodInclusion,
} from "@/server/catalog/experience-coverage";
import type { LoadedCatalogProduct, LoadedRecommendationProfile } from "@/server/services/proposal-engine";
import type { CatalogResourceRequirementRow } from "@/server/catalog/requirements";
import type { RecommendationProfilePayload } from "@/types/catalog";

type CatalogDb = PrismaClient;

export async function loadCatalogForProposal(
  database: CatalogDb,
  organizationId: string,
  locationId?: string | null,
) {
  const resourceWhere = resourcesInLocationWhere(locationId);
  const [products, profiles, requirementRows] = await Promise.all([
    database.product.findMany({
      where: {
        organizationId,
        active: true,
        ...(locationId
          ? { OR: [{ locationId: null }, { locationId }] }
          : {}),
      },
      include: { prices: { where: { active: true } }, servings: true, experienceGrants: true },
      orderBy: { sortOrder: "asc" },
    }),
    database.recommendationProfile.findMany({
      where: { organizationId },
    }),
    database.productResourceRequirement.findMany({
      where: { organizationId },
      include: {
        product: { select: { name: true, active: true } },
        resourceType: {
          select: {
            id: true,
            slug: true,
            name: true,
            inventoryConfigured: true,
            active: true,
            _count: { select: { resources: { where: resourceWhere } } },
          },
        },
      },
    }),
  ]);

  const productsWithRequirements = new Set(requirementRows.map((row) => row.productId));
  const guestsPerUnitByProduct = new Map<string, number>();
  for (const row of requirementRows) {
    if (
      row.quantityRule === PRODUCT_QUANTITY_RULES.PER_GUESTS &&
      row.guestsPerUnit &&
      row.guestsPerUnit > 0 &&
      !guestsPerUnitByProduct.has(row.productId)
    ) {
      guestsPerUnitByProduct.set(row.productId, row.guestsPerUnit);
    }
  }

  const loadedProducts: LoadedCatalogProduct[] = products.map((product) => ({
    id: product.id,
    slug: product.slug,
    name: product.name,
    kind: product.kind,
    audience: product.audience,
    durationMinutes: product.durationMinutes,
    schedulingBehavior: product.schedulingBehavior,
    hasResourceRequirements: productsWithRequirements.has(product.id),
    minGuests: product.minGuests,
    maxGuests: product.maxGuests,
    weekendOnly: product.weekendOnly,
    fulfillmentGroup: product.fulfillmentGroup,
    prices: product.prices.map(catalogPriceFromRow),
    serving: product.servings[0]
      ? {
          servesMin: product.servings[0].servesMin,
          servesMax: product.servings[0].servesMax,
          unitCount: product.servings[0].unitCount,
        }
      : null,
    guestsPerUnit: guestsPerUnitByProduct.get(product.id) ?? null,
    experienceSessions: product.experienceGrants.find((grant) => grant.kind === COVERAGE_KINDS.ACTIVITY)?.sessionsPerParticipant ?? null,
    experienceGrants: product.experienceGrants.map((grant) => grantFromRow(grant)),
    foodInclusion: foodInclusionFromDeclarations(product.intakeDeclarations),
  }));

  const loadedProfiles: LoadedRecommendationProfile[] = profiles.map((row) => ({
    audience: row.audience,
    payload: row.payload as RecommendationProfilePayload,
  }));

  const resourceRequirements: CatalogResourceRequirementRow[] = requirementRows.flatMap((row) => {
    if (!row.product.active || !row.resourceType.active) {
      return [];
    }
    return [
      {
        productId: row.productId,
        productName: row.product.name,
        resourceTypeId: row.resourceType.id,
        resourceTypeSlug: row.resourceType.slug,
        resourceTypeName: row.resourceType.name,
        inventoryConfigured: row.resourceType.inventoryConfigured,
        activeCount: row.resourceType._count.resources,
        quantityRule: row.quantityRule,
        quantity: row.quantity,
        guestsPerUnit: row.guestsPerUnit,
        durationMinutes: row.durationMinutes,
        exclusive: row.exclusive,
        specificResourceId: row.resourceId,
        locationExclusive: row.quantityRule === PRODUCT_QUANTITY_RULES.LOCATION_EXCLUSIVE,
      },
    ];
  });

  return { products: loadedProducts, profiles: loadedProfiles, resourceRequirements };
}

function isCoverageKind(value: string): value is CoverageKind {
  return (
    value === COVERAGE_KINDS.ACTIVITY ||
    value === COVERAGE_KINDS.FOOD ||
    value === COVERAGE_KINDS.PLAY_CREDIT ||
    value === COVERAGE_KINDS.EQUIPMENT ||
    value === COVERAGE_KINDS.SPACE
  );
}

function foodInclusionFromDeclarations(value: unknown): FoodInclusion | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const foodInclusion = (value as { foodInclusion?: unknown }).foodInclusion;
  if (foodInclusion === FOOD_INCLUSIONS.NONE || foodInclusion === FOOD_INCLUSIONS.UNKNOWN) {
    return foodInclusion;
  }
  return null;
}

function grantFromRow(grant: {
  organizationId: string;
  experienceKey: string;
  kind: string;
  durationMinutesPerParticipant: number | null;
  sessionsPerParticipant: number | null;
  servings: number | null;
  participantRule: string;
  fixedParticipants: number | null;
  creditCents: number | null;
  simultaneousGuestCapacity: number | null;
  rotationMinutesPerParticipant: number | null;
  minAge: number | null;
  minWeightLbs: number | null;
  requiresParticipantBreakdown: boolean;
  optionalBenefit?: boolean;
}): ExperienceGrant {
  return {
    organizationId: grant.organizationId,
    experienceKey: grant.experienceKey,
    kind: isCoverageKind(grant.kind) ? grant.kind : COVERAGE_KINDS.ACTIVITY,
    durationMinutesPerParticipant: grant.durationMinutesPerParticipant,
    sessionsPerParticipant: grant.sessionsPerParticipant,
    servings: grant.servings,
    participantRule: grant.participantRule === PARTICIPANT_RULES.FIXED ? PARTICIPANT_RULES.FIXED : PARTICIPANT_RULES.ALL_GUESTS,
    fixedParticipants: grant.fixedParticipants,
    creditCents: grant.creditCents,
    simultaneousGuestCapacity: grant.simultaneousGuestCapacity,
    rotationMinutesPerParticipant: grant.rotationMinutesPerParticipant,
    minAge: grant.minAge,
    minWeightLbs: grant.minWeightLbs,
    requiresParticipantBreakdown: grant.requiresParticipantBreakdown,
    optionalBenefit: grant.optionalBenefit === true,
  };
}
