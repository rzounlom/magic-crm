import { Prisma, type PrismaClient } from "@/generated/prisma/client";

import {
  emptySlugAction,
  sameJson,
  type CatalogImportDiff,
  type CatalogSlugAction,
} from "@/server/catalog/catalog-import-diff";
import type { BookingCatalogDataset } from "@/server/catalog/dataset";
import { validateCatalogProductRequirements } from "@/server/catalog/requirement-validation";
import { resolvePrimaryLocationId } from "@/server/locations/primary-location";
import { RESOURCE_SCHEDULING_MODES } from "@/types/resource-schedule";

export type { CatalogImportDiff } from "@/server/catalog/catalog-import-diff";
export { formatCatalogImportReport } from "@/server/catalog/catalog-import-diff";

type ImportDb = PrismaClient;
type CatalogStore = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;

export type CatalogImportCounts = {
  categoriesCreated: number;
  categoriesUpdated: number;
  categoriesUnchanged: number;
  productsCreated: number;
  productsUpdated: number;
  productsUnchanged: number;
  resourceTypesCreated: number;
  resourceTypesUpdated: number;
  resourceTypesUnchanged: number;
  resourcesCreated: number;
  resourcesUnchanged: number;
  profilesCreated: number;
  profilesUpdated: number;
  profilesUnchanged: number;
  interestsCreated: number;
  interestsUpdated: number;
  interestsUnchanged: number;
};

export type CatalogImportResult = CatalogImportCounts & CatalogImportDiff & {
  dryRun: boolean;
  applied: boolean;
};

export type CatalogImportInput = {
  organizationSlug: string;
  dataset: BookingCatalogDataset;
  dryRun?: boolean;
  /** Test-only hook. Throws inside the write transaction so the import rolls back. */
  interruptAfterStep?: string;
};

const TRANSACTION_TIMEOUT_MS = 120_000;
const TRANSACTION_WAIT_MS = 20_000;

function normalizeSlug(value: string): string {
  return value.trim().toLowerCase();
}

function countsFrom(diff: CatalogImportDiff): CatalogImportCounts {
  return {
    categoriesCreated: diff.categories.created.length,
    categoriesUpdated: diff.categories.updated.length,
    categoriesUnchanged: diff.categories.unchanged.length,
    productsCreated: diff.products.created.length,
    productsUpdated: diff.products.updated.length,
    productsUnchanged: diff.products.unchanged.length,
    resourceTypesCreated: diff.resourceTypes.created.length,
    resourceTypesUpdated: diff.resourceTypes.updated.length,
    resourceTypesUnchanged: diff.resourceTypes.unchanged.length,
    resourcesCreated: diff.resourcesCreated,
    resourcesUnchanged: diff.resourcesUnchanged,
    profilesCreated: diff.profiles.created.length,
    profilesUpdated: diff.profiles.updated.length,
    profilesUnchanged: diff.profiles.unchanged.length,
    interestsCreated: diff.interests.created.length,
    interestsUpdated: diff.interests.updated.length,
    interestsUnchanged: diff.interests.unchanged.length,
  };
}

function resultFrom(diff: CatalogImportDiff, dryRun: boolean, applied: boolean): CatalogImportResult {
  return { ...countsFrom(diff), ...diff, dryRun, applied };
}

async function maybeInterrupt(step: string, interruptAfterStep?: string): Promise<void> {
  if (interruptAfterStep && interruptAfterStep === step) {
    throw new Error(`Catalog import interrupted after "${step}".`);
  }
}

/**
 * Tenant-scoped catalog synchronization.
 *
 * Import-owned records are those whose slug (or profile audience) appears in the
 * dataset. Tenant-managed records — extra products, prices, requirements,
 * profiles, promotions, and interests — are never deleted, deactivated, or
 * rebuilt. Child pricing/requirement rows are replaced only for dataset products
 * whose children actually differ.
 */
