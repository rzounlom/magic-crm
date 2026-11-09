import {
  WP_APPROVED_PLUGIN_BASELINE_SOURCE,
  WP_APPROVED_PLUGIN_BASELINE_WARNING,
} from "@/server/event-planner/wp-parity/approved-plugin-baseline";
import {
  WP_CATALOG_VERSION,
  wpCatalogDefaults,
  wpCatalogFieldKeys,
  wpCatalogRevision,
  type WpCatalog,
} from "@/server/event-planner/wp-parity/catalog";
import type { PackageDefinition } from "@/server/event-planner/wp-parity/packages";
import type { EngineConfig } from "@/server/event-planner/wp-parity/types";

/**
 * Tenant pricing/configuration adapter for the WP-parity calculator.
 *
 * Pricing precedence (highest first):
 *
 *   1. Tenant pack (`tenant_live` or `approved_plugin_baseline`) supplied for the organization.
 *   2. `plugin_defaults` — unlabeled Generations Event Planner 3.3.0 `Catalog::defaults()`,
 *      only when explicitly allowed and no tenant pack was supplied.
 *
 * Pack kinds:
 * - `tenant_live` — verified live WordPress DB export (overrides + custom packages).
 * - `approved_plugin_baseline` — owner-approved plugin catalog files (no DB override claim).
 *
 * Rules:
 * - A tenant pack that is incomplete is NEVER silently completed from plugin defaults or the
 *   MagicCRM catalog. Result is `incomplete` with missing keys listed.
 * - Plugin defaults apply only when `allowPluginDefaults: true` and no tenant pack was supplied.
 * - This module is tenant-agnostic: it never branches on organization identity.
 */

export type WpResolvedPricingSource =
  | "plugin_defaults"
  | "tenant_live"
  | "approved_plugin_baseline";

export type WpPricingSource = WpResolvedPricingSource | "incomplete";

export type WpTenantPackPricingSource = "tenant_live" | "approved_plugin_baseline";

/** Optional mapping from WP attraction keys to tenant product/interest ids. */
export type WpAttractionKeyMap = Partial<
  Record<"bowling" | "axe" | "laser" | "golf" | "climbing" | "arcade", string>
>;

export type WpTenantParityConfig = {
  organizationId: string;
  rulesVersion: string;
  pricingRevision: string;
  pricingSource: WpTenantPackPricingSource;
  /** Full catalog required: every `Catalog::fields()` key must be present as integer cents. */
  catalog: WpCatalog;
  packages: PackageDefinition[];
  /** Optional product/interest ids per WP attraction key. */
  attractionKeyMap: WpAttractionKeyMap;
  /** If present and non-empty, the pack is treated as incomplete. */
  incompleteKeys?: string[];
};

export type ResolveWpParityEngineConfigInput = {
  organizationId: string;
  tenantConfig?: WpTenantParityConfig | null;
  /** Default `false`. Public intake passes `true` today so unlabeled plugin-default fallback continues for orgs without a pack. */
  allowPluginDefaults?: boolean;
};

export type ResolvedWpParityEngineConfig = {
  ok: true;
  organizationId: string;
  config: EngineConfig;
  pricingSource: WpResolvedPricingSource;
  pricingRevision: string;
  rulesVersion: string;
  attractionKeyMap: WpAttractionKeyMap;
  warnings: string[];
};

export type UnresolvedWpParityEngineConfig = {
  ok: false;
  organizationId: string;
  pricingSource: "incomplete";
  /** Missing/invalid keys, e.g. `tenant_config`, `catalog.bowling.shoes`, `packages`. */
  missing: string[];
  pricingRevision: string | null;
  rulesVersion: string | null;
  warnings: string[];
};

export type WpParityEngineConfigResolution =
  | ResolvedWpParityEngineConfig
  | UnresolvedWpParityEngineConfig;

export const WP_PLUGIN_DEFAULTS_WARNING =
  "Pricing uses Generations Event Planner 3.3.0 plugin defaults (testing baseline). These are not verified live tenant prices.";

export const WP_MISSING_TENANT_CONFIG_KEY = "tenant_config";

const TENANT_PACK_SOURCES: readonly WpTenantPackPricingSource[] = [
  "tenant_live",
  WP_APPROVED_PLUGIN_BASELINE_SOURCE,
];

function isValidCents(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= 1_000_000_000
  );
}

