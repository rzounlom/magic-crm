import { describe, expect, it } from "vitest";

import type { WpIntakeAnswers } from "@/lib/event-planner/wp-intake-contract";
import {
  WP_CATALOG_VERSION,
  wpCatalogDefaults,
  wpCatalogRevision,
  type WpCatalog,
} from "@/server/event-planner/wp-parity/catalog";
import { calculatePrivateWpRecommendationForOrganization } from "@/server/event-planner/wp-parity/from-intake";
import {
  resolveWpParityEngineConfig,
  type WpTenantParityConfig,
} from "@/server/event-planner/wp-parity/tenant-config";

const ORG = "org_tenant_a";

function tenantPack(overrides: Partial<WpTenantParityConfig> = {}): WpTenantParityConfig {
  const catalog = wpCatalogDefaults();
  // Distinct tenant prices so we can prove they (not plugin defaults) drive the engine.
  catalog.bowling.hour_weekend = 5000;
  catalog.bowling.hour_weekday = 3500;
  return {
    organizationId: ORG,
    rulesVersion: "tenant-rules-1",
    pricingRevision: "tenant-rev-7",
    pricingSource: "tenant_live",
    catalog,
    packages: [],
    attractionKeyMap: { bowling: "interest_bowling" },
    ...overrides,
  };
}

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

describe("resolveWpParityEngineConfig precedence", () => {
  it("prefers a complete tenant_live pack over plugin defaults, even when defaults are allowed", () => {
    const result = resolveWpParityEngineConfig({
      organizationId: ORG,
      tenantConfig: tenantPack(),
      allowPluginDefaults: true,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.pricingSource).toBe("tenant_live");
    expect(result.pricingRevision).toBe("tenant-rev-7");
    expect(result.rulesVersion).toBe("tenant-rules-1");
    expect(result.config.catalog.bowling.hour_weekend).toBe(5000);
    expect(result.attractionKeyMap).toEqual({ bowling: "interest_bowling" });
    expect(result.warnings).toEqual([]);
  });

  it("does not alias the tenant catalog (engine config is a copy)", () => {
    const pack = tenantPack();
    const result = resolveWpParityEngineConfig({ organizationId: ORG, tenantConfig: pack });
    if (!result.ok) throw new Error("expected ok");
    result.config.catalog.bowling.shoes = 1;
    expect(pack.catalog.bowling.shoes).toBe(wpCatalogDefaults().bowling.shoes);
  });
});

describe("resolveWpParityEngineConfig plugin_defaults path", () => {
  it("uses plugin defaults only when explicitly allowed and no tenant pack exists", () => {
    const result = resolveWpParityEngineConfig({ organizationId: ORG, allowPluginDefaults: true });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.pricingSource).toBe("plugin_defaults");
    expect(result.rulesVersion).toBe(WP_CATALOG_VERSION);
    expect(result.pricingRevision).toBe(wpCatalogRevision(wpCatalogDefaults()));
    expect(result.config.catalog).toEqual(wpCatalogDefaults());
    expect(result.warnings.join(" ")).toMatch(/plugin defaults/i);
  });

  it("refuses plugin defaults by default (no pack, not allowed => incomplete)", () => {
    const result = resolveWpParityEngineConfig({ organizationId: ORG });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.pricingSource).toBe("incomplete");
    expect(result.missing).toEqual(["tenant_config"]);
  });
});

