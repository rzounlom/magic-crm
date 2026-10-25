import type { PrismaClient } from "@/generated/prisma/client";

import { formatCatalogImportReport, type CatalogImportDiff } from "@/server/catalog/catalog-import-diff";
import { loadBundledBookingCatalogDataset } from "@/server/catalog/bundled-booking-catalog";
import type { BookingCatalogDataset } from "@/server/catalog/dataset";
import { CatalogSyncError } from "@/server/errors";
import { requirePermission } from "@/server/policies/require-permission";
import type { RequestContext } from "@/server/request-context";
import { importBookingCatalog } from "@/server/services/catalog-import-service";
import { PERMISSIONS } from "@/types/permissions";

type CatalogSyncDb = PrismaClient;

export type CatalogSyncOrganization = {
  id: string;
  name: string;
  slug: string;
  productCount: number;
  profileCount: number;
};

export type CatalogSyncPreview = {
  organization: CatalogSyncOrganization;
  eligible: boolean;
  confirmationPhrase: string;
  report: string;
  diff: CatalogImportDiff;
  unexpectedOperations: string[];
};

const GENERATIONS_MARKER = "generations";

export function isGenerationsCustomerOrganization(organization: { name: string; slug: string }): boolean {
  const haystack = `${organization.name} ${organization.slug}`.toLowerCase();
  return haystack.includes(GENERATIONS_MARKER);
}

export function catalogSyncConfirmationPhrase(slug: string): string {
  return `IMPORT ${slug.trim().toLowerCase()}`;
}

export function unexpectedCatalogSyncOperations(diff: CatalogImportDiff): string[] {
  return diff.scopedReplacements.filter((item) =>
    /all |every |tenant-wide|organization-wide/i.test(item),
  );
}

async function loadSessionOrganization(
  ctx: RequestContext,
  database: CatalogSyncDb,
): Promise<CatalogSyncOrganization> {
  const organization = await database.organization.findFirst({
    where: { id: ctx.organizationId },
    select: { id: true, name: true, slug: true },
  });
  if (!organization) {
    throw new CatalogSyncError("TENANT_NOT_ELIGIBLE", "The signed-in organization could not be loaded.");
  }
  const [productCount, profileCount] = await Promise.all([
    database.product.count({ where: { organizationId: organization.id } }),
    database.recommendationProfile.count({ where: { organizationId: organization.id } }),
  ]);
  return { ...organization, productCount, profileCount };
}

export async function previewCatalogSync(
  ctx: RequestContext,
  database: CatalogSyncDb,
  dataset: BookingCatalogDataset = loadBundledBookingCatalogDataset(),
): Promise<CatalogSyncPreview> {
  await requirePermission(ctx, PERMISSIONS.CATALOG_MANAGE, database);
  const organization = await loadSessionOrganization(ctx, database);
  const eligible = isGenerationsCustomerOrganization(organization);
  const confirmationPhrase = catalogSyncConfirmationPhrase(organization.slug);

  if (!eligible) {
    return {
      organization,
      eligible: false,
      confirmationPhrase,
      report: "Catalog sync refused. The signed-in organization is not the Generations customer.",
      diff: emptyRefusedDiff(organization),
      unexpectedOperations: [],
    };
  }

  const diff = await importBookingCatalog(database, {
    organizationSlug: organization.slug,
    dataset,
    dryRun: true,
  });
  const unexpectedOperations = unexpectedCatalogSyncOperations(diff);
  return {
    organization,
    eligible: true,
    confirmationPhrase,
    report: formatCatalogImportReport(diff, { dryRun: true, applied: false }),
    diff,
    unexpectedOperations,
  };
}

export async function applyCatalogSync(
  ctx: RequestContext,
  database: CatalogSyncDb,
  confirmation: string,
  dataset: BookingCatalogDataset = loadBundledBookingCatalogDataset(),
): Promise<CatalogSyncPreview> {
  const preview = await previewCatalogSync(ctx, database, dataset);
  if (!preview.eligible) {
    throw new CatalogSyncError("TENANT_NOT_ELIGIBLE");
  }
  if (preview.unexpectedOperations.length > 0) {
    throw new CatalogSyncError("UNEXPECTED_PLAN");
  }
  const expected = catalogSyncConfirmationPhrase(preview.organization.slug);
  if (confirmation.trim() !== expected) {
    throw new CatalogSyncError("CONFIRMATION_REQUIRED");
  }

  const result = await importBookingCatalog(database, {
    organizationSlug: preview.organization.slug,
    dataset,
  });
  const organization = await loadSessionOrganization(ctx, database);
  return {
    organization,
    eligible: true,
    confirmationPhrase: expected,
    report: formatCatalogImportReport(result, { dryRun: false, applied: true }),
    diff: result,
    unexpectedOperations: unexpectedCatalogSyncOperations(result),
  };
}

function emptyRefusedDiff(organization: CatalogSyncOrganization): CatalogImportDiff {
  const empty = { created: [], updated: [], unchanged: [], preserved: [] };
  return {
    organizationId: organization.id,
    organizationName: organization.name,
    organizationSlug: organization.slug,
    depositPercent: { from: 0, to: null, action: "unchanged" },
    categories: { created: [], updated: [], unchanged: [] },
    products: empty,
    pricing: empty,
    requirements: empty,
    servings: empty,
    grants: empty,
    resourceTypes: { created: [], updated: [], unchanged: [] },
    resourcesCreated: 0,
    resourcesUnchanged: 0,
    profiles: empty,
    interests: empty,
    promotions: empty,
    scopedReplacements: [],
    ambiguities: [],
  };
}
