import type { PrismaClient } from "@/generated/prisma/client";

import {
  TAX_PRICING_MODES,
  type BundleTaxPolicyRule,
  type LocationTaxProfileInput,
  type OrganizationTaxSettingsInput,
  type ProductTaxClassificationRule,
  type TaxCalculationInput,
  type TaxRateScheduleRule,
} from "@/types/tax";

type TaxDb = PrismaClient;

function isoDate(value: Date | null | undefined): string | null {
  if (!value) {
    return null;
  }
  return value.toISOString().slice(0, 10);
}

export type LoadedTaxConfig = {
  settings: OrganizationTaxSettingsInput | null;
  locationProfile: LocationTaxProfileInput | null;
  classifications: ProductTaxClassificationRule[];
  rates: TaxRateScheduleRule[];
  bundlePolicies: BundleTaxPolicyRule[];
};

/**
 * Load tenant tax configuration. Absence of settings means DISABLED (not zero tax).
 * Never falls back to another location's jurisdiction.
 */
export async function loadTaxConfigForProposal(
  database: TaxDb,
  organizationId: string,
  locationId?: string | null,
): Promise<LoadedTaxConfig> {
  const [settingsRow, locationRow, profileRow, classificationRows, rateRows, bundleRows] =
    await Promise.all([
      database.organizationTaxSettings.findUnique({ where: { organizationId } }),
      locationId
        ? database.location.findFirst({
            where: { organizationId, id: locationId },
            select: { id: true, timezone: true },
          })
        : Promise.resolve(null),
      locationId
        ? database.locationTaxProfile.findFirst({
            where: { organizationId, locationId },
          })
        : Promise.resolve(null),
      database.productTaxClassification.findMany({ where: { organizationId } }),
      locationId
        ? database.taxRateSchedule.findMany({ where: { organizationId, locationId } })
        : Promise.resolve([]),
      database.productBundleTaxPolicy.findMany({ where: { organizationId } }),
    ]);

  const settings: OrganizationTaxSettingsInput | null = settingsRow
    ? {
        calculationEnabled: settingsRow.calculationEnabled,
        collectionEnabled: settingsRow.collectionEnabled,
        pricingMode:
          settingsRow.pricingMode === TAX_PRICING_MODES.TAX_INCLUSIVE
            ? TAX_PRICING_MODES.TAX_INCLUSIVE
            : TAX_PRICING_MODES.TAX_EXCLUSIVE,
        roundingMode: settingsRow.roundingMode,
        approvedAt: settingsRow.approvedAt?.toISOString() ?? null,
      }
    : null;

  let locationProfile: LocationTaxProfileInput | null = null;
  if (locationId && locationRow) {
    locationProfile = {
      locationId: locationRow.id,
      streetLine1: profileRow?.streetLine1 ?? null,
      city: profileRow?.city ?? null,
      region: profileRow?.region ?? null,
      postalCode: profileRow?.postalCode ?? null,
      country: profileRow?.country ?? null,
      countyName: profileRow?.countyName ?? null,
      jurisdictionCode: profileRow?.jurisdictionCode ?? null,
      jurisdictionResolved: profileRow?.jurisdictionResolved === true,
      taxTimeZone: profileRow?.taxTimeZone ?? null,
      locationTimezone: locationRow.timezone,
    };
  }

  return {
    settings,
    locationProfile,
    classifications: classificationRows.map((row) => ({
      id: row.id,
      productId: row.productId,
      componentKey: row.componentKey || null,
      classification: row.classification as ProductTaxClassificationRule["classification"],
      taxability: row.taxability as ProductTaxClassificationRule["taxability"],
      effectiveFrom: isoDate(row.effectiveFrom),
      effectiveTo: isoDate(row.effectiveTo),
    })),
    rates: rateRows.map((row) => ({
      id: row.id,
      locationId: row.locationId,
      taxType: row.taxType as TaxRateScheduleRule["taxType"],
      jurisdictionCode: row.jurisdictionCode,
      rateBps: row.rateBps,
      effectiveFrom: isoDate(row.effectiveFrom)!,
      effectiveTo: isoDate(row.effectiveTo),
      sourceUrl: row.sourceUrl,
      sourceCitation: row.sourceCitation,
      verificationStatus: row.verificationStatus,
      approvalStatus: row.approvalStatus,
      active: row.active,
      version: row.version,
    })),
    bundlePolicies: bundleRows.map((row) => ({
      id: row.id,
      productId: row.productId,
      treatment: row.treatment as BundleTaxPolicyRule["treatment"],
      version: row.version,
    })),
  };
}

export function toTaxCalculationInput(params: {
  organizationId: string;
  locationId: string | null;
  taxDate: string | null;
  lineItems: TaxCalculationInput["lineItems"];
  config: LoadedTaxConfig;
}): TaxCalculationInput {
  return {
    organizationId: params.organizationId,
    locationId: params.locationId,
    taxDate: params.taxDate,
    lineItems: params.lineItems,
    settings: params.config.settings,
    locationProfile: params.config.locationProfile,
    classifications: params.config.classifications,
    rates: params.config.rates,
    bundlePolicies: params.config.bundlePolicies,
  };
}
