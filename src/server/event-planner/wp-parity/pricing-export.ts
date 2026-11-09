import { createHash } from "node:crypto";

import {
  WP_CATALOG_VERSION,
  applyWpCatalogOverrides,
  wpCatalogDefaults,
  wpCatalogFieldKeys,
  wpCatalogRevision,
  type WpCatalog,
} from "@/server/event-planner/wp-parity/catalog";
import {
  validatePackageDefinition,
  type PackageDefinition,
} from "@/server/event-planner/wp-parity/packages";
import type {
  WpAttractionKeyMap,
  WpTenantParityConfig,
} from "@/server/event-planner/wp-parity/tenant-config";

/**
 * WordPress → MagicCRM effective pricing export format (`gapnext_effective_pricing_v1`).
 *
 * Only exports with `effective_source: "live_wordpress"` may become `tenant_live`.
 * Plugin-default snapshots are for pipeline/reconcile testing and must not activate live pricing.
 */

export const WP_PRICING_EXPORT_FORMAT = "gapnext_effective_pricing_v1" as const;

export type WpPricingExportEffectiveSource = "live_wordpress" | "plugin_defaults_snapshot";

export type WpPricingExportTax = {
  food_beverage_rate: number;
  note?: string;
};

export type WpPricingExportV1 = {
  format: typeof WP_PRICING_EXPORT_FORMAT;
  effective_source: WpPricingExportEffectiveSource;
  plugin_version: string | null;
  catalog_version: string;
  rules_version: string;
  exported_at: string;
  site_host: string | null;
  catalog_revision: string;
  packages_revision: string | null;
  prices_updated: Record<string, unknown> | null;
  tax: WpPricingExportTax;
  engine_embedded_rules?: {
    weekday_specials?: boolean;
    package_eligibility?: boolean;
    arcade_credit_allocation?: boolean;
    note?: string;
  };
  catalog_defaults: WpCatalog;
  catalog_effective: WpCatalog;
  price_overrides_option: Record<string, unknown>;
  price_diffs_from_defaults: Record<string, number>;
  custom_packages_all: unknown[];
  custom_packages_active: unknown[];
};

export type ParseWpPricingExportResult =
  | { ok: true; export: WpPricingExportV1 }
  | { ok: false; errors: string[] };

export type ImportWpPricingExportInput = {
  organizationId: string;
  export: WpPricingExportV1;
  /** Required for tenant_live. Refuses plugin_defaults_snapshot unless explicitly allowed for tests. */
  requireLiveSource?: boolean;
  attractionKeyMap?: WpAttractionKeyMap;
};

export type ImportWpPricingExportResult =
  | {
      ok: true;
      tenantConfig: WpTenantParityConfig;
      configurationHash: string;
      activePackageCount: number;
      priceDiffCount: number;
      warnings: string[];
    }
  | { ok: false; errors: string[] };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidCents(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= 1_000_000_000
  );
}

function readCatalogValue(catalog: unknown, key: string): unknown {
  if (!isPlainObject(catalog)) return undefined;
  let cursor: unknown = catalog;
  for (const part of key.split(".")) {
    if (!isPlainObject(cursor)) return undefined;
    cursor = cursor[part];
  }
  return cursor;
}

function validateCatalogShape(catalog: unknown, prefix: string, errors: string[]): catalog is WpCatalog {
  if (!isPlainObject(catalog)) {
    errors.push(`${prefix} must be an object`);
    return false;
  }
  let ok = true;
  for (const key of wpCatalogFieldKeys()) {
    if (!isValidCents(readCatalogValue(catalog, key))) {
      errors.push(`${prefix}.${key} must be integer cents`);
      ok = false;
    }
  }
  return ok;
}

function normalizePackage(raw: unknown, index: number, errors: string[]): PackageDefinition | null {
  if (!isPlainObject(raw)) {
    errors.push(`custom_packages_active[${index}] must be an object`);
    return null;
  }
  // Already-validated PHP/TS shape (integer cents + booleans).
  if (
    typeof raw.price === "number" &&
    typeof raw.credit === "number" &&
    typeof raw.food_amount === "number" &&
    typeof raw.shoes === "boolean"
  ) {
    const candidate = raw as unknown as PackageDefinition;
    if (!candidate.id || !candidate.name || !candidate.status) {
      errors.push(`custom_packages_active[${index}] is missing id/name/status`);
      return null;
    }
    return structuredClone(candidate);
  }
  // Form-shaped raw strings → Packages::validate().
  const validated = validatePackageDefinition(raw);
  if (!validated.ok) {
    errors.push(`custom_packages_active[${index}]: ${validated.error}`);
    return null;
  }
  return validated.data;
}

