import { describe, expect, it } from "vitest";

import { emptySlugAction, type CatalogImportDiff } from "@/server/catalog/catalog-import-diff";
import {
  catalogSyncConfirmationPhrase,
  isGenerationsCustomerOrganization,
  unexpectedCatalogSyncOperations,
} from "@/server/services/catalog-sync-admin-service";

function sampleDiff(replacements: string[]): CatalogImportDiff {
  return {
    organizationId: "org_1",
    organizationName: "Generations Adventureplex",
    organizationSlug: "generations-adventureplex",
    depositPercent: { from: 30, to: 25, action: "update" },
    categories: { created: [], updated: [], unchanged: [] },
    products: emptySlugAction(),
    pricing: emptySlugAction(),
    requirements: emptySlugAction(),
    servings: emptySlugAction(),
    grants: emptySlugAction(),
    resourceTypes: { created: [], updated: [], unchanged: [] },
    resourcesCreated: 0,
    resourcesUnchanged: 0,
    profiles: emptySlugAction(),
    interests: emptySlugAction(),
    promotions: emptySlugAction(),
    scopedReplacements: replacements,
    ambiguities: [],
  };
}

describe("catalog sync admin guards", () => {
  it("accepts Generations name or slug and rejects other tenants", () => {
    expect(
      isGenerationsCustomerOrganization({ name: "Generations Adventureplex", slug: "gaplex" }),
    ).toBe(true);
    expect(
      isGenerationsCustomerOrganization({ name: "Fun Center", slug: "generations-crm" }),
    ).toBe(true);
    expect(isGenerationsCustomerOrganization({ name: "Fun Center", slug: "fun-center-a" })).toBe(false);
  });

  it("builds a slug-scoped confirmation phrase", () => {
    expect(catalogSyncConfirmationPhrase("Generations-CRM")).toBe("IMPORT generations-crm");
  });

  it("flags only tenant-wide replacement language as unexpected", () => {
    expect(unexpectedCatalogSyncOperations(sampleDiff(['Replace prices for product "pizza-pitcher-combo" only']))).toEqual(
      [],
    );
    expect(
      unexpectedCatalogSyncOperations(sampleDiff(["Delete all organization-wide product prices"])),
    ).toEqual(["Delete all organization-wide product prices"]);
  });
});