export async function importBookingCatalog(
  database: ImportDb,
  input: CatalogImportInput,
): Promise<CatalogImportResult> {
  const slug = normalizeSlug(input.organizationSlug);
  if (!slug) {
    throw new Error("Organization slug is required.");
  }

  if (input.dryRun) {
    const diff = await planCatalogImport(database, slug, input.dataset);
    return resultFrom(diff, true, false);
  }

  return database.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM organizations WHERE slug = ${slug} FOR UPDATE`;
      const diff = await planCatalogImport(tx, slug, input.dataset);
      await applyCatalogImport(tx, input.dataset, diff, input.interruptAfterStep);
      return resultFrom(diff, false, true);
    },
    { timeout: TRANSACTION_TIMEOUT_MS, maxWait: TRANSACTION_WAIT_MS },
  );
}

async function planCatalogImport(
  database: CatalogStore,
  slug: string,
  dataset: BookingCatalogDataset,
): Promise<CatalogImportDiff> {
  const organization = await database.organization.findFirst({
    where: { slug },
    select: { id: true, name: true, slug: true, depositPercent: true },
  });
  if (!organization) {
    throw new Error(`No organization found for slug "${slug}".`);
  }

  const organizationId = organization.id;
  const locationId = await resolvePrimaryLocationId(database, organizationId);
  const datasetProductSlugs = new Set(dataset.products.map((row) => row.slug));
  const datasetProfileAudiences = new Set(dataset.recommendationProfiles.map((row) => row.audience));
  const datasetInterestSlugs = new Set((dataset.attractionInterests ?? []).map((row) => row.slug));
  const datasetPromotionSlugs = new Set((dataset.promotions ?? []).map((row) => row.slug));

  const [
    existingCategories,
    existingTypes,
    existingProducts,
    existingProfiles,
    existingInterests,
    existingPromotions,
    existingPrices,
    existingRequirements,
    existingServings,
    existingGrants,
  ] = await Promise.all([
    database.productCategory.findMany({ where: { organizationId } }),
    database.resourceType.findMany({
      where: { organizationId },
      include: { resources: { select: { id: true, name: true, displayOrder: true, locationId: true, capacity: true, active: true } } },
    }),
    database.product.findMany({ where: { organizationId } }),
    database.recommendationProfile.findMany({ where: { organizationId } }),
    database.attractionInterest.findMany({
      where: { organizationId },
      include: { products: { select: { productId: true, sortOrder: true } } },
    }),
    database.pricingPromotion.findMany({ where: { organizationId } }),
    database.productPrice.findMany({ where: { organizationId } }),
    database.productResourceRequirement.findMany({ where: { organizationId } }),
    database.productServing.findMany({ where: { organizationId } }),
    database.productExperienceGrant.findMany({ where: { organizationId } }),
  ]);

  const categoryBySlug = new Map(existingCategories.map((row) => [row.slug, row]));
  const typeBySlug = new Map(existingTypes.map((row) => [row.slug, row]));
  const productBySlug = new Map(existingProducts.map((row) => [row.slug, row]));
  const profileByAudience = new Map(existingProfiles.map((row) => [row.audience, row]));
  const interestBySlug = new Map(existingInterests.map((row) => [row.slug, row]));
  const promotionBySlug = new Map(existingPromotions.map((row) => [row.slug, row]));
  const pricesByProduct = groupBy(existingPrices, (row) => row.productId);
  const requirementsByProduct = groupBy(existingRequirements, (row) => row.productId);
  const servingsByProduct = groupBy(existingServings, (row) => row.productId);
  const grantsByProduct = groupBy(existingGrants, (row) => row.productId);

  const categories = classify(dataset.categories, categoryBySlug, (row, existing) => {
    return existing.name === row.name && existing.sortOrder === row.sortOrder;
  }, (row) => row.slug);
  const resourceTypes = classify(dataset.resourceTypes, typeBySlug, (row, existing) => {
    const schedulingMode =
      row.schedulingMode === RESOURCE_SCHEDULING_MODES.CONTINUOUS
        ? RESOURCE_SCHEDULING_MODES.CONTINUOUS
        : RESOURCE_SCHEDULING_MODES.SLOTTED;
    return existing.name === row.name && existing.schedulingMode === schedulingMode;
  }, (row) => row.slug);

  let resourcesCreated = 0;
  let resourcesUnchanged = 0;
  for (const type of dataset.resourceTypes) {
    const existing = typeBySlug.get(type.slug);
    const existingOrders = new Set(existing?.resources.map((row) => row.displayOrder) ?? []);
    for (let order = 1; order <= type.count; order += 1) {
      if (existingOrders.has(order)) {
        resourcesUnchanged += 1;
      } else {
        resourcesCreated += 1;
      }
    }
  }

  const products = emptySlugAction();
  const pricing = emptySlugAction();
  const requirements = emptySlugAction();
  const servings = emptySlugAction();
  const grants = emptySlugAction();
  const scopedReplacements: string[] = [];

  const plannedCategoryIds = new Map(existingCategories.map((row) => [row.slug, row.id]));
  for (const category of dataset.categories) {
    if (!plannedCategoryIds.has(category.slug)) {
      plannedCategoryIds.set(category.slug, `planned:${category.slug}`);
    }
  }

  const plannedTypeIds = new Map(existingTypes.map((row) => [row.slug, row.id]));
  for (const type of dataset.resourceTypes) {
    if (!plannedTypeIds.has(type.slug)) {
      plannedTypeIds.set(type.slug, `planned:${type.slug}`);
    }
  }

  const inventoryBySlug = buildInventoryMap(existingTypes, dataset.resourceTypes, locationId);

  for (const [index, product] of dataset.products.entries()) {
    const existing = productBySlug.get(product.slug);
    const categoryId = plannedCategoryIds.get(product.categorySlug);
    if (!categoryId) {
      throw new Error(`Unknown category slug "${product.categorySlug}" for product "${product.slug}".`);
    }
    const nextDeclarations = product.intakeDeclarations ?? null;
    const productUnchanged =
      existing != null &&
      existing.name === product.name &&
      existing.kind === product.kind &&
      existing.audience === product.audience &&
      existing.shortDescription === (product.shortDescription ?? null) &&
      existing.durationMinutes === (product.durationMinutes ?? null) &&
      existing.schedulingBehavior === (product.schedulingBehavior ?? null) &&
      existing.minGuests === (product.minGuests ?? null) &&
      existing.maxGuests === (product.maxGuests ?? null) &&
      existing.weekendOnly === product.weekendOnly &&
      existing.fulfillmentGroup === (product.fulfillmentGroup ?? null) &&
      sameJson(existing.intakeDeclarations ?? null, nextDeclarations) &&
      existing.categoryId === categoryId &&
      existing.sortOrder === index &&
      existing.active === true;
    if (!existing) {
      products.created.push(product.slug);
    } else if (productUnchanged) {
      products.unchanged.push(product.slug);
    } else {
      products.updated.push(product.slug);
    }

    const resolved = validateCatalogProductRequirements({
      productSlug: product.slug,
      requirements: product.requirements ?? [],
      inventoryBySlug,
      locationId,
    });
    const desiredPrices = (product.prices ?? []).map(normalizePriceInput);
    const desiredRequirements = (product.requirements ?? []).map((requirement) => {
      const resourceTypeId = plannedTypeIds.get(requirement.resourceTypeSlug);
      if (!resourceTypeId) {
        throw new Error(`Unknown resource type slug "${requirement.resourceTypeSlug}".`);
      }
      return {
        resourceTypeId,
        quantityRule: requirement.quantityRule,
        quantity: requirement.quantity ?? null,
        guestsPerUnit: requirement.guestsPerUnit ?? null,
        durationMinutes: requirement.durationMinutes ?? null,
        exclusive: requirement.exclusive ?? false,
        resourceId: resolved.find((row) => row.resourceTypeSlug === requirement.resourceTypeSlug)?.resourceId ?? null,
      };
    });
    const desiredServing = product.serving
      ? {
          servesMin: product.serving.servesMin,
          servesMax: product.serving.servesMax,
          unitCount: product.serving.unitCount ?? null,
        }
      : null;
    const desiredGrants = (product.coverage ?? []).map(normalizeGrantInput);

    classifyChildren(pricing, product.slug, existing ? pricesByProduct.get(existing.id) ?? [] : [], desiredPrices, normalizeStoredPrice);
    classifyChildren(
      requirements,
      product.slug,
      existing ? requirementsByProduct.get(existing.id) ?? [] : [],
      desiredRequirements,
      normalizeStoredRequirement,
    );
    classifyChildren(
      servings,
      product.slug,
      existing ? servingsByProduct.get(existing.id) ?? [] : [],
      desiredServing ? [desiredServing] : [],
      normalizeStoredServing,
    );
    classifyChildren(
      grants,
      product.slug,
      existing ? grantsByProduct.get(existing.id) ?? [] : [],
      desiredGrants,
      normalizeStoredGrant,
    );

    if (pricing.updated.includes(product.slug)) {
      scopedReplacements.push(`Replace prices for product "${product.slug}" only`);
    }
    if (requirements.updated.includes(product.slug)) {
      scopedReplacements.push(`Replace requirements for product "${product.slug}" only`);
    }
    if (servings.updated.includes(product.slug)) {
      scopedReplacements.push(`Replace serving for product "${product.slug}" only`);
    }
    if (grants.updated.includes(product.slug)) {
      scopedReplacements.push(`Replace grants for product "${product.slug}" only`);
    }
  }

  for (const product of existingProducts) {
    if (!datasetProductSlugs.has(product.slug)) {
      products.preserved.push(product.slug);
      pricing.preserved.push(product.slug);
      requirements.preserved.push(product.slug);
      servings.preserved.push(product.slug);
      grants.preserved.push(product.slug);
    }
  }

  const profiles = classify(dataset.recommendationProfiles, profileByAudience, (row, existing) => {
    return sameJson(existing.payload, row.payload);
  }, (row) => row.audience);
  for (const profile of existingProfiles) {
    if (!datasetProfileAudiences.has(profile.audience)) {
      profiles.preserved.push(profile.audience);
    }
  }

  const interests = classify(dataset.attractionInterests ?? [], interestBySlug, (row, existing) => {
    const existingLinks = [...existing.products]
      .sort((left, right) => left.sortOrder - right.sortOrder)
      .map((link) => link.productId);
    const desiredLinks = row.productSlugs.map((productSlug) => productBySlug.get(productSlug)?.id ?? `planned:${productSlug}`);
    return (
      existing.label === row.label &&
      existing.description === (row.description ?? null) &&
      existing.active === row.active &&
      existing.displayOrder === row.displayOrder &&
      sameJson(existingLinks, desiredLinks)
    );
  }, (row) => row.slug);
  for (const interest of existingInterests) {
    if (!datasetInterestSlugs.has(interest.slug)) {
      interests.preserved.push(interest.slug);
    }
  }

  const locations = await database.location.findMany({
    where: { organizationId },
    select: { id: true, slug: true },
  });
  const locationIds = new Map(locations.map((row) => [row.slug, row.id]));
  const promotions = classify(dataset.promotions ?? [], promotionBySlug, (row, existing) => {
    return sameJson(normalizeStoredPromotion(existing), normalizePromotionInput(row, locationIds));
  }, (row) => row.slug);
  for (const promotion of existingPromotions) {
    if (!datasetPromotionSlugs.has(promotion.slug)) {
      promotions.preserved.push(promotion.slug);
    }
  }

  const nextDeposit = dataset.depositPercent ?? null;
  return {
    organizationId,
    organizationName: organization.name,
    organizationSlug: organization.slug,
    depositPercent: {
      from: organization.depositPercent,
      to: nextDeposit,
      action: nextDeposit != null && nextDeposit !== organization.depositPercent ? "update" : "unchanged",
    },
    categories,
    products,
    pricing,
    requirements,
    servings,
    grants,
    resourceTypes,
    resourcesCreated,
    resourcesUnchanged,
    profiles,
    interests,
    promotions,
    scopedReplacements,
    ambiguities: dataset.ambiguities,
  };
}

async function applyCatalogImport(
  database: CatalogStore,
  dataset: BookingCatalogDataset,
  diff: CatalogImportDiff,
  interruptAfterStep?: string,
): Promise<void> {
  const organizationId = diff.organizationId;
  const locationId = await resolvePrimaryLocationId(database, organizationId);

  if (diff.depositPercent.action === "update" && diff.depositPercent.to != null) {
    await database.organization.update({
      where: { id: organizationId },
      data: { depositPercent: diff.depositPercent.to },
    });
    await maybeInterrupt("deposit", interruptAfterStep);
  }

  const existingCategories = await database.productCategory.findMany({ where: { organizationId } });
  const categoryBySlug = new Map(existingCategories.map((row) => [row.slug, row]));
  const categoriesToCreate = dataset.categories.filter((row) => !categoryBySlug.has(row.slug));
  if (categoriesToCreate.length > 0) {
    await database.productCategory.createMany({
      data: categoriesToCreate.map((category) => ({
        organizationId,
        slug: category.slug,
        name: category.name,
        sortOrder: category.sortOrder,
      })),
    });
  }
  for (const category of dataset.categories) {
    const existing = categoryBySlug.get(category.slug);
    if (!existing || (existing.name === category.name && existing.sortOrder === category.sortOrder)) {
      continue;
    }
    await database.productCategory.update({
      where: { id: existing.id },
      data: { name: category.name, sortOrder: category.sortOrder },
    });
  }
  await maybeInterrupt("categories", interruptAfterStep);

  const existingTypes = await database.resourceType.findMany({
    where: { organizationId },
    include: { resources: { select: { displayOrder: true, name: true, id: true, locationId: true } } },
  });
  const typeBySlug = new Map(existingTypes.map((row) => [row.slug, row]));
  const typesToCreate = dataset.resourceTypes.filter((row) => !typeBySlug.has(row.slug));
  if (typesToCreate.length > 0) {
    await database.resourceType.createMany({
      data: typesToCreate.map((type) => ({
        organizationId,
        locationId,
        slug: type.slug,
        name: type.name,
        schedulingMode:
          type.schedulingMode === RESOURCE_SCHEDULING_MODES.CONTINUOUS
            ? RESOURCE_SCHEDULING_MODES.CONTINUOUS
            : RESOURCE_SCHEDULING_MODES.SLOTTED,
        inventoryConfigured: false,
        active: true,
      })),
    });
  }
  for (const type of dataset.resourceTypes) {
    const existing = typeBySlug.get(type.slug);
    if (!existing) {
      continue;
    }
    const schedulingMode =
      type.schedulingMode === RESOURCE_SCHEDULING_MODES.CONTINUOUS
        ? RESOURCE_SCHEDULING_MODES.CONTINUOUS
        : RESOURCE_SCHEDULING_MODES.SLOTTED;
    if (existing.name === type.name && existing.schedulingMode === schedulingMode && existing.active) {
      continue;
    }
    await database.resourceType.update({
      where: { id: existing.id },
      data: { name: type.name, schedulingMode, active: true },
    });
  }
  await maybeInterrupt("resourceTypes", interruptAfterStep);

  const resourceTypes = await database.resourceType.findMany({
    where: { organizationId },
    include: { resources: { select: { displayOrder: true, name: true, id: true, locationId: true } } },
  });
  const resourceTypeIds = new Map(resourceTypes.map((row) => [row.slug, row.id]));
  const resourcesToCreate: Array<{
    organizationId: string;
    resourceTypeId: string;
    locationId: string | null;
    name: string;
    displayOrder: number;
    capacity: number | null;
    active: boolean;
  }> = [];
  for (const type of dataset.resourceTypes) {
    const resourceTypeId = resourceTypeIds.get(type.slug);
    if (!resourceTypeId) {
      throw new Error(`Resource type "${type.slug}" was not created.`);
    }
    const existingOrders = new Set(
      resourceTypes.find((row) => row.id === resourceTypeId)?.resources.map((row) => row.displayOrder) ?? [],
    );
    for (let order = 1; order <= type.count; order += 1) {
      if (existingOrders.has(order)) {
        continue;
      }
      resourcesToCreate.push({
        organizationId,
        resourceTypeId,
        locationId,
        name: type.count === 1 ? type.name : `${type.name} ${order}`,
        displayOrder: order,
        capacity: type.capacity,
        active: true,
      });
    }
  }
  if (resourcesToCreate.length > 0) {
    await database.resource.createMany({ data: resourcesToCreate });
  }
  if (dataset.resourceTypes.length > 0) {
    await database.resourceType.updateMany({
      where: { organizationId, slug: { in: dataset.resourceTypes.map((row) => row.slug) } },
      data: { inventoryConfigured: true, active: true },
    });
  }
  await maybeInterrupt("resources", interruptAfterStep);

  const categories = await database.productCategory.findMany({ where: { organizationId } });
  const categoryIds = new Map(categories.map((row) => [row.slug, row.id]));
  const existingProducts = await database.product.findMany({ where: { organizationId } });
  const productBySlug = new Map(existingProducts.map((row) => [row.slug, row]));
  const productsToCreate = dataset.products.filter((row) => !productBySlug.has(row.slug));
  if (productsToCreate.length > 0) {
    await database.product.createMany({
      data: productsToCreate.map((product) => {
        const categoryId = categoryIds.get(product.categorySlug);
        if (!categoryId) {
          throw new Error(`Unknown category slug "${product.categorySlug}" for product "${product.slug}".`);
        }
        const index = dataset.products.findIndex((row) => row.slug === product.slug);
        return {
          organizationId,
          slug: product.slug,
          categoryId,
          name: product.name,
          kind: product.kind,
          audience: product.audience,
          shortDescription: product.shortDescription ?? null,
          durationMinutes: product.durationMinutes ?? null,
          schedulingBehavior: product.schedulingBehavior ?? null,
          minGuests: product.minGuests ?? null,
          maxGuests: product.maxGuests ?? null,
          weekendOnly: product.weekendOnly,
          fulfillmentGroup: product.fulfillmentGroup ?? null,
          intakeDeclarations: product.intakeDeclarations ?? undefined,
          active: true,
          sortOrder: index,
        };
      }),
    });
  }
  for (const [index, product] of dataset.products.entries()) {
    const existing = productBySlug.get(product.slug);
    if (!existing || !diff.products.updated.includes(product.slug)) {
      continue;
    }
    const categoryId = categoryIds.get(product.categorySlug);
    if (!categoryId) {
      throw new Error(`Unknown category slug "${product.categorySlug}" for product "${product.slug}".`);
    }
    const nextDeclarations = product.intakeDeclarations ?? null;
    await database.product.update({
      where: { id: existing.id },
      data: {
        categoryId,
        name: product.name,
        kind: product.kind,
        audience: product.audience,
        shortDescription: product.shortDescription ?? null,
        durationMinutes: product.durationMinutes ?? null,
        schedulingBehavior: product.schedulingBehavior ?? null,
        minGuests: product.minGuests ?? null,
        maxGuests: product.maxGuests ?? null,
        weekendOnly: product.weekendOnly,
        fulfillmentGroup: product.fulfillmentGroup ?? null,
        intakeDeclarations: nextDeclarations === null ? Prisma.DbNull : nextDeclarations,
        active: true,
        sortOrder: index,
      },
    });
  }
  await maybeInterrupt("products", interruptAfterStep);

  const products = await database.product.findMany({ where: { organizationId } });
  const productIds = new Map(products.map((row) => [row.slug, row.id]));
  const refreshedTypes = await database.resourceType.findMany({
    where: { organizationId },
    include: { resources: { select: { id: true, name: true, locationId: true, resourceTypeId: true, active: true } } },
  });
  const inventoryBySlug = new Map(
    refreshedTypes.map((type) => [
      type.slug,
      {
        slug: type.slug,
        activeCount: type.resources.filter((row) => row.active).length,
        resources: type.resources.filter((row) => row.active),
      },
    ]),
  );

  for (const product of dataset.products) {
    const productId = productIds.get(product.slug);
    if (!productId) {
      throw new Error(`Product "${product.slug}" was not created.`);
    }
    const replacePrices = diff.pricing.created.includes(product.slug) || diff.pricing.updated.includes(product.slug);
    const replaceRequirements =
      diff.requirements.created.includes(product.slug) || diff.requirements.updated.includes(product.slug);
    const replaceServing = diff.servings.created.includes(product.slug) || diff.servings.updated.includes(product.slug);
    const replaceGrants = diff.grants.created.includes(product.slug) || diff.grants.updated.includes(product.slug);
    if (replacePrices) {
      await database.productPrice.deleteMany({ where: { organizationId, productId } });
    }
    if (replaceRequirements) {
      await database.productResourceRequirement.deleteMany({ where: { organizationId, productId } });
    }
    if (replaceServing) {
      await database.productServing.deleteMany({ where: { organizationId, productId } });
    }
    if (replaceGrants) {
      await database.productExperienceGrant.deleteMany({ where: { organizationId, productId } });
    }
    if (replacePrices && product.prices.length > 0) {
      await database.productPrice.createMany({
        data: product.prices.map((price) => ({
          organizationId,
          productId,
          strategy: price.strategy,
          amountCents: price.amountCents,
          additionalGuestCents: price.additionalGuestCents ?? null,
          includedGuests: price.includedGuests ?? null,
          includedHours: price.includedHours ?? null,
          additionalHourCents: price.additionalHourCents ?? null,
          minGuests: price.minGuests ?? null,
          weekdayAmountCents: price.weekdayAmountCents ?? null,
          weekendAmountCents: price.weekendAmountCents ?? null,
          daysOfWeek: price.daysOfWeek ?? undefined,
          weekendDays: price.weekendDays ?? undefined,
          afterHour: price.afterHour ?? null,
          afterHourAmountCents: price.afterHourAmountCents ?? null,
          shoeAddOnCents: price.shoeAddOnCents ?? null,
          unitLabel: price.unitLabel ?? null,
        })),
      });
    }
    if (replaceRequirements) {
      const resolved = validateCatalogProductRequirements({
        productSlug: product.slug,
        requirements: product.requirements ?? [],
        inventoryBySlug,
        locationId,
      });
      const requirementRows = (product.requirements ?? []).map((requirement) => {
        const resourceTypeId = resourceTypeIds.get(requirement.resourceTypeSlug);
        if (!resourceTypeId) {
          throw new Error(`Unknown resource type slug "${requirement.resourceTypeSlug}".`);
        }
        return {
          organizationId,
          productId,
          resourceTypeId,
          quantityRule: requirement.quantityRule,
          quantity: requirement.quantity ?? null,
          guestsPerUnit: requirement.guestsPerUnit ?? null,
          durationMinutes: requirement.durationMinutes ?? null,
          exclusive: requirement.exclusive ?? false,
          resourceId: resolved.find((row) => row.resourceTypeSlug === requirement.resourceTypeSlug)?.resourceId ?? null,
        };
      });
      if (requirementRows.length > 0) {
        await database.productResourceRequirement.createMany({ data: requirementRows });
      }
    }
    if (replaceServing && product.serving) {
      await database.productServing.createMany({
        data: [
          {
            organizationId,
            productId,
            servesMin: product.serving.servesMin,
            servesMax: product.serving.servesMax,
            unitCount: product.serving.unitCount ?? null,
          },
        ],
      });
    }
    if (replaceGrants && (product.coverage?.length ?? 0) > 0) {
      await database.productExperienceGrant.createMany({
        data: (product.coverage ?? []).map((grant) => ({
          organizationId,
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
        })),
      });
    }
  }
  await maybeInterrupt("productChildren", interruptAfterStep);

  const existingProfiles = await database.recommendationProfile.findMany({ where: { organizationId } });
  const profileByAudience = new Map(existingProfiles.map((row) => [row.audience, row]));
  const profilesToCreate = dataset.recommendationProfiles.filter((row) => !profileByAudience.has(row.audience));
  if (profilesToCreate.length > 0) {
    await database.recommendationProfile.createMany({
      data: profilesToCreate.map((profile) => ({
        organizationId,
        audience: profile.audience,
        payload: profile.payload as Prisma.InputJsonValue,
      })),
    });
  }
  for (const profile of dataset.recommendationProfiles) {
    if (!diff.profiles.updated.includes(profile.audience)) {
      continue;
    }
    const existing = profileByAudience.get(profile.audience);
    if (!existing) {
      continue;
    }
    await database.recommendationProfile.update({
      where: { id: existing.id },
      data: { payload: profile.payload as Prisma.InputJsonValue },
    });
  }
  await maybeInterrupt("profiles", interruptAfterStep);

  for (const interest of dataset.attractionInterests ?? []) {
    const missing = interest.productSlugs.filter((slug) => !productIds.has(slug));
    if (missing.length > 0) {
      throw new Error(`Attraction interest ${interest.slug} references unknown products: ${missing.join(", ")}`);
    }
    const existing = await database.attractionInterest.findFirst({
      where: { organizationId, slug: interest.slug },
    });
    const data = {
      label: interest.label,
      description: interest.description ?? null,
      active: interest.active,
      displayOrder: interest.displayOrder,
    };
    const row = existing
      ? await database.attractionInterest.update({ where: { id: existing.id }, data })
      : await database.attractionInterest.create({
          data: { organizationId, slug: interest.slug, ...data },
        });
    if (diff.interests.created.includes(interest.slug) || diff.interests.updated.includes(interest.slug)) {
      await database.attractionInterestProduct.deleteMany({
        where: { organizationId, attractionInterestId: row.id },
      });
      await database.attractionInterestProduct.createMany({
        data: interest.productSlugs.map((slug, index) => ({
          organizationId,
          attractionInterestId: row.id,
          productId: productIds.get(slug) ?? "",
          sortOrder: index,
        })),
      });
    }
  }
  await maybeInterrupt("interests", interruptAfterStep);

  const promotions = dataset.promotions ?? [];
  if (promotions.length > 0) {
    const locationBySlug = await database.location.findMany({
      where: { organizationId },
      select: { id: true, slug: true },
    });
    const locationIds = new Map(locationBySlug.map((row) => [row.slug, row.id]));
    const existingPromotions = await database.pricingPromotion.findMany({ where: { organizationId } });
    const promotionBySlug = new Map(existingPromotions.map((row) => [row.slug, row]));
    for (const promotion of promotions) {
      const payload = {
        organizationId,
        locationId: promotion.locationSlug ? (locationIds.get(promotion.locationSlug) ?? null) : null,
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
        effectiveTo: promotion.effectiveTo ? new Date(`${promotion.effectiveTo.slice(0, 10)}T00:00:00.000Z`) : null,
        minQuantity: promotion.minQuantity ?? null,
        maxQuantity: promotion.maxQuantity ?? null,
        payload: promotion.payload as Prisma.InputJsonValue,
      };
      const existing = promotionBySlug.get(promotion.slug);
      if (!existing) {
        await database.pricingPromotion.create({ data: payload });
        continue;
      }
      if (!diff.promotions.updated.includes(promotion.slug)) {
        continue;
      }
      await database.pricingPromotion.update({ where: { id: existing.id }, data: payload });
    }
  }
  await maybeInterrupt("promotions", interruptAfterStep);
}

function classify<T, E>(
  rows: T[],
  existingByKey: Map<string, E>,
  unchanged: (row: T, existing: E) => boolean,
  keyOf: (row: T) => string,
): CatalogSlugAction {
  const result = emptySlugAction();
  for (const row of rows) {
    const key = keyOf(row);
    const existing = existingByKey.get(key);
    if (!existing) {
      result.created.push(key);
    } else if (unchanged(row, existing)) {
      result.unchanged.push(key);
    } else {
      result.updated.push(key);
    }
  }
  return result;
}

function classifyChildren<Stored, Desired>(
  target: CatalogSlugAction,
  slug: string,
  stored: Stored[],
  desired: Desired[],
  normalizeStored: (row: Stored) => unknown,
): void {
  if (stored.length === 0 && desired.length === 0) {
    target.unchanged.push(slug);
    return;
  }
  if (stored.length === 0 && desired.length > 0) {
    target.created.push(slug);
    return;
  }
  if (sameJson(stored.map(normalizeStored), desired)) {
    target.unchanged.push(slug);
    return;
  }
  target.updated.push(slug);
}

function groupBy<T>(rows: T[], keyOf: (row: T) => string): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const key = keyOf(row);
    const list = grouped.get(key);
    if (list) {
      list.push(row);
    } else {
      grouped.set(key, [row]);
    }
  }
  return grouped;
}

function normalizePriceInput(price: BookingCatalogDataset["products"][number]["prices"][number]) {
  return {
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
    weekendDays: price.weekendDays ?? null,
    afterHour: price.afterHour ?? null,
    afterHourAmountCents: price.afterHourAmountCents ?? null,
    shoeAddOnCents: price.shoeAddOnCents ?? null,
    unitLabel: price.unitLabel ?? null,
  };
}

function normalizeStoredPrice(price: {
  strategy: string;
  amountCents: number;
  additionalGuestCents: number | null;
  includedGuests: number | null;
  includedHours: number | null;
  additionalHourCents: number | null;
  minGuests: number | null;
  weekdayAmountCents: number | null;
  weekendAmountCents: number | null;
  daysOfWeek: unknown;
  weekendDays: unknown;
  afterHour: number | null;
  afterHourAmountCents: number | null;
  shoeAddOnCents: number | null;
  unitLabel: string | null;
}) {
  return {
    strategy: price.strategy,
    amountCents: price.amountCents,
    additionalGuestCents: price.additionalGuestCents,
    includedGuests: price.includedGuests,
    includedHours: price.includedHours,
    additionalHourCents: price.additionalHourCents,
    minGuests: price.minGuests,
    weekdayAmountCents: price.weekdayAmountCents,
    weekendAmountCents: price.weekendAmountCents,
    daysOfWeek: price.daysOfWeek ?? null,
    weekendDays: price.weekendDays ?? null,
    afterHour: price.afterHour,
    afterHourAmountCents: price.afterHourAmountCents,
    shoeAddOnCents: price.shoeAddOnCents,
    unitLabel: price.unitLabel,
  };
}

function normalizeStoredRequirement(row: {
  resourceTypeId: string;
  quantityRule: string;
  quantity: number | null;
  guestsPerUnit: number | null;
  durationMinutes: number | null;
  exclusive: boolean;
  resourceId: string | null;
}) {
  return {
    resourceTypeId: row.resourceTypeId,
    quantityRule: row.quantityRule,
    quantity: row.quantity,
    guestsPerUnit: row.guestsPerUnit,
    durationMinutes: row.durationMinutes,
    exclusive: row.exclusive,
    resourceId: row.resourceId,
  };
}

function normalizeStoredServing(row: { servesMin: number; servesMax: number; unitCount: number | null }) {
  return { servesMin: row.servesMin, servesMax: row.servesMax, unitCount: row.unitCount };
}

function normalizeGrantInput(grant: NonNullable<BookingCatalogDataset["products"][number]["coverage"]>[number]) {
  return {
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
  };
}

function normalizeStoredGrant(row: {
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
  optionalBenefit: boolean | null;
}) {
  return {
    experienceKey: row.experienceKey,
    kind: row.kind,
    durationMinutesPerParticipant: row.durationMinutesPerParticipant,
    sessionsPerParticipant: row.sessionsPerParticipant,
    servings: row.servings,
    participantRule: row.participantRule,
    fixedParticipants: row.fixedParticipants,
    creditCents: row.creditCents,
    simultaneousGuestCapacity: row.simultaneousGuestCapacity,
    rotationMinutesPerParticipant: row.rotationMinutesPerParticipant,
    minAge: row.minAge,
    minWeightLbs: row.minWeightLbs,
    requiresParticipantBreakdown: row.requiresParticipantBreakdown,
    optionalBenefit: row.optionalBenefit ?? false,
  };
}

function normalizePromotionInput(
  promotion: NonNullable<BookingCatalogDataset["promotions"]>[number],
  locationIds: Map<string, string>,
) {
  return {
    locationId: promotion.locationSlug ? (locationIds.get(promotion.locationSlug) ?? null) : null,
    name: promotion.name,
    type: promotion.type,
    version: promotion.version,
    active: promotion.active,
    stackable: promotion.stackable,
    stackingGroup: promotion.stackingGroup ?? null,
    priority: promotion.priority,
    allowsFurtherDiscount: promotion.allowsFurtherDiscount,
    productSlugs: promotion.productSlugs ?? null,
    categorySlugs: promotion.categorySlugs ?? null,
    daysOfWeek: promotion.daysOfWeek ?? null,
    localStartMinute: promotion.localStartMinute ?? null,
    localEndMinute: promotion.localEndMinute ?? null,
    effectiveFrom: promotion.effectiveFrom ? `${promotion.effectiveFrom.slice(0, 10)}` : null,
    effectiveTo: promotion.effectiveTo ? `${promotion.effectiveTo.slice(0, 10)}` : null,
    minQuantity: promotion.minQuantity ?? null,
    maxQuantity: promotion.maxQuantity ?? null,
    payload: promotion.payload,
  };
}

function normalizeStoredPromotion(row: {
  locationId: string | null;
  name: string;
  type: string;
  version: number;
  active: boolean;
  stackable: boolean;
  stackingGroup: string | null;
  priority: number;
  allowsFurtherDiscount: boolean;
  productSlugs: unknown;
  categorySlugs: unknown;
  daysOfWeek: unknown;
  localStartMinute: number | null;
  localEndMinute: number | null;
  effectiveFrom: Date | null;
  effectiveTo: Date | null;
  minQuantity: number | null;
  maxQuantity: number | null;
  payload: unknown;
}) {
  return {
    locationId: row.locationId,
    name: row.name,
    type: row.type,
    version: row.version,
    active: row.active,
    stackable: row.stackable,
    stackingGroup: row.stackingGroup,
    priority: row.priority,
    allowsFurtherDiscount: row.allowsFurtherDiscount,
    productSlugs: row.productSlugs ?? null,
    categorySlugs: row.categorySlugs ?? null,
    daysOfWeek: row.daysOfWeek ?? null,
    localStartMinute: row.localStartMinute,
    localEndMinute: row.localEndMinute,
    effectiveFrom: row.effectiveFrom ? row.effectiveFrom.toISOString().slice(0, 10) : null,
    effectiveTo: row.effectiveTo ? row.effectiveTo.toISOString().slice(0, 10) : null,
    minQuantity: row.minQuantity,
    maxQuantity: row.maxQuantity,
    payload: row.payload,
  };
}

function buildInventoryMap(
  existingTypes: Array<{
    slug: string;
    resources: Array<{ id: string; name: string; locationId: string | null; active?: boolean }>;
  }>,
  datasetTypes: BookingCatalogDataset["resourceTypes"],
  locationId: string | null,
) {
  const bySlug = new Map(
    existingTypes.map((type) => [
      type.slug,
      {
        slug: type.slug,
        activeCount: type.resources.filter((row) => row.active !== false).length,
        resources: type.resources
          .filter((row) => row.active !== false)
          .map((row) => ({ id: row.id, name: row.name, locationId: row.locationId })),
      },
    ]),
  );
  for (const type of datasetTypes) {
    const current = bySlug.get(type.slug) ?? { slug: type.slug, activeCount: 0, resources: [] };
    const existingOrders = current.resources.length;
    for (let order = existingOrders + 1; order <= type.count; order += 1) {
      current.resources.push({
        id: `planned:${type.slug}:${order}`,
        name: type.count === 1 ? type.name : `${type.name} ${order}`,
        locationId,
      });
    }
    current.activeCount = Math.max(current.activeCount, type.count);
    bySlug.set(type.slug, current);
  }
  return bySlug;
}
