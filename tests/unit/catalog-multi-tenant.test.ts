import { describe, expect, it } from "vitest";

import { buildItinerary } from "@/server/catalog/itinerary";
import { priceProduct } from "@/server/catalog/pricing";
import { quantityForRequirement } from "@/server/catalog/requirements";
import { omitUntrustedTenantContext, lookupAvailabilityArgsSchema } from "@/server/ai/sales-agent-tools";
import {
  selectCatalogProductsForTier,
  buildCatalogEventPlans,
} from "@/server/services/proposal-engine";
import { ATTRACTION_MODES } from "@/types/catalog";
import type { PlannerInquiryFacts } from "@/server/event-planner/build-event-plans";
import {
  TENANT_ALPHA_ADULT_PROFILE,
  TENANT_ALPHA_KIDS_PROFILE,
  TENANT_ALPHA_PRODUCTS,
  TENANT_BETA_ADULT_PROFILE,
  TENANT_BETA_KIDS_PROFILE,
  TENANT_BETA_PRODUCTS,
  TENANT_BETA_PROFILES,
  tenantAlphaRequirements,
  tenantBetaRequirements,
} from "../fixtures/tenant-alpha-beta-catalogs";

function inquiry(overrides: Partial<PlannerInquiryFacts> = {}): PlannerInquiryFacts {
  return {
    eventType: "Birthday Party",
    eventGoal: "Celebration",
    guestCount: 12,
    guestMix: "mostly_children",
    desiredDurationMinutes: 120,
    desiredDate: "2026-10-15",
    desiredStartTime: "18:00",
    budgetMin: null,
    budgetMax: null,
    diningPreference: "pizza_light",
    spacePreference: "no_preference",
    attractionInterestIds: [],
    customerNotes: null,
    ...overrides,
  };
}

const available = {
  async check() {
    return { validated: true, available: true, note: "ok", types: [] };
  },
};