describe("resolveWpParityEngineConfig incomplete rejection", () => {
  it("never falls back to plugin defaults when a supplied tenant pack is missing catalog keys", () => {
    const catalog = wpCatalogDefaults() as unknown as Record<string, Record<string, number>>;
    delete catalog.bowling!.shoes;
    delete catalog.food!.bbq;
    const result = resolveWpParityEngineConfig({
      organizationId: ORG,
      tenantConfig: tenantPack({ catalog: catalog as unknown as WpCatalog }),
      allowPluginDefaults: true,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.pricingSource).toBe("incomplete");
    expect(result.missing).toEqual(["catalog.bowling.shoes", "catalog.food.bbq"]);
  });

  it("flags invalid (non-integer / negative) prices and a missing top-level scalar", () => {
    const catalog = wpCatalogDefaults() as unknown as Record<string, unknown>;
    (catalog.golf as Record<string, number>).adult = 10.5;
    (catalog.axe as Record<string, number>).half = -1;
    delete catalog.climb;
    const result = resolveWpParityEngineConfig({
      organizationId: ORG,
      tenantConfig: tenantPack({ catalog: catalog as unknown as WpCatalog }),
      allowPluginDefaults: true,
    });
    if (result.ok) throw new Error("expected incomplete");
    expect(result.missing).toEqual(
      expect.arrayContaining(["catalog.axe.half", "catalog.golf.adult", "catalog.climb"]),
    );
  });

  it("treats incompleteKeys as incomplete and lists them", () => {
    const result = resolveWpParityEngineConfig({
      organizationId: ORG,
      tenantConfig: tenantPack({ incompleteKeys: ["packages.birthday_basic"] }),
      allowPluginDefaults: true,
    });
    if (result.ok) throw new Error("expected incomplete");
    expect(result.missing).toEqual(["packages.birthday_basic"]);
  });

  it("rejects a pack for a different organization and missing versions", () => {
    const result = resolveWpParityEngineConfig({
      organizationId: ORG,
      tenantConfig: tenantPack({
        organizationId: "org_other",
        rulesVersion: "",
        pricingRevision: " ",
      }),
      allowPluginDefaults: true,
    });
    if (result.ok) throw new Error("expected incomplete");
    expect(result.missing).toEqual(["organizationId_mismatch", "rulesVersion", "pricingRevision"]);
  });
});

describe("calculatePrivateWpRecommendationForOrganization", () => {
  it("records plugin_defaults and organizationId in outcome and snapshot", () => {
    const outcome = calculatePrivateWpRecommendationForOrganization(answers(), {
      organizationId: ORG,
      allowPluginDefaults: true,
    });
    expect(outcome.status).toBe("ready");
    expect(outcome.pricingSource).toBe("plugin_defaults");
    expect(outcome.organizationId).toBe(ORG);
    expect(outcome.missingKeys).toEqual([]);
    expect(outcome.snapshot?.pricing_source).toBe("plugin_defaults");
    expect(outcome.snapshot?.organization_id).toBe(ORG);
    expect(outcome.summary).toMatch(/plugin defaults/);
    if (outcome.snapshot?.valid) {
      expect(outcome.snapshot.dates[0]?.recommendation.total_cents).toBe(10_100);
    }
  });

  it("calculates from tenant_live prices and records tenant revision", () => {
    const outcome = calculatePrivateWpRecommendationForOrganization(answers(), {
      organizationId: ORG,
      tenantConfig: tenantPack(),
      allowPluginDefaults: true,
    });
    expect(outcome.status).toBe("ready");
    expect(outcome.pricingSource).toBe("tenant_live");
    expect(outcome.pricingRevision).toBe("tenant-rev-7");
    expect(outcome.rulesVersion).toBe("tenant-rules-1");
    expect(outcome.snapshot?.pricing_source).toBe("tenant_live");
    if (outcome.snapshot?.valid) {
      expect(outcome.snapshot.pricing_revision).toBe("tenant-rev-7");
      // Friday weekend bowling is higher than the plugin-default $101.00 total.
      expect(outcome.snapshot.dates[0]?.recommendation.total_cents).toBeGreaterThan(10_100);
    }
  });

  it("returns incomplete (no snapshot prices) with missing keys when tenant pack is incomplete", () => {
    const catalog = wpCatalogDefaults() as unknown as Record<string, Record<string, number>>;
    delete catalog.bowling!.hour_weekend;
    const outcome = calculatePrivateWpRecommendationForOrganization(answers(), {
      organizationId: ORG,
      tenantConfig: tenantPack({ catalog: catalog as unknown as WpCatalog }),
      allowPluginDefaults: true,
    });
    expect(outcome.status).toBe("incomplete");
    expect(outcome.pricingSource).toBe("incomplete");
    expect(outcome.missingKeys).toEqual(["catalog.bowling.hour_weekend"]);
    expect(outcome.summary).toContain("catalog.bowling.hour_weekend");
    expect(outcome.snapshot?.valid).toBe(false);
    expect(outcome.snapshot?.pricing_source).toBe("incomplete");
    expect(outcome.snapshot?.organization_id).toBe(ORG);
    expect(outcome.snapshot && !outcome.snapshot.valid && outcome.snapshot.missing_keys).toEqual([
      "catalog.bowling.hour_weekend",
    ]);
  });

  it("returns incomplete when no pack exists and plugin defaults are not allowed", () => {
    const outcome = calculatePrivateWpRecommendationForOrganization(answers(), {
      organizationId: ORG,
    });
    expect(outcome.status).toBe("incomplete");
    expect(outcome.missingKeys).toEqual(["tenant_config"]);
  });
});
