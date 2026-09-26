import type { Prisma, PrismaClient } from "@/generated/prisma/client";

import type { BookingCatalogDataset } from "@/server/catalog/dataset";
import { validateCatalogProductRequirements } from "@/server/catalog/requirement-validation";
import { resolvePrimaryLocationId } from "@/server/locations/primary-location";
import { RESOURCE_SCHEDULING_MODES } from "@/types/resource-schedule";

type ImportDb = PrismaClient;

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
};

export type CatalogImportResult = CatalogImportCounts & {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  ambiguities: BookingCatalogDataset["ambiguities"];
};

const EMPTY_COUNTS = (): CatalogImportCounts => ({
  categoriesCreated: 0,
  categoriesUpdated: 0,
  categoriesUnchanged: 0,
  productsCreated: 0,
  productsUpdated: 0,
  productsUnchanged: 0,
  resourceTypesCreated: 0,
  resourceTypesUpdated: 0,
  resourceTypesUnchanged: 0,
  resourcesCreated: 0,
  resourcesUnchanged: 0,
  profilesCreated: 0,
  profilesUpdated: 0,
  profilesUnchanged: 0,
});

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export async function importBookingCatalog(
  database: ImportDb,
  input: {
    organizationSlug: string;
    dataset: BookingCatalogDataset;
  },
): Promise<CatalogImportResult> {
  const organization = await database.organization.findFirst({
    where: { slug: input.organizationSlug.trim().toLowerCase() },
    select: { id: true, name: true, slug: true, depositPercent: true },
  });
  if (!organization) {
    throw new Error(`No organization found for slug "${input.organizationSlug}".`);
  }

  if (
    input.dataset.depositPercent != null &&
    organization.depositPercent !== input.dataset.depositPercent
  ) {
    await database.organization.update({
      where: { id: organization.id },
      data: { depositPercent: input.dataset.depositPercent },
    });
  }

  const counts = EMPTY_COUNTS();
  const organizationId = organization.id;
  const locationId = await resolvePrimaryLocationId(database, organizationId);

  const [existingCategories, existingTypes, existingProducts, existingProfiles] = await Promise.all([
    database.productCategory.findMany({ where: { organizationId } }),
    database.resourceType.findMany({
      where: { organizationId },
      include: { resources: { select: { displayOrder: true } } },
    }),
    database.product.findMany({ where: { organizationId } }),
    database.recommendationProfile.findMany({ where: { organizationId } }),
  ]);

  const categoryBySlug = new Map(existingCategories.map((row) => [row.slug, row]));
  const typeBySlug = new Map(existingTypes.map((row) => [row.slug, row]));
  const productBySlug = new Map(existingProducts.map((row) => [row.slug, row]));
  const profileByAudience = new Map(existingProfiles.map((row) => [row.audience, row]));

  const categoriesToCreate = input.dataset.categories.filter((row) => !categoryBySlug.has(row.slug));
  if (categoriesToCreate.length > 0) {
    await database.productCategory.createMany({
      data: categoriesToCreate.map((category) => ({
        organizationId,
        slug: category.slug,
        name: category.name,
        sortOrder: category.sortOrder,
      })),
    });
    counts.categoriesCreated = categoriesToCreate.length;
  }
  for (const category of input.dataset.categories) {
    const existing = categoryBySlug.get(category.slug);
    if (!existing) {
      continue;
    }
    if (existing.name === category.name && existing.sortOrder === category.sortOrder) {
      counts.categoriesUnchanged += 1;
      continue;
    }
    await database.productCategory.update({
      where: { id: existing.id },
      data: { name: category.name, sortOrder: category.sortOrder },
    });
    counts.categoriesUpdated += 1;
  }
  const categories = await database.productCategory.findMany({ where: { organizationId } });
  const categoryIds = new Map(categories.map((row) => [row.slug, row.id]));

  const typesToCreate = input.dataset.resourceTypes.filter((row) => !typeBySlug.has(row.slug));
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
    counts.resourceTypesCreated = typesToCreate.length;
  }
  for (const type of input.dataset.resourceTypes) {
    const existing = typeBySlug.get(type.slug);
    if (!existing) {
      continue;
    }
    const schedulingMode =
      type.schedulingMode === RESOURCE_SCHEDULING_MODES.CONTINUOUS
        ? RESOURCE_SCHEDULING_MODES.CONTINUOUS
        : RESOURCE_SCHEDULING_MODES.SLOTTED;
    if (existing.name === type.name && existing.schedulingMode === schedulingMode) {
      counts.resourceTypesUnchanged += 1;
      continue;
    }
    await database.resourceType.update({
      where: { id: existing.id },
      data: { name: type.name, schedulingMode, active: true },
    });
    counts.resourceTypesUpdated += 1;
  }

  const resourceTypes = await database.resourceType.findMany({
    where: { organizationId },
    include: { resources: { select: { displayOrder: true } } },
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
  for (const type of input.dataset.resourceTypes) {
    const resourceTypeId = resourceTypeIds.get(type.slug);
    if (!resourceTypeId) {
      throw new Error(`Resource type "${type.slug}" was not created.`);
    }
    const existingOrders = new Set(
      resourceTypes.find((row) => row.id === resourceTypeId)?.resources.map((row) => row.displayOrder) ?? [],
    );
    for (let order = 1; order <= type.count; order += 1) {
      if (existingOrders.has(order)) {
        counts.resourcesUnchanged += 1;
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
    counts.resourcesCreated = resourcesToCreate.length;
  }
  await database.resourceType.updateMany({
    where: { organizationId, slug: { in: input.dataset.resourceTypes.map((row) => row.slug) } },
    data: { inventoryConfigured: true, active: true },
  });

  const productsToCreate = input.dataset.products.filter((row) => !productBySlug.has(row.slug));
  if (productsToCreate.length > 0) {
    await database.product.createMany({
      data: productsToCreate.map((product, index) => {
        const categoryId = categoryIds.get(product.categorySlug);
        if (!categoryId) {
          throw new Error(`Unknown category slug "${product.categorySlug}" for product "${product.slug}".`);
        }
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
          active: true,
          sortOrder: input.dataset.products.findIndex((row) => row.slug === product.slug) || index,
        };
      }),
    });
    counts.productsCreated = productsToCreate.length;
  }
  for (const [index, product] of input.dataset.products.entries()) {
    const existing = productBySlug.get(product.slug);
    if (!existing) {
      continue;
    }
    const categoryId = categoryIds.get(product.categorySlug);
    if (!categoryId) {
      throw new Error(`Unknown category slug "${product.categorySlug}" for product "${product.slug}".`);
    }
    if (
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
      existing.categoryId === categoryId
    ) {
      counts.productsUnchanged += 1;
      continue;
    }
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
        active: true,
        sortOrder: index,
      },
    });
    counts.productsUpdated += 1;
  }

  const products = await database.product.findMany({ where: { organizationId } });
  const productIds = new Map(products.map((row) => [row.slug, row.id]));
  const inventoryRows = await database.resource.findMany({
    where: { organizationId, active: true },
    select: { id: true, name: true, locationId: true, resourceTypeId: true },
  });
  const inventoryBySlug = new Map(
    [...resourceTypeIds.entries()].map(([slug, id]) => [
      slug,
      {
        slug,
        activeCount: inventoryRows.filter((row) => row.resourceTypeId === id).length,
        resources: inventoryRows.filter((row) => row.resourceTypeId === id),
      },
    ]),
  );
  const productIdList = products.map((row) => row.id);
  if (productIdList.length > 0) {
    await database.productPrice.deleteMany({ where: { organizationId, productId: { in: productIdList } } });
    await database.productResourceRequirement.deleteMany({
      where: { organizationId, productId: { in: productIdList } },
    });
    await database.productServing.deleteMany({ where: { organizationId, productId: { in: productIdList } } });
  }

  const priceRows: Prisma.ProductPriceCreateManyInput[] = [];
  const requirementRows: Prisma.ProductResourceRequirementCreateManyInput[] = [];
  const servingRows: Prisma.ProductServingCreateManyInput[] = [];
  for (const product of input.dataset.products) {
    const productId = productIds.get(product.slug);
    if (!productId) {
      throw new Error(`Product "${product.slug}" was not created.`);
    }
    for (const price of product.prices) {
      priceRows.push({
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
        afterHour: price.afterHour ?? null,
        afterHourAmountCents: price.afterHourAmountCents ?? null,
        shoeAddOnCents: price.shoeAddOnCents ?? null,
        unitLabel: price.unitLabel ?? null,
      });
    }
    const resolved = validateCatalogProductRequirements({
      productSlug: product.slug,
      requirements: product.requirements ?? [],
      inventoryBySlug,
      locationId,
    });
    for (const requirement of product.requirements ?? []) {
      const resourceTypeId = resourceTypeIds.get(requirement.resourceTypeSlug);
      if (!resourceTypeId) {
        throw new Error(`Unknown resource type slug "${requirement.resourceTypeSlug}".`);
      }
      const specific = resolved.find((row) => row.resourceTypeSlug === requirement.resourceTypeSlug);
      requirementRows.push({
        organizationId,
        productId,
        resourceTypeId,
        quantityRule: requirement.quantityRule,
        quantity: requirement.quantity ?? null,
        guestsPerUnit: requirement.guestsPerUnit ?? null,
        durationMinutes: requirement.durationMinutes ?? null,
        exclusive: requirement.exclusive ?? false,
        resourceId: specific?.resourceId ?? null,
      });
    }
    if (product.serving) {
      servingRows.push({
        organizationId,
        productId,
        servesMin: product.serving.servesMin,
        servesMax: product.serving.servesMax,
        unitCount: product.serving.unitCount ?? null,
      });
    }
  }
  if (priceRows.length > 0) {
    await database.productPrice.createMany({ data: priceRows });
  }
  if (requirementRows.length > 0) {
    await database.productResourceRequirement.createMany({ data: requirementRows });
  }
  if (servingRows.length > 0) {
    await database.productServing.createMany({ data: servingRows });
  }

  const profilesToCreate = input.dataset.recommendationProfiles.filter(
    (row) => !profileByAudience.has(row.audience),
  );
  if (profilesToCreate.length > 0) {
    await database.recommendationProfile.createMany({
      data: profilesToCreate.map((profile) => ({
        organizationId,
        audience: profile.audience,
        payload: profile.payload as Prisma.InputJsonValue,
      })),
    });
    counts.profilesCreated = profilesToCreate.length;
  }
  for (const profile of input.dataset.recommendationProfiles) {
    const existing = profileByAudience.get(profile.audience);
    if (!existing) {
      continue;
    }
    if (sameJson(existing.payload, profile.payload)) {
      counts.profilesUnchanged += 1;
      continue;
    }
    await database.recommendationProfile.update({
      where: { id: existing.id },
      data: { payload: profile.payload as Prisma.InputJsonValue },
    });
    counts.profilesUpdated += 1;
  }

  return {
    ...counts,
    organizationId,
    organizationName: organization.name,
    organizationSlug: organization.slug,
    ambiguities: input.dataset.ambiguities,
  };
}
