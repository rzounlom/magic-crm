import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { validateCatalogProductRequirements } from "@/server/catalog/requirement-validation";
import { formatRequirementRule } from "@/server/resources/plan-availability-status";
import { PRODUCT_QUANTITY_RULES } from "@/types/catalog";

const locationId = "loc_1";

const bowling = {
  slug: "bowling-lane",
  activeCount: 8,
  resources: Array.from({ length: 8 }, (_, index) => ({
    id: `bowl_${index + 1}`,
    name: `Bowling Lane ${index + 1}`,
    locationId,
  })),
};

const axe = {
  slug: "axe-bay",
  activeCount: 8,
  resources: Array.from({ length: 8 }, (_, index) => ({
    id: `axe_${index + 1}`,
    name: `Axe Bay ${index + 1}`,
    locationId,
  })),
};

const lounge = {
  slug: "private-lounge",
  activeCount: 1,
  resources: [{ id: "lounge_1", name: "Private Lounge", locationId }],
};

const venue = {
  slug: "full-venue",
  activeCount: 1,
  resources: [{ id: "venue_1", name: "Full Venue", locationId }],
};

function inventoryBySlug() {
  return new Map([
    [bowling.slug, bowling],
    [axe.slug, axe],
    [lounge.slug, lounge],
    [venue.slug, venue],
  ]);
}

describe("catalog composite requirement validation", () => {
  it("resolves a non-Generations composite package against tenant inventory", () => {
    const resolved = validateCatalogProductRequirements({
      productSlug: "upstairs-buyout",
      locationId,
      inventoryBySlug: inventoryBySlug(),
      requirements: [
        { resourceTypeSlug: "bowling-lane", quantityRule: PRODUCT_QUANTITY_RULES.ALL_OF_TYPE },
        { resourceTypeSlug: "axe-bay", quantityRule: PRODUCT_QUANTITY_RULES.FIXED, quantity: 4 },
        {
          resourceTypeSlug: "private-lounge",
          quantityRule: PRODUCT_QUANTITY_RULES.SPECIFIC_RESOURCE,
          resourceName: "Private Lounge",
        },
      ],
    });
    expect(resolved).toEqual([
      { resourceTypeSlug: "bowling-lane", resourceId: null },
      { resourceTypeSlug: "axe-bay", resourceId: null },
      { resourceTypeSlug: "private-lounge", resourceId: "lounge_1" },
    ]);
  });

  it("rejects invalid exact quantities, empty ALL_OF_TYPE, foreign specific resources, and exclusive mixes", () => {
    expect(() =>
      validateCatalogProductRequirements({
        productSlug: "bad-qty",
        locationId,
        inventoryBySlug: inventoryBySlug(),
        requirements: [{ resourceTypeSlug: "axe-bay", quantityRule: PRODUCT_QUANTITY_RULES.FIXED, quantity: 0 }],
      }),
    ).toThrow(/greater than 0/);

    expect(() =>
      validateCatalogProductRequirements({
        productSlug: "too-many",
        locationId,
        inventoryBySlug: inventoryBySlug(),
        requirements: [{ resourceTypeSlug: "axe-bay", quantityRule: PRODUCT_QUANTITY_RULES.FIXED, quantity: 9 }],
      }),
    ).toThrow(/only 8 are configured/);

    expect(() =>
      validateCatalogProductRequirements({
        productSlug: "empty-all",
        locationId,
        inventoryBySlug: new Map([
          ["bowling-lane", { slug: "bowling-lane", activeCount: 0, resources: [] }],
        ]),
        requirements: [{ resourceTypeSlug: "bowling-lane", quantityRule: PRODUCT_QUANTITY_RULES.ALL_OF_TYPE }],
      }),
    ).toThrow(/zero active resources/);

    expect(() =>
      validateCatalogProductRequirements({
        productSlug: "foreign-lounge",
        locationId,
        inventoryBySlug: new Map([
          [
            "private-lounge",
            {
              slug: "private-lounge",
              activeCount: 1,
              resources: [{ id: "lounge_other", name: "Private Lounge", locationId: "loc_other" }],
            },
          ],
        ]),
        requirements: [
          {
            resourceTypeSlug: "private-lounge",
            quantityRule: PRODUCT_QUANTITY_RULES.SPECIFIC_RESOURCE,
            resourceName: "Private Lounge",
          },
        ],
      }),
    ).toThrow(/another location/);

    expect(() =>
      validateCatalogProductRequirements({
        productSlug: "dupes",
        locationId,
        inventoryBySlug: inventoryBySlug(),
        requirements: [
          { resourceTypeSlug: "bowling-lane", quantityRule: PRODUCT_QUANTITY_RULES.ALL_OF_TYPE },
          { resourceTypeSlug: "bowling-lane", quantityRule: PRODUCT_QUANTITY_RULES.FIXED, quantity: 2 },
        ],
      }),
    ).toThrow(/duplicate requirements/);

    expect(() =>
      validateCatalogProductRequirements({
        productSlug: "mixed-exclusive",
        locationId,
        inventoryBySlug: inventoryBySlug(),
        requirements: [
          { resourceTypeSlug: "full-venue", quantityRule: PRODUCT_QUANTITY_RULES.LOCATION_EXCLUSIVE },
          { resourceTypeSlug: "bowling-lane", quantityRule: PRODUCT_QUANTITY_RULES.FIXED, quantity: 1 },
        ],
      }),
    ).toThrow(/cannot combine LOCATION_EXCLUSIVE/);
  });
});

describe("requirement copy", () => {
  it("describes composite rules without exposing resource ids", () => {
    expect(
      formatRequirementRule({
        quantityRule: "ALL_OF_TYPE",
        quantity: 8,
        guestsPerUnit: null,
        requiresStaffConfiguration: false,
      }),
    ).toBe("All active units of this type");
    expect(
      formatRequirementRule({
        quantityRule: "SPECIFIC_RESOURCE",
        quantity: 1,
        guestsPerUnit: null,
        requiresStaffConfiguration: false,
      }),
    ).toBe("Specific resource required");
    expect(
      formatRequirementRule({
        quantityRule: "LOCATION_EXCLUSIVE",
        quantity: 1,
        guestsPerUnit: null,
        requiresStaffConfiguration: false,
      }),
    ).toBe("Private use of the full facility");
    expect(
      formatRequirementRule({
        quantityRule: "FIXED",
        quantity: 7,
        guestsPerUnit: null,
        requiresStaffConfiguration: false,
      }),
    ).toBe("7 required");
  });
});

describe("runtime tenant isolation invariant", () => {
  it("does not branch resource allocation on tenant, product, or resource names", () => {
    const root = join(process.cwd(), "src");
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) {
          walk(path);
          continue;
        }
        if (path.endsWith(".ts") || path.endsWith(".tsx")) {
          files.push(path);
        }
      }
    };
    walk(root);
    const forbidden = [
      /if\s*\([^)]*(Generations|AdventurePlex|Adventureplex)/i,
      /(?:slug|name)\s*===\s*["'](?:mezzanine|full-facility|generations|skybox)["']/i,
      /product\.slug\s*===\s*["']mezzanine/i,
      /organization\.slug\s*===\s*["']generations/i,
    ];
    const violations: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      for (const pattern of forbidden) {
        if (pattern.test(source)) {
          violations.push(`${file}: ${pattern}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });
});
