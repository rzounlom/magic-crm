import {
  WP_CATALOG_VERSION,
  wpCatalogDefaults,
  wpCatalogRevision,
} from "@/server/event-planner/wp-parity/catalog";
import defaultRegistryJson from "@/server/event-planner/wp-parity/data/approved-plugin-baseline-orgs.json";
import type { WpTenantParityConfig } from "@/server/event-planner/wp-parity/tenant-config";

/**
 * Owner-approved WordPress Event Planner 3.3.0 plugin catalog baseline.
 *
 * Distinct from:
 * - `plugin_defaults` — unlabeled testing fallback when no tenant pack exists
 * - `tenant_live` — verified live WordPress DB export (overrides + custom packages)
 *
 * Uses `wpCatalogDefaults()` only (matches PHP `Catalog::defaults()`). Does not invent
 * prices or custom packages. Tenant activation is data-driven via the org registry —
 * no runtime branch on organization name/slug.
 */

export const WP_APPROVED_PLUGIN_BASELINE_SOURCE = "approved_plugin_baseline" as const;

export const WP_APPROVED_PLUGIN_BASELINE_WARNING =
  "Using Generations-approved Event Planner pricing. Final price verification required before operational go-live.";

export type ApprovedPluginBaselineRegistry = {
  format: "wp_approved_plugin_baseline_orgs_v1";
  catalogVersion: string;
  source: typeof WP_APPROVED_PLUGIN_BASELINE_SOURCE;
  approvalBasis: string;
  finalLivePriceRevalidation: "pending" | "complete";
  notes?: string[];
  organizationIds: string[];
};

function parseRegistry(raw: unknown): ApprovedPluginBaselineRegistry {
  const registry = raw as ApprovedPluginBaselineRegistry;
  if (registry.format !== "wp_approved_plugin_baseline_orgs_v1") {
    throw new Error(`Unsupported approved baseline registry format: ${String(registry.format)}`);
  }
  if (!Array.isArray(registry.organizationIds)) {
    throw new Error("approved-plugin-baseline registry missing organizationIds");
  }
  return registry;
}

/** Bundled registry (static import — safe for Next server bundles). */
export function loadApprovedPluginBaselineRegistry(
  override?: ApprovedPluginBaselineRegistry,
): ApprovedPluginBaselineRegistry {
  if (override) {
    return parseRegistry(override);
  }
  return parseRegistry(defaultRegistryJson);
}

export function organizationUsesApprovedPluginBaseline(
  organizationId: string,
  registry: ApprovedPluginBaselineRegistry = loadApprovedPluginBaselineRegistry(),
): boolean {
  return registry.organizationIds.includes(organizationId);
}

/** Build a complete tenant pack from the approved plugin catalog (empty custom packages). */
export function buildApprovedPluginBaselineConfig(
  organizationId: string,
  registry: ApprovedPluginBaselineRegistry = loadApprovedPluginBaselineRegistry(),
): WpTenantParityConfig {
  const catalog = wpCatalogDefaults();
  const catalogRevision = wpCatalogRevision(catalog);
  return {
    organizationId,
    rulesVersion: registry.catalogVersion || WP_CATALOG_VERSION,
    pricingRevision: `${catalogRevision}:approved_plugin_baseline`,
    pricingSource: WP_APPROVED_PLUGIN_BASELINE_SOURCE,
    catalog,
    packages: [],
    attractionKeyMap: {},
  };
}

export function tryBuildApprovedPluginBaselineConfig(
  organizationId: string,
): WpTenantParityConfig | null {
  try {
    const registry = loadApprovedPluginBaselineRegistry();
    if (!organizationUsesApprovedPluginBaseline(organizationId, registry)) {
      return null;
    }
    return buildApprovedPluginBaselineConfig(organizationId, registry);
  } catch {
    return null;
  }
}