function readCatalogValue(catalog: unknown, key: string): unknown {
  if (!catalog || typeof catalog !== "object") {
    return undefined;
  }
  let cursor: unknown = catalog;
  for (const part of key.split(".")) {
    if (!cursor || typeof cursor !== "object") {
      return undefined;
    }
    cursor = (cursor as Record<string, unknown>)[part];
  }
  return cursor;
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isTenantPackPricingSource(value: unknown): value is WpTenantPackPricingSource {
  return typeof value === "string" && (TENANT_PACK_SOURCES as readonly string[]).includes(value);
}

/**
 * Keys that are missing or invalid in a tenant pack. Does not consult plugin defaults for
 * values — plugin defaults are consulted only for the list of required key names.
 */
export function listWpTenantConfigMissingKeys(
  tenantConfig: WpTenantParityConfig,
  organizationId: string,
): string[] {
  const missing: string[] = [];
  if (!nonEmpty(tenantConfig.organizationId)) {
    missing.push("organizationId");
  } else if (tenantConfig.organizationId !== organizationId) {
    missing.push("organizationId_mismatch");
  }
  if (!nonEmpty(tenantConfig.rulesVersion)) {
    missing.push("rulesVersion");
  }
  if (!nonEmpty(tenantConfig.pricingRevision)) {
    missing.push("pricingRevision");
  }
  if (!isTenantPackPricingSource(tenantConfig.pricingSource)) {
    missing.push("pricingSource");
  }
  if (!tenantConfig.catalog || typeof tenantConfig.catalog !== "object") {
    missing.push("catalog");
  } else {
    for (const key of wpCatalogFieldKeys(wpCatalogDefaults())) {
      if (!isValidCents(readCatalogValue(tenantConfig.catalog, key))) {
        missing.push(`catalog.${key}`);
      }
    }
  }
  if (!Array.isArray(tenantConfig.packages)) {
    missing.push("packages");
  }
  if (!tenantConfig.attractionKeyMap || typeof tenantConfig.attractionKeyMap !== "object") {
    missing.push("attractionKeyMap");
  }
  for (const key of tenantConfig.incompleteKeys ?? []) {
    if (!missing.includes(key)) {
      missing.push(key);
    }
  }
  return missing;
}

function warningsForPackSource(source: WpTenantPackPricingSource): string[] {
  if (source === WP_APPROVED_PLUGIN_BASELINE_SOURCE) {
    return [WP_APPROVED_PLUGIN_BASELINE_WARNING];
  }
  return [];
}

export function resolveWpParityEngineConfig(
  input: ResolveWpParityEngineConfigInput,
): WpParityEngineConfigResolution {
  const { organizationId, tenantConfig } = input;
  const allowPluginDefaults = input.allowPluginDefaults === true;

  // 1. Tenant pack — supplied pack wins. No silent fallback if incomplete.
  if (tenantConfig) {
    const missing = listWpTenantConfigMissingKeys(tenantConfig, organizationId);
    if (missing.length > 0) {
      return {
        ok: false,
        organizationId,
        pricingSource: "incomplete",
        missing,
        pricingRevision: nonEmpty(tenantConfig.pricingRevision) ? tenantConfig.pricingRevision : null,
        rulesVersion: nonEmpty(tenantConfig.rulesVersion) ? tenantConfig.rulesVersion : null,
        warnings: [
          "Tenant WP-parity pricing pack is incomplete; plugin defaults were NOT substituted. Staff review required.",
        ],
      };
    }
    return {
      ok: true,
      organizationId,
      config: {
        catalog: structuredClone(tenantConfig.catalog),
        packages: tenantConfig.packages.map((pack) => structuredClone(pack)),
      },
      pricingSource: tenantConfig.pricingSource,
      pricingRevision: tenantConfig.pricingRevision,
      rulesVersion: tenantConfig.rulesVersion,
      attractionKeyMap: { ...tenantConfig.attractionKeyMap },
      warnings: warningsForPackSource(tenantConfig.pricingSource),
    };
  }

  // 2. plugin_defaults — only when explicitly allowed (orgs without a tenant pack).
  if (allowPluginDefaults) {
    const catalog = wpCatalogDefaults();
    return {
      ok: true,
      organizationId,
      config: { catalog, packages: [] },
      pricingSource: "plugin_defaults",
      pricingRevision: wpCatalogRevision(catalog),
      rulesVersion: WP_CATALOG_VERSION,
      attractionKeyMap: {},
      warnings: [WP_PLUGIN_DEFAULTS_WARNING],
    };
  }

  return {
    ok: false,
    organizationId,
    pricingSource: "incomplete",
    missing: [WP_MISSING_TENANT_CONFIG_KEY],
    pricingRevision: null,
    rulesVersion: null,
    warnings: [
      "No tenant WP-parity pricing pack is loaded and plugin defaults are not allowed. Staff review required.",
    ],
  };
}
