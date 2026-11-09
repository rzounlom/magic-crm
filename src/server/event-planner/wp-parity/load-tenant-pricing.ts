import { existsSync, readFileSync } from "node:fs";

import { tryBuildApprovedPluginBaselineConfig } from "@/server/event-planner/wp-parity/approved-plugin-baseline";
import {
  importWpPricingExportToTenantConfig,
  parseWpPricingExport,
} from "@/server/event-planner/wp-parity/pricing-export";
import type { WpTenantParityConfig } from "@/server/event-planner/wp-parity/tenant-config";

/**
 * Load a tenant WP-parity pricing pack for an organization.
 *
 * Resolution order:
 * 1. Explicit pack file via `WP_PARITY_TENANT_PACK_PATH` or `WP_PARITY_TENANT_PACK_DIR`
 *    (tests / local import only — avoided on the default Production path so Next does not
 *    bundle filesystem reads into the inquiry route)
 * 2. Approved plugin-baseline registry (static JSON; owner-approved catalog)
 *
 * Returns not_found when no pack applies so callers can keep unlabeled `plugin_defaults`
 * fallback for other tenants.
 */

export type LoadWpTenantPricingResult =
  | {
      ok: true;
      tenantConfig: WpTenantParityConfig;
      packPath: string | null;
      origin: "file" | "approved_plugin_baseline_registry";
    }
  | { ok: false; reason: "not_found" | "invalid"; detail: string; packPath: string | null };

function isTenantPackRecord(
  raw: unknown,
  organizationId: string,
): raw is WpTenantParityConfig & { _importMeta?: unknown } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return false;
  }
  const record = raw as { pricingSource?: string; organizationId?: string };
  if (record.organizationId !== organizationId) {
    return false;
  }
  return record.pricingSource === "tenant_live" || record.pricingSource === "approved_plugin_baseline";
}

function resolveExplicitPackPath(organizationId: string): string | null {
  const exact = process.env.WP_PARITY_TENANT_PACK_PATH?.trim();
  if (exact) {
    return exact;
  }
  const dir = process.env.WP_PARITY_TENANT_PACK_DIR?.trim();
  if (!dir) {
    return null;
  }
  return `${dir.replace(/\/$/, "")}/${organizationId}.json`;
}

function loadPackFromExplicitFile(
  organizationId: string,
  packPath: string,
): LoadWpTenantPricingResult {
  if (!existsSync(packPath)) {
    return {
      ok: false,
      reason: "not_found",
      detail: `Explicit pricing pack path not found: ${packPath}`,
      packPath,
    };
  }
  try {
    const raw = JSON.parse(readFileSync(packPath, "utf8")) as unknown;
    if (isTenantPackRecord(raw, organizationId)) {
      const { _importMeta: _ignored, ...pack } = raw;
      void _ignored;
      return {
        ok: true,
        tenantConfig: structuredClone(pack),
        packPath,
        origin: "file",
      };
    }
    const parsed = parseWpPricingExport(raw);
    if (!parsed.ok) {
      return {
        ok: false,
        reason: "invalid",
        detail: parsed.errors.join("; "),
        packPath,
      };
    }
    const imported = importWpPricingExportToTenantConfig({
      organizationId,
      export: parsed.export,
      requireLiveSource: true,
    });
    if (!imported.ok) {
      return {
        ok: false,
        reason: "invalid",
        detail: imported.errors.join("; "),
        packPath,
      };
    }
    return {
      ok: true,
      tenantConfig: imported.tenantConfig,
      packPath,
      origin: "file",
    };
  } catch (error) {
    return {
      ok: false,
      reason: "invalid",
      detail: error instanceof Error ? error.message : "Unable to read pricing pack",
      packPath,
    };
  }
}

export function resolveWpTenantPackPath(organizationId: string): string | null {
  return resolveExplicitPackPath(organizationId);
}

export function loadWpTenantParityConfig(organizationId: string): LoadWpTenantPricingResult {
  const packPath = resolveExplicitPackPath(organizationId);
  if (packPath) {
    return loadPackFromExplicitFile(organizationId, packPath);
  }

  const approved = tryBuildApprovedPluginBaselineConfig(organizationId);
  if (approved) {
    return {
      ok: true,
      tenantConfig: approved,
      packPath: null,
      origin: "approved_plugin_baseline_registry",
    };
  }

  return {
    ok: false,
    reason: "not_found",
    detail: "No tenant WP-parity pricing pack or approved plugin baseline for this organization.",
    packPath: null,
  };
}

/** Convenience: null when missing/invalid (inquiry path may keep plugin_defaults fallback). */
export function tryLoadWpTenantParityConfig(organizationId: string): WpTenantParityConfig | null {
  const result = loadWpTenantParityConfig(organizationId);
  return result.ok ? result.tenantConfig : null;
}
