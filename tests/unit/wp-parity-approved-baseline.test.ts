import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { WpIntakeAnswers } from "@/lib/event-planner/wp-intake-contract";
import {
  WP_APPROVED_PLUGIN_BASELINE_SOURCE,
  WP_APPROVED_PLUGIN_BASELINE_WARNING,
  WP_CATALOG_VERSION,
  buildApprovedPluginBaselineConfig,
  calculatePrivateWpRecommendationForOrganization,
  loadWpTenantParityConfig,
  resolveWpParityEngineConfig,
  wpCatalogDefaults,
  wpCatalogRevision,
} from "@/server/event-planner/wp-parity";

const GENERATIONS_ORG = "mdutc2nkvpafezukeem8942v";
const SYNTHETIC_TEST_ORG = "huqlb9wiygqegwo8fy53f8dw";
const OTHER_ORG = "org_other_tenant_xyz";

afterEach(() => {
  delete process.env.WP_PARITY_TENANT_PACK_PATH;
  delete process.env.WP_PARITY_TENANT_PACK_DIR;
  delete process.env.WP_APPROVED_PLUGIN_BASELINE_REGISTRY;
});

function answers(): WpIntakeAnswers {
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

describe("approved_plugin_baseline", () => {
  it("builds a complete pack from plugin catalog with empty custom packages", () => {
    const pack = buildApprovedPluginBaselineConfig(GENERATIONS_ORG);
    expect(pack.pricingSource).toBe(WP_APPROVED_PLUGIN_BASELINE_SOURCE);
    expect(pack.rulesVersion).toBe(WP_CATALOG_VERSION);
    expect(pack.catalog).toEqual(wpCatalogDefaults());
    expect(pack.packages).toEqual([]);
    expect(pack.pricingRevision).toBe(
      `${wpCatalogRevision(wpCatalogDefaults())}:approved_plugin_baseline`,
    );
  });

  it("resolves Generations org via registry to approved_plugin_baseline, not plugin_defaults or tenant_live", () => {
    const loaded = loadWpTenantParityConfig(GENERATIONS_ORG);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.origin).toBe("approved_plugin_baseline_registry");
    expect(loaded.tenantConfig.pricingSource).toBe("approved_plugin_baseline");

    const resolved = resolveWpParityEngineConfig({
      organizationId: GENERATIONS_ORG,
      tenantConfig: loaded.tenantConfig,
      allowPluginDefaults: true,
    });
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.pricingSource).toBe("approved_plugin_baseline");
    expect(resolved.warnings).toContain(WP_APPROVED_PLUGIN_BASELINE_WARNING);
    expect(resolved.config.catalog.food.salad).toBe(2499);
    expect(resolved.config.catalog.rooms.lower_extra).toBe(7500);
  });

  it("resolves the disposable synthetic test org via the same registry (not Generations-only)", () => {
    const loaded = loadWpTenantParityConfig(SYNTHETIC_TEST_ORG);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.origin).toBe("approved_plugin_baseline_registry");
    expect(loaded.tenantConfig.pricingSource).toBe("approved_plugin_baseline");
  });

  it("does not activate approved baseline for other organizations", () => {
    const loaded = loadWpTenantParityConfig(OTHER_ORG);
    expect(loaded.ok).toBe(false);
    if (loaded.ok) return;
    expect(loaded.reason).toBe("not_found");

    const resolved = resolveWpParityEngineConfig({
      organizationId: OTHER_ORG,
      allowPluginDefaults: true,
    });
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.pricingSource).toBe("plugin_defaults");
  });

  it("calculates Generations inquiries with approved baseline provenance", () => {
    const loaded = loadWpTenantParityConfig(GENERATIONS_ORG);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;

    const outcome = calculatePrivateWpRecommendationForOrganization(answers(), {
      organizationId: GENERATIONS_ORG,
      tenantConfig: loaded.tenantConfig,
      allowPluginDefaults: true,
    });
    expect(outcome.status).toBe("ready");
    expect(outcome.pricingSource).toBe("approved_plugin_baseline");
    expect(outcome.summary).toMatch(/Generations-approved WordPress plugin baseline/i);
    expect(outcome.snapshot?.valid).toBe(true);
    if (outcome.snapshot?.valid) {
      expect(outcome.snapshot.pricing_source).toBe("approved_plugin_baseline");
      expect(outcome.snapshot.calculated_at).toMatch(/^\d{4}-/);
      expect(outcome.snapshot.rules_version).toBe(WP_CATALOG_VERSION);
    }
  });

  it("lets an explicit tenant_live file override the approved baseline registry", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "wp-approved-override-"));
    const catalog = wpCatalogDefaults();
    catalog.bowling.shoes = 999;
    const pack = {
      organizationId: GENERATIONS_ORG,
      rulesVersion: WP_CATALOG_VERSION,
      pricingRevision: "file-live-rev",
      pricingSource: "tenant_live",
      catalog,
      packages: [],
      attractionKeyMap: {},
    };
    writeFileSync(path.join(dir, `${GENERATIONS_ORG}.json`), JSON.stringify(pack), "utf8");
    process.env.WP_PARITY_TENANT_PACK_DIR = dir;

    const loaded = loadWpTenantParityConfig(GENERATIONS_ORG);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.origin).toBe("file");
    expect(loaded.tenantConfig.pricingSource).toBe("tenant_live");
    expect(loaded.tenantConfig.catalog.bowling.shoes).toBe(999);
  });
});