describe("multi-tenant catalog engines", () => {
  it("prices the same strategy from each tenant's ProductPrice values and guestsPerUnit", () => {
    const alpha = priceProduct(TENANT_ALPHA_PRODUCTS[0]!, {
      guestCount: 30,
      eventDate: "2026-10-15",
      startTime: "18:00",
      durationMinutes: 60,
    });
    const beta = priceProduct(TENANT_BETA_PRODUCTS[0]!, {
      guestCount: 10,
      eventDate: "2026-10-15",
      startTime: "18:00",
      durationMinutes: 60,
    });
    expect(alpha.lineItems[0]?.quantity).toBe(5);
    expect(alpha.totalCents).toBe(5 * 3000);
    expect(beta.lineItems[0]?.quantity).toBe(2);
    expect(beta.totalCents).toBe(2 * 5500);
    expect(alpha.totalCents).not.toBe(beta.totalCents);
  });

  it("computes resource units from tenant guestsPerUnit configuration", () => {
    expect(quantityForRequirement(tenantAlphaRequirements()[0]!, 30)).toBe(5);
    expect(quantityForRequirement(tenantBetaRequirements()[0]!, 10)).toBe(2);
  });

  it("recommends kids attractions from RecommendationProfile data, not tenant identity", () => {
    const alpha = selectCatalogProductsForTier({
      tierKey: "better",
      addOnSlugs: [],
      includeSpace: false,
      attractionMode: ATTRACTION_MODES.RECOMMEND,
      profile: TENANT_ALPHA_KIDS_PROFILE,
      productsBySlug: new Map(TENANT_ALPHA_PRODUCTS.map((row) => [row.slug, row])),
      productsById: new Map(TENANT_ALPHA_PRODUCTS.map((row) => [row.id, row])),
      inquiry: inquiry(),
    });
    const beta = selectCatalogProductsForTier({
      tierKey: "better",
      addOnSlugs: [],
      includeSpace: false,
      attractionMode: ATTRACTION_MODES.RECOMMEND,
      profile: TENANT_BETA_KIDS_PROFILE,
      productsBySlug: new Map(TENANT_BETA_PRODUCTS.map((row) => [row.slug, row])),
      productsById: new Map(TENANT_BETA_PRODUCTS.map((row) => [row.id, row])),
      inquiry: inquiry(),
    });
    expect(alpha.map((row) => row.slug)).toEqual(["laser-tag", "arcade", "pizza-combo"]);
    expect(beta.map((row) => row.slug)).toEqual(["trampoline", "arcade", "snack-combo"]);
  });

  it("recommends adult attractions from each tenant profile", () => {
    const facts = inquiry({ guestMix: "mostly_adults" });
    const alpha = selectCatalogProductsForTier({
      tierKey: "better",
      addOnSlugs: [],
      includeSpace: false,
      attractionMode: ATTRACTION_MODES.RECOMMEND,
      profile: TENANT_ALPHA_ADULT_PROFILE,
      productsBySlug: new Map(TENANT_ALPHA_PRODUCTS.map((row) => [row.slug, row])),
      productsById: new Map(TENANT_ALPHA_PRODUCTS.map((row) => [row.id, row])),
      inquiry: facts,
    });
    const beta = selectCatalogProductsForTier({
      tierKey: "better",
      addOnSlugs: [],
      includeSpace: false,
      attractionMode: ATTRACTION_MODES.RECOMMEND,
      profile: TENANT_BETA_ADULT_PROFILE,
      productsBySlug: new Map(TENANT_BETA_PRODUCTS.map((row) => [row.slug, row])),
      productsById: new Map(TENANT_BETA_PRODUCTS.map((row) => [row.id, row])),
      inquiry: facts,
    });
    expect(alpha.map((row) => row.slug)).toEqual(["bowling-1h", "axe-throwing", "pizza-combo"]);
    expect(beta.map((row) => row.slug)).toEqual(["bowling-1h", "snack-combo"]);
    expect(beta.some((row) => row.slug.includes("axe"))).toBe(false);
  });

  it("sequences itineraries from tenant foodFirst configuration", () => {
    const alpha = buildItinerary({
      startTime: "18:00",
      durationMinutes: 120,
      foodFirst: TENANT_ALPHA_ADULT_PROFILE.foodFirst,
      products: [
        { id: "food", name: "Pizza Combo", kind: "FOOD", durationMinutes: 45 },
        { id: "bowl", name: "Bowling", kind: "ATTRACTION", durationMinutes: 60 },
      ],
    });
    const beta = buildItinerary({
      startTime: "18:00",
      durationMinutes: 120,
      foodFirst: TENANT_BETA_ADULT_PROFILE.foodFirst,
      products: [
        { id: "food", name: "Snack Combo", kind: "FOOD", durationMinutes: 45 },
        { id: "bowl", name: "Bowling", kind: "ATTRACTION", durationMinutes: 60 },
      ],
    });
    expect(alpha[0]?.label).toBe("Pizza Combo");
    expect(beta[0]?.label).toBe("Bowling");
  });

  it("ignores foreign catalog IDs and never copies another tenant's products into a snapshot", async () => {
    const drafts = await buildCatalogEventPlans({
      organizationId: "org-beta",
      locationId: "loc-beta",
      inquiry: inquiry({
        attractionInterestIds: ["laser-tag", "axe-throwing", "alpha-secret"],
        guestMix: "mostly_children",
      }),
      products: TENANT_BETA_PRODUCTS,
      profiles: TENANT_BETA_PROFILES,
      resourceRequirements: tenantBetaRequirements(),
      currency: "USD",
      availabilityProvider: available,
    });
    const slugs = drafts.flatMap((draft) => (draft.payload.lineItems ?? []).map((item) => item.slug));
    expect(slugs.some((slug) => slug === "laser-tag" || slug === "axe-throwing")).toBe(false);
    expect(drafts.every((draft) => draft.payload.organizationId === "org-beta")).toBe(true);
    expect(drafts.every((draft) => draft.payload.locationId === "loc-beta")).toBe(true);
    expect(drafts.some((draft) => (draft.payload.lineItems ?? []).some((item) => item.slug === "trampoline"))).toBe(
      true,
    );
  });

  it("strips model-supplied tenant identity from AI tool arguments", () => {
    const parsed = lookupAvailabilityArgsSchema.parse(
      omitUntrustedTenantContext({
        date: "2026-10-15",
        startTime: "18:00",
        organizationId: "tenant-other",
        locationId: "loc-other",
        resourceIds: ["res-a"],
      }),
    );
    expect(parsed).toEqual({ date: "2026-10-15", startTime: "18:00" });
    expect(omitUntrustedTenantContext({ organizationId: "x", query: "bowling" })).toEqual({ query: "bowling" });
  });
});