/**
 * Parse and validate a WordPress pricing export JSON document.
 * Does not invent prices; rejects unknown formats and incomplete catalogs.
 */
export function parseWpPricingExport(raw: unknown): ParseWpPricingExportResult {
  const errors: string[] = [];
  if (!isPlainObject(raw)) {
    return { ok: false, errors: ["Export must be a JSON object"] };
  }
  if (raw.format !== WP_PRICING_EXPORT_FORMAT) {
    errors.push(`Unsupported format (expected ${WP_PRICING_EXPORT_FORMAT})`);
  }
  if (raw.effective_source !== "live_wordpress" && raw.effective_source !== "plugin_defaults_snapshot") {
    errors.push('effective_source must be "live_wordpress" or "plugin_defaults_snapshot"');
  }
  if (typeof raw.catalog_version !== "string" || raw.catalog_version.trim() === "") {
    errors.push("catalog_version is required");
  }
  if (typeof raw.rules_version !== "string" || raw.rules_version.trim() === "") {
    errors.push("rules_version is required");
  }
  if (typeof raw.exported_at !== "string" || raw.exported_at.trim() === "") {
    errors.push("exported_at is required");
  }
  if (typeof raw.catalog_revision !== "string" || raw.catalog_revision.trim() === "") {
    errors.push("catalog_revision is required");
  }
  if (!isPlainObject(raw.tax) || typeof raw.tax.food_beverage_rate !== "number") {
    errors.push("tax.food_beverage_rate is required");
  }
  validateCatalogShape(raw.catalog_defaults, "catalog_defaults", errors);
  validateCatalogShape(raw.catalog_effective, "catalog_effective", errors);
  if (!isPlainObject(raw.price_overrides_option)) {
    errors.push("price_overrides_option must be an object");
  }
  if (!isPlainObject(raw.price_diffs_from_defaults)) {
    errors.push("price_diffs_from_defaults must be an object");
  }
  if (!Array.isArray(raw.custom_packages_all)) {
    errors.push("custom_packages_all must be an array");
  }
  if (!Array.isArray(raw.custom_packages_active)) {
    errors.push("custom_packages_active must be an array");
  }
  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const catalogEffective = raw.catalog_effective as unknown as WpCatalog;
  const expectedRevision = wpCatalogRevision(catalogEffective);
  if (raw.catalog_revision !== expectedRevision) {
    errors.push(
      `catalog_revision mismatch: export has ${String(raw.catalog_revision)}, recomputed ${expectedRevision}`,
    );
  }
  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    export: {
      format: WP_PRICING_EXPORT_FORMAT,
      effective_source: raw.effective_source as WpPricingExportEffectiveSource,
      plugin_version: typeof raw.plugin_version === "string" ? raw.plugin_version : null,
      catalog_version: raw.catalog_version as string,
      rules_version: raw.rules_version as string,
      exported_at: raw.exported_at as string,
      site_host: typeof raw.site_host === "string" ? raw.site_host : null,
      catalog_revision: raw.catalog_revision as string,
      packages_revision: typeof raw.packages_revision === "string" ? raw.packages_revision : null,
      prices_updated: isPlainObject(raw.prices_updated) ? raw.prices_updated : null,
      tax: {
        food_beverage_rate: (raw.tax as WpPricingExportTax).food_beverage_rate,
        note: typeof (raw.tax as WpPricingExportTax).note === "string" ? (raw.tax as WpPricingExportTax).note : undefined,
      },
      engine_embedded_rules: isPlainObject(raw.engine_embedded_rules)
        ? (raw.engine_embedded_rules as WpPricingExportV1["engine_embedded_rules"])
        : undefined,
      catalog_defaults: raw.catalog_defaults as unknown as WpCatalog,
      catalog_effective: catalogEffective,
      price_overrides_option: raw.price_overrides_option as Record<string, unknown>,
      price_diffs_from_defaults: raw.price_diffs_from_defaults as Record<string, number>,
      custom_packages_all: raw.custom_packages_all as unknown[],
      custom_packages_active: raw.custom_packages_active as unknown[],
    },
  };
}

