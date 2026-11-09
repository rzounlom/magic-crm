import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { buildPluginDefaultsPricingExport } from "@/server/event-planner/wp-parity/pricing-export";
import {
  reconcileWpExportAgainstMagicCrmCatalog,
  type MagicCrmCatalogProduct,
} from "@/server/event-planner/wp-parity/reconcile-catalog";

describe("reconcile WP export vs MagicCRM booking catalog", () => {
  it("reports matches and known differences without merging", () => {
    const catalogPath = path.join(
      process.cwd(),
      "scripts/data/generations-booking/booking-catalog.json",
    );
    const products = (
      JSON.parse(readFileSync(catalogPath, "utf8")) as { products: MagicCrmCatalogProduct[] }
    ).products;
    const report = reconcileWpExportAgainstMagicCrmCatalog({
      export: buildPluginDefaultsPricingExport(),
      products,
    });

    expect(report.summary.matchCount).toBeGreaterThan(10);
    // Plugin-default salad (2499) vs MagicCRM salad-pan (1999) is a known conflict.
    const salad = report.different.find((row) => row.wpKey === "food.salad");
    expect(salad).toBeTruthy();
    expect(salad?.wpCents).toBe(2499);
    expect(salad?.magicCents).toBe(1999);

    // Do not invent merges — different rows stay explicit.
    expect(report.different.every((row) => row.wpCents !== row.magicCents)).toBe(true);
    expect(report.unmappedWpKeys.length).toBeGreaterThan(0);
    expect(report.packageNotes.join(" ")).toMatch(/custom packages/i);
  });
});
