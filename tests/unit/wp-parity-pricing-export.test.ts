import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  WP_CATALOG_VERSION,
  recommendWpParity,
  sampleWpInquiry,
  wpCatalogDefaults,
  wpCatalogRevision,
} from "@/server/event-planner/wp-parity";
import { loadWpTenantParityConfig } from "@/server/event-planner/wp-parity/load-tenant-pricing";
import {
  buildPluginDefaultsPricingExport,
  importWpPricingExportToTenantConfig,
  parseWpPricingExport,
} from "@/server/event-planner/wp-parity/pricing-export";
import { calculatePrivateWpRecommendationForOrganization } from "@/server/event-planner/wp-parity/from-intake";
import type { WpIntakeAnswers } from "@/lib/event-planner/wp-intake-contract";

const ORG = "org_pricing_export_test";

afterEach(() => {
  delete process.env.WP_PARITY_TENANT_PACK_PATH;
  delete process.env.WP_PARITY_TENANT_PACK_DIR;
});

function bowlingAnswers(): WpIntakeAnswers {
  return {
    firstName: "Ada",
    lastName: "Lovelace",
    company: "Analytical Engines",
    phone: "5745550100",
    email: "ada@example.com",
    eventType: "Birthday",
    dates: ["2026-11-06"],
    time: "13:00",
    adults: 6,
    children: 0,
    duration: "3 hours",
    otherHours: null,
    minutes: 180,
    attractions: { bowling: "yes", axe: "no", laser: "no", golf: "no", climbing: "no", arcade: "no" },
    food: "no",
    privateRoom: "no",
    craft: "no",
    hasBudget: "no",
    budgetCents: null,
    description: "Birthday",
    comments: null,
    referral: "Friend",
  };
}

describe("WordPress pricing export import", () => {
  it("parses a plugin-defaults snapshot and refuses tenant_live import by default", () => {
    const snapshot = buildPluginDefaultsPricingExport();
    const parsed = parseWpPricingExport(snapshot);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.export.catalog_revision).toBe(wpCatalogRevision(wpCatalogDefaults()));
    expect(parsed.export.catalog_version).toBe(WP_CATALOG_VERSION);

    const refused = importWpPricingExportToTenantConfig({
      organizationId: ORG,
      export: parsed.export,
    });
    expect(refused.ok).toBe(false);
  });

  it("imports a live_wordpress export with overrides as tenant_live and drives cents totals", () => {
    const snapshot = buildPluginDefaultsPricingExport();
    snapshot.effective_source = "live_wordpress";
    snapshot.site_host = "example.test";
    snapshot.catalog_effective.bowling.hour_weekend = 5555;
    snapshot.catalog_revision = wpCatalogRevision(snapshot.catalog_effective);
    snapshot.price_diffs_from_defaults = { "bowling.hour_weekend": 5555 };
    snapshot.price_overrides_option = { "bowling.hour_weekend": 5555 };

    const parsed = parseWpPricingExport(snapshot);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const imported = importWpPricingExportToTenantConfig({
      organizationId: ORG,
      export: parsed.export,
    });
    expect(imported.ok).toBe(true);
    if (!imported.ok) return;
    expect(imported.tenantConfig.pricingSource).toBe("tenant_live");
    expect(imported.tenantConfig.catalog.bowling.hour_weekend).toBe(5555);
    expect(imported.priceDiffCount).toBe(1);

    const outcome = calculatePrivateWpRecommendationForOrganization(bowlingAnswers(), {
      organizationId: ORG,
      tenantConfig: imported.tenantConfig,
      allowPluginDefaults: true,
    });
    expect(outcome.pricingSource).toBe("tenant_live");
    expect(outcome.status).toBe("ready");
    expect(outcome.snapshot?.valid).toBe(true);
    if (outcome.snapshot?.valid) {
      expect(outcome.snapshot.calculated_at).toMatch(/^\d{4}-/);
      expect(outcome.snapshot.pricing_source).toBe("tenant_live");
    }

    const pluginDefault = recommendWpParity(sampleWpInquiry());
    expect(pluginDefault.valid).toBe(true);
  });

  it("loads a written tenant pack from disk for an organization", () => {
    const snapshot = buildPluginDefaultsPricingExport();
    snapshot.effective_source = "live_wordpress";
    snapshot.catalog_effective.axe.half = 1999;
    snapshot.catalog_revision = wpCatalogRevision(snapshot.catalog_effective);
    const imported = importWpPricingExportToTenantConfig({
      organizationId: ORG,
      export: snapshot,
    });
    expect(imported.ok).toBe(true);
    if (!imported.ok) return;

    const dir = mkdtempSync(path.join(tmpdir(), "wp-parity-pack-"));
    const packPath = path.join(dir, `${ORG}.json`);
    writeFileSync(packPath, JSON.stringify(imported.tenantConfig), "utf8");
    process.env.WP_PARITY_TENANT_PACK_DIR = dir;

    const loaded = loadWpTenantParityConfig(ORG);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.tenantConfig.catalog.axe.half).toBe(1999);
    expect(loaded.tenantConfig.pricingSource).toBe("tenant_live");
  });
});
