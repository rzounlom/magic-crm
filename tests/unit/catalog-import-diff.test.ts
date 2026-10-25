import { describe, expect, it } from "vitest";

import {
  emptySlugAction,
  formatCatalogImportReport,
  sameJson,
  type CatalogImportDiff,
} from "@/server/catalog/catalog-import-diff";

const sampleDiff = (): CatalogImportDiff => ({
  organizationId: "org_1",
  organizationName: "Tenant A",
  organizationSlug: "tenant-a",
  depositPercent: { from: 30, to: 25, action: "update" },
  categories: { created: ["food"], updated: [], unchanged: ["attractions"] },
  products: {
    created: ["slider-bar"],
    updated: ["pizza-combo"],
    unchanged: ["bowling-1h"],
    preserved: ["custom-party-pack"],
  },
  pricing: {
    created: ["slider-bar"],
    updated: ["pizza-combo"],
    unchanged: ["bowling-1h"],
    preserved: ["custom-party-pack"],
  },
  requirements: emptySlugAction(),
  servings: emptySlugAction(),
  grants: emptySlugAction(),
  resourceTypes: { created: [], updated: [], unchanged: ["bowling-lane"] },
  resourcesCreated: 0,
  resourcesUnchanged: 8,
  profiles: emptySlugAction(),
  interests: emptySlugAction(),
  promotions: emptySlugAction(),
  scopedReplacements: ['Replace prices for product "pizza-combo" only'],
  ambiguities: [],
});

describe("catalog import diff helpers", () => {
  it("treats object key order as insignificant", () => {
    expect(sameJson({ b: 1, a: 2 }, { a: 2, b: 1 })).toBe(true);
    expect(sameJson({ a: 1 }, { a: 2 })).toBe(false);
  });

  it("formats a dry-run without implying writes", () => {
    const report = formatCatalogImportReport(sampleDiff(), { dryRun: true, applied: false });
    expect(report).toContain("Catalog import dry-run (no writes).");
    expect(report).toContain("Organization: Tenant A (tenant-a)");
    expect(report).toContain("preserve 1 (custom-party-pack)");
    expect(report).toContain('Replace prices for product "pizza-combo" only');
    expect(report).not.toContain("Catalog import applied.");
  });
});