/** Stable hash of the imported configuration (catalog + active packages + tax rate). */
export function wpPricingConfigurationHash(
  catalog: WpCatalog,
  packages: PackageDefinition[],
  taxRate: number,
): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        catalog,
        packages,
        tax: taxRate,
      }),
    )
    .digest("hex")
    .slice(0, 16);
}

/**
 * Convert a parsed WordPress export into a tenant WP-parity pack.
 * Live source is required by default — plugin-default snapshots cannot become tenant_live silently.
 */
export function importWpPricingExportToTenantConfig(
  input: ImportWpPricingExportInput,
): ImportWpPricingExportResult {
  const requireLive = input.requireLiveSource !== false;
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!input.organizationId.trim()) {
    errors.push("organizationId is required");
  }
  if (requireLive && input.export.effective_source !== "live_wordpress") {
    errors.push(
      `Refusing to import effective_source=${input.export.effective_source} as tenant_live. Install the WordPress export and use a live_wordpress JSON.`,
    );
  }
  if (input.export.tax.food_beverage_rate !== 0.07) {
    warnings.push(
      `Export tax rate is ${input.export.tax.food_beverage_rate}; MagicCRM WP-parity engine hardcodes 0.07 F&B tax like the plugin.`,
    );
  }
  if (input.export.catalog_version !== WP_CATALOG_VERSION) {
    warnings.push(
      `Export catalog_version ${input.export.catalog_version} differs from MagicCRM port ${WP_CATALOG_VERSION}.`,
    );
  }

  const packages: PackageDefinition[] = [];
  input.export.custom_packages_active.forEach((raw, index) => {
    const def = normalizePackage(raw, index, errors);
    if (def) {
      if (def.status !== "active") {
        warnings.push(`Package ${def.id || index} status is ${def.status}; expected active.`);
      }
      packages.push(def);
    }
  });

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const catalog = structuredClone(input.export.catalog_effective);
  const configurationHash = wpPricingConfigurationHash(
    catalog,
    packages,
    input.export.tax.food_beverage_rate,
  );
  const pricingRevision = `${input.export.catalog_revision}:${configurationHash}`;

  const tenantConfig: WpTenantParityConfig = {
    organizationId: input.organizationId,
    rulesVersion: input.export.rules_version,
    pricingRevision,
    pricingSource: "tenant_live",
    catalog,
    packages,
    attractionKeyMap: { ...(input.attractionKeyMap ?? {}) },
  };

  return {
    ok: true,
    tenantConfig,
    configurationHash,
    activePackageCount: packages.length,
    priceDiffCount: Object.keys(input.export.price_diffs_from_defaults).length,
    warnings,
  };
}

/**
 * Build a non-live export document from the TypeScript plugin defaults.
 * Useful for reconcile / pipeline tests. Never activates tenant_live.
 */
export function buildPluginDefaultsPricingExport(now: Date = new Date()): WpPricingExportV1 {
  const catalog = wpCatalogDefaults();
  return {
    format: WP_PRICING_EXPORT_FORMAT,
    effective_source: "plugin_defaults_snapshot",
    plugin_version: "3.3.0",
    catalog_version: WP_CATALOG_VERSION,
    rules_version: WP_CATALOG_VERSION,
    exported_at: now.toISOString(),
    site_host: null,
    catalog_revision: wpCatalogRevision(catalog),
    packages_revision: null,
    prices_updated: null,
    tax: {
      food_beverage_rate: 0.07,
      note: "Hardcoded in Engine line-item tax for F&B; not a WP option.",
    },
    engine_embedded_rules: {
      weekday_specials: true,
      package_eligibility: true,
      arcade_credit_allocation: true,
      note: "Specials and eligibility live in Engine/Packages, not separate option rows.",
    },
    catalog_defaults: structuredClone(catalog),
    catalog_effective: structuredClone(catalog),
    price_overrides_option: {},
    price_diffs_from_defaults: {},
    custom_packages_all: [],
    custom_packages_active: [],
  };
}

/** Apply flat override map onto plugin defaults (parity with Catalog::all()). */
export function effectiveCatalogFromOverrides(
  overrides: Record<string, unknown>,
): WpCatalog {
  return applyWpCatalogOverrides(overrides, wpCatalogDefaults());
}
