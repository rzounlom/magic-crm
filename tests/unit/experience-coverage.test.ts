import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { parseBookingCatalogDataset } from "@/server/catalog/dataset";
import {
  COVERAGE_KINDS,
  COVERAGE_OUTCOMES,
  FOOD_INCLUSIONS,
  PACKAGE_INTAKE_ELIGIBILITY,
  PARTICIPANT_RULES,
  applyPackageInclusions,
  assessEligibility,
  assessPackageDiningEligibility,
  assessSimultaneousHosting,
  compareCoverage,
  productMeetsActivityMinimum,
  rankEquivalentExperiences,
  storedProposalTotalCents,
  uncoveredFoodServings,
  type ExperienceGrant,
  type ExperienceRequirement,
} from "@/server/catalog/experience-coverage";
import { composeTierProducts } from "@/server/catalog/tier-composition";
import { readEventPlanPayload } from "@/lib/event-planner/payload";
import { buildCatalogEventPlans, type LoadedCatalogProduct } from "@/server/services/proposal-engine";
import { ATTRACTION_MODES, PRODUCT_KINDS, PRODUCT_QUANTITY_RULES, type RecommendationProfilePayload } from "@/types/catalog";
import { PLAN_AVAILABILITY_STATUSES } from "@/types/resource-schedule";
import type { PlannerInquiryFacts } from "@/server/event-planner/build-event-plans";

const ORG_A = "org-a";
const ORG_B = "org-b";

function grant(overrides: Partial<ExperienceGrant> & Pick<ExperienceGrant, "experienceKey" | "kind">): ExperienceGrant {
  return {
    organizationId: ORG_A,
    durationMinutesPerParticipant: null,
    sessionsPerParticipant: null,
    servings: null,
    participantRule: PARTICIPANT_RULES.ALL_GUESTS,
    fixedParticipants: null,
    creditCents: null,
    simultaneousGuestCapacity: null,
    optionalBenefit: false,
    rotationMinutesPerParticipant: null,
    minAge: null,
    minWeightLbs: null,
    requiresParticipantBreakdown: false,
    ...overrides,
  };
}

function requirement(
  overrides: Partial<ExperienceRequirement> & Pick<ExperienceRequirement, "experienceKey" | "kind">,
): ExperienceRequirement {
  return {
    mandatory: true,
    durationMinutesPerParticipant: null,
    sessionsPerParticipant: null,
    servings: null,
    creditCents: null,
    guestCount: 12,
    ...overrides,
  };
}

function price(amountCents: number) {
  return {
    strategy: "FIXED_RENTAL",
    amountCents,
    additionalGuestCents: null,
    includedGuests: null,
    includedHours: null,
    additionalHourCents: null,
    minGuests: null,
    weekdayAmountCents: null,
    weekendAmountCents: null,
    daysOfWeek: null,
    afterHour: null,
    afterHourAmountCents: null,
    shoeAddOnCents: null,
    unitLabel: null,
  };
}

function product(overrides: Partial<LoadedCatalogProduct> & Pick<LoadedCatalogProduct, "id" | "slug" | "name">): LoadedCatalogProduct {
  return {
    kind: PRODUCT_KINDS.ATTRACTION,
    audience: "ALL",
    durationMinutes: 60,
    minGuests: null,
    maxGuests: null,
    weekendOnly: false,
    fulfillmentGroup: null,
    prices: [price(3000)],
    serving: null,
    ...overrides,
  };
}

function profile(overrides: Partial<RecommendationProfilePayload> = {}): RecommendationProfilePayload {
  return {
    defaultPackageSlugs: { good: "bowling-1h", better: "bowling-1h", best: "bowling-1h" },
    defaultAttractionSlugs: [],
    defaultFoodSlug: null,
    foodFirst: true,
    goodAddOnSlugs: [],
    betterAddOnSlugs: [],
    bestAddOnSlugs: [],
    ...overrides,
  };
}

function inquiry(overrides: Partial<PlannerInquiryFacts> = {}): PlannerInquiryFacts {
  return {
    eventType: "Birthday Party",
    eventGoal: "Birthday Party",
    guestCount: 12,
    guestMix: "mostly_adults",
    desiredDurationMinutes: 60,
    desiredDate: "2026-10-17",
    desiredStartTime: "14:00",
    budgetMin: null,
    budgetMax: null,
    diningPreference: "none",
    spacePreference: "no_preference",
    attractionInterestIds: [],
    customerNotes: null,
    ...overrides,
  };
}

describe("experience coverage", () => {
  it("accepts a complete candidate and rejects a cheaper partial from equivalent ranking", () => {
    const bowling = requirement({
      experienceKey: "bowling",
      kind: COVERAGE_KINDS.ACTIVITY,
      durationMinutesPerParticipant: 60,
      guestCount: 12,
    });
    const complete = grant({
      experienceKey: "bowling",
      kind: COVERAGE_KINDS.ACTIVITY,
      durationMinutesPerParticipant: 60,
      simultaneousGuestCapacity: 48,
    });
    const partial = grant({
      experienceKey: "bowling",
      kind: COVERAGE_KINDS.ACTIVITY,
      durationMinutesPerParticipant: 60,
      simultaneousGuestCapacity: 6,
    });
    const ranked = rankEquivalentExperiences({
      organizationId: ORG_A,
      requirements: [bowling],
      candidates: [
        { id: "partial", totalCents: 3000, organizationId: ORG_A, grants: [partial] },
        { id: "complete", totalCents: 6000, organizationId: ORG_A, grants: [complete] },
      ],
    });
    expect(ranked.rejectedIds).toContain("partial");
    expect(ranked.winnerId).toBe("complete");
    expect(ranked.infeasible).toBe(false);
  });

  it("does not let an optional upgrade hide a missing mandatory experience", () => {
    const comparison = compareCoverage({
      organizationId: ORG_A,
      requirements: [
        requirement({ experienceKey: "axe", kind: COVERAGE_KINDS.ACTIVITY, durationMinutesPerParticipant: 60 }),
      ],
      grants: [
        grant({ experienceKey: "arcade", kind: COVERAGE_KINDS.ACTIVITY, durationMinutesPerParticipant: 60 }),
        grant({ experienceKey: "axe", kind: COVERAGE_KINDS.ACTIVITY, durationMinutesPerParticipant: 30 }),
      ],
    });
    expect(comparison.eligibleForPriceComparison).toBe(false);
    expect(comparison.blocksProposal).toBe(true);
    expect(comparison.requirements.find((row) => row.experienceKey === "axe")?.outcome).toBe(COVERAGE_OUTCOMES.MISSING);
  });

  it("keeps a more expensive complete candidate ahead of an incomplete one", () => {
    const ranked = rankEquivalentExperiences({
      organizationId: ORG_A,
      requirements: [requirement({ experienceKey: "laser", kind: COVERAGE_KINDS.ACTIVITY, durationMinutesPerParticipant: 90 })],
      candidates: [
        {
          id: "one-game",
          totalCents: 800,
          organizationId: ORG_A,
          grants: [grant({ experienceKey: "laser", kind: COVERAGE_KINDS.ACTIVITY, sessionsPerParticipant: 1 })],
        },
        {
          id: "unlimited",
          totalCents: 2500,
          organizationId: ORG_A,
          grants: [grant({ experienceKey: "laser", kind: COVERAGE_KINDS.ACTIVITY, durationMinutesPerParticipant: 90 })],
        },
      ],
    });
    expect(ranked.winnerId).toBe("unlimited");
  });

  it("treats one laser game as different from 90 minutes of play", () => {
    const comparison = compareCoverage({
      organizationId: ORG_A,
      requirements: [requirement({ experienceKey: "laser", kind: COVERAGE_KINDS.ACTIVITY, durationMinutesPerParticipant: 90 })],
      grants: [grant({ experienceKey: "laser", kind: COVERAGE_KINDS.ACTIVITY, sessionsPerParticipant: 1 })],
    });
    expect(comparison.requirements[0]?.outcome).toBe(COVERAGE_OUTCOMES.MISSING);
  });

  it("rejects a 30-minute axe SKU for a 60-minute minimum and accepts a longer SKU for a shorter minimum", () => {
    expect(productMeetsActivityMinimum({ durationMinutes: 30, sessions: null, minimum: { durationMinutes: 60 } })).toBe(false);
    expect(productMeetsActivityMinimum({ durationMinutes: 60, sessions: null, minimum: { durationMinutes: 30 } })).toBe(true);
    const longer = compareCoverage({
      organizationId: ORG_A,
      requirements: [requirement({ experienceKey: "axe", kind: COVERAGE_KINDS.ACTIVITY, durationMinutesPerParticipant: 30 })],
      grants: [grant({ experienceKey: "axe", kind: COVERAGE_KINDS.ACTIVITY, durationMinutesPerParticipant: 60 })],
    });
    expect(longer.requirements[0]?.outcome).toBe(COVERAGE_OUTCOMES.EXCEEDED);
    expect(longer.eligibleForPriceComparison).toBe(true);
  });

  it("sizes bowling from tenant capacity instead of a shared constant", () => {
    const rows = [
      {
        productId: "bowling",
        quantityRule: PRODUCT_QUANTITY_RULES.PER_GUESTS,
        guestsPerUnit: 6,
        activeCount: 8,
        inventoryConfigured: true,
        durationMinutes: 60,
        rotationMinutesPerParticipant: null,
      },
    ];
    expect(assessSimultaneousHosting({ guestCount: 12, productIds: ["bowling"], rows }).rotationRequired).toBe(false);
    expect(assessSimultaneousHosting({ guestCount: 50, productIds: ["bowling"], rows }).rotationRequired).toBe(true);
    const huge = assessSimultaneousHosting({ guestCount: 96, productIds: ["bowling"], rows });
    expect(huge.rotationRequired).toBe(true);
    expect(huge.simultaneousGuestCapacity).toBe(48);
    const rotated = assessSimultaneousHosting({
      guestCount: 96,
      productIds: ["bowling"],
      rows: [{ ...rows[0], rotationMinutesPerParticipant: 60 }],
    });
    expect(rotated.rotationRequired).toBe(false);
  });

  it("reduces food by included servings and prices the remainder once", () => {
    expect(uncoveredFoodServings({ requiredServings: 12, includedServings: 8 })).toBe(4);
    expect(uncoveredFoodServings({ requiredServings: 8, includedServings: 8 })).toBe(0);
    const pizza = {
      id: "pizza",
      kind: PRODUCT_KINDS.FOOD,
      experienceGrants: [grant({ experienceKey: "pizza", kind: COVERAGE_KINDS.FOOD })],
    };
    const party = {
      id: "party",
      kind: PRODUCT_KINDS.PACKAGE,
      experienceGrants: [grant({ experienceKey: "pizza", kind: COVERAGE_KINDS.FOOD, servings: 8 })],
    };
    const partial = applyPackageInclusions({ products: [party, pizza], guestCount: 12 });
    expect(partial.omittedProductIds).toEqual([]);
    expect(partial.guestCountByProductId.pizza).toBe(4);
    const covered = applyPackageInclusions({ products: [party, pizza], guestCount: 8 });
    expect(covered.omittedProductIds).toEqual(["pizza"]);
    const secondPizza = { ...pizza, id: "pizza-2" };
    const once = applyPackageInclusions({ products: [party, pizza, secondPizza], guestCount: 12 });
    expect(once.guestCountByProductId.pizza).toBe(4);
    expect(once.omittedProductIds).toContain("pizza-2");
    const limited = {
      id: "party-six",
      kind: PRODUCT_KINDS.PACKAGE,
      experienceGrants: [grant({ experienceKey: "bowling", kind: COVERAGE_KINDS.ACTIVITY, durationMinutesPerParticipant: 60, participantRule: PARTICIPANT_RULES.FIXED, fixedParticipants: 6 })],
    };
    const lane = {
      id: "lane",
      kind: PRODUCT_KINDS.ATTRACTION,
      experienceGrants: [grant({ experienceKey: "bowling", kind: COVERAGE_KINDS.ACTIVITY, durationMinutesPerParticipant: 60 })],
    };
    const notEveryone = applyPackageInclusions({ products: [limited, lane], guestCount: 12 });
    expect(notEveryone.omittedProductIds).toEqual([]);
    const noFood = applyPackageInclusions({
      products: [{ id: "bowl", kind: PRODUCT_KINDS.ATTRACTION, experienceGrants: [] }],
      guestCount: 12,
    });
    expect(noFood.omittedProductIds).toEqual([]);
  });

  it("does not double-count a birthday bundle and does not let an incomplete bundle win on price", () => {
    const bundleGrants = [
      grant({ experienceKey: "bowling", kind: COVERAGE_KINDS.ACTIVITY, durationMinutesPerParticipant: 60 }),
      grant({ experienceKey: "pizza", kind: COVERAGE_KINDS.FOOD, servings: 12 }),
    ];
    const bowling = {
      id: "bowling",
      kind: PRODUCT_KINDS.ATTRACTION,
      experienceGrants: [grant({ experienceKey: "bowling", kind: COVERAGE_KINDS.ACTIVITY, durationMinutesPerParticipant: 60 })],
    };
    const pizza = {
      id: "pizza",
      kind: PRODUCT_KINDS.FOOD,
      experienceGrants: [grant({ experienceKey: "pizza", kind: COVERAGE_KINDS.FOOD })],
    };
    const bundle = { id: "bundle", kind: PRODUCT_KINDS.PACKAGE, experienceGrants: bundleGrants };
    const applied = applyPackageInclusions({ products: [bundle, bowling, pizza], guestCount: 12 });
    expect(applied.products.map((row) => row.id)).toEqual(["bundle"]);
    const ranked = rankEquivalentExperiences({
      organizationId: ORG_A,
      requirements: [
        requirement({ experienceKey: "bowling", kind: COVERAGE_KINDS.ACTIVITY, durationMinutesPerParticipant: 60 }),
        requirement({ experienceKey: "pizza", kind: COVERAGE_KINDS.FOOD, servings: 12 }),
      ],
      candidates: [
        {
          id: "cheap-partial",
          totalCents: 1000,
          organizationId: ORG_A,
          grants: [grant({ experienceKey: "bowling", kind: COVERAGE_KINDS.ACTIVITY, durationMinutesPerParticipant: 60 })],
        },
        { id: "bundle", totalCents: 4000, organizationId: ORG_A, grants: bundleGrants },
      ],
    });
    expect(ranked.winnerId).toBe("bundle");
  });

  it("ignores another tenant's grants", () => {
    const ranked = rankEquivalentExperiences({
      organizationId: ORG_A,
      requirements: [requirement({ experienceKey: "bowling", kind: COVERAGE_KINDS.ACTIVITY, durationMinutesPerParticipant: 60 })],
      candidates: [
        {
          id: "foreign",
          totalCents: 100,
          organizationId: ORG_B,
          grants: [grant({ organizationId: ORG_B, experienceKey: "bowling", kind: COVERAGE_KINDS.ACTIVITY, durationMinutesPerParticipant: 60 })],
        },
      ],
    });
    expect(ranked.winnerId).toBeNull();
    expect(ranked.infeasible).toBe(true);
    const leaked = compareCoverage({
      organizationId: ORG_A,
      requirements: [requirement({ experienceKey: "bowling", kind: COVERAGE_KINDS.ACTIVITY, durationMinutesPerParticipant: 60 })],
      grants: [grant({ organizationId: ORG_B, experienceKey: "bowling", kind: COVERAGE_KINDS.ACTIVITY, durationMinutesPerParticipant: 60 })],
    });
    expect(leaked.declared).toBe(false);
    expect(leaked.blocksProposal).toBe(false);
  });

  it("asks for participant facts when a grant needs them and does not invent an age", () => {
    const comparison = compareCoverage({
      organizationId: ORG_A,
      requirements: [requirement({ experienceKey: "climb", kind: COVERAGE_KINDS.ACTIVITY })],
      grants: [grant({ experienceKey: "climb", kind: COVERAGE_KINDS.ACTIVITY, minAge: 4, requiresParticipantBreakdown: true })],
    });
    expect(comparison.requirements[0]?.outcome).toBe(COVERAGE_OUTCOMES.NEEDS_INFORMATION);
    expect(comparison.blocksProposal).toBe(true);
    expect(
      assessEligibility({
        minAge: 4,
        minWeightLbs: null,
        requiresParticipantBreakdown: true,
        eligibleParticipantCount: 3,
        guestCount: 12,
      }).outcome,
    ).toBe("SATISFIED");
  });

  it("reads a stored proposal total without using a later catalog price", () => {
    const snapshot = { lineItems: [{ totalCents: 148000 }, { totalCents: 2000 }] };
    const laterCatalogPriceCents = 999999;
    expect(storedProposalTotalCents(snapshot)).toBe(150000);
    expect(storedProposalTotalCents(snapshot)).not.toBe(laterCatalogPriceCents);
    expect(storedProposalTotalCents({})).toBe(0);
  });
});

describe("mixed attraction policy", () => {
  const bowling = product({ id: "bowling-1h", slug: "bowling-1h", name: "Bowling", durationMinutes: 60 });
  const axe30 = product({ id: "axe-30", slug: "axe-throwing-30", name: "Axe 30", durationMinutes: 30 });
  const axe60 = product({ id: "axe-60", slug: "axe-throwing-60", name: "Axe 60", durationMinutes: 60 });
  const productsBySlug = new Map([bowling, axe30, axe60].map((row) => [row.slug, row]));
  const productsById = new Map([bowling, axe30, axe60].map((row) => [row.id, row]));

  function compose(payload: RecommendationProfilePayload, facts: PlannerInquiryFacts, minimums?: Record<string, { durationMinutes: number }>) {
    const tier = payload.composition?.tiers.good;
    if (!tier) {
      throw new Error("missing tier");
    }
    return composeTierProducts({
      tierKey: "good",
      tier,
      profile: payload,
      inquiry: facts,
      attractionMode: facts.attractionInterestIds.length > 0 ? ATTRACTION_MODES.KNOWN : ATTRACTION_MODES.RECOMMEND,
      selections: facts.attractionInterestIds.map((id) => ({
        interestSlug: id,
        productIds: id === "axe-throwing" ? ["axe-30"] : [id],
      })),
      directProductIds: [],
      productsBySlug,
      productsById,
      isWeekend: () => false,
      activityMinimums: minimums,
    });
  }

  it("does not invent an attraction when the tenant requires an explicit choice", () => {
    const payload = profile({
      requireExplicitAttractions: true,
      composition: {
        foodStrategies: { value: [], standard: [], premium: [] },
        spaceSlugs: [],
        tiers: {
          good: {
            foodStrategy: "value",
            coreAttractionSlugs: ["bowling-1h"],
            upgradeSlugs: [],
            fulfillmentByInterest: {},
            includeSpace: false,
            spaceFit: "tightest",
          },
          better: {
            foodStrategy: "standard",
            coreAttractionSlugs: ["bowling-1h"],
            upgradeSlugs: [],
            fulfillmentByInterest: {},
            includeSpace: false,
            spaceFit: "tightest",
          },
          best: {
            foodStrategy: "premium",
            coreAttractionSlugs: ["bowling-1h"],
            upgradeSlugs: [],
            fulfillmentByInterest: {},
            includeSpace: false,
            spaceFit: "tightest",
          },
        },
      },
    });
    expect(compose(payload, inquiry({ guestMix: "mixed_ages" })).products).toEqual([]);
    const chosen = compose(payload, inquiry({ guestMix: "mixed_ages", attractionInterestIds: ["bowling-1h"] }));
    expect(chosen.products.map((row) => row.slug)).toContain("bowling-1h");
  });

  it("still uses defaults for a tenant that does not require an explicit choice", () => {
    const payload = profile({
      requireExplicitAttractions: false,
      composition: {
        foodStrategies: { value: [], standard: [], premium: [] },
        spaceSlugs: [],
        tiers: {
          good: {
            foodStrategy: "value",
            coreAttractionSlugs: ["bowling-1h"],
            upgradeSlugs: [],
            fulfillmentByInterest: { "axe-throwing": "axe-throwing-60" },
            includeSpace: false,
            spaceFit: "tightest",
          },
          better: {
            foodStrategy: "standard",
            coreAttractionSlugs: ["bowling-1h"],
            upgradeSlugs: [],
            fulfillmentByInterest: {},
            includeSpace: false,
            spaceFit: "tightest",
          },
          best: {
            foodStrategy: "premium",
            coreAttractionSlugs: ["bowling-1h"],
            upgradeSlugs: [],
            fulfillmentByInterest: {},
            includeSpace: false,
            spaceFit: "tightest",
          },
        },
      },
    });
    expect(compose(payload, inquiry()).products.map((row) => row.slug)).toContain("bowling-1h");
    const short = compose(
      payload,
      inquiry({ attractionInterestIds: ["axe-throwing"] }),
      { "axe-throwing": { durationMinutes: 60 } },
    );
    expect(short.products.map((row) => row.slug)).not.toContain("axe-throwing-30");
    expect(short.unfulfilledInterestSlugs).toContain("axe-throwing");
  });
});

describe("proposal capacity integration", () => {
  const bowling = product({
    id: "bowling-1h",
    slug: "bowling-1h",
    name: "Bowling",
    durationMinutes: 60,
    guestsPerUnit: 6,
  });

  async function draftFor(guestCount: number) {
    const drafts = await buildCatalogEventPlans({
      organizationId: ORG_A,
      inquiry: inquiry({ guestCount, guestMix: "mostly_adults", diningPreference: "none" }),
      products: [bowling],
      profiles: [{ audience: "ADULTS", payload: profile() }],
      resourceRequirements: [
        {
          productId: bowling.id,
          productName: bowling.name,
          resourceTypeId: "lanes",
          resourceTypeSlug: "bowling-lane",
          resourceTypeName: "Bowling lane",
          inventoryConfigured: true,
          activeCount: 8,
          quantityRule: PRODUCT_QUANTITY_RULES.PER_GUESTS,
          quantity: null,
          guestsPerUnit: 6,
          durationMinutes: 60,
          exclusive: false,
        },
      ],
      currency: "USD",
    });
    return drafts[0];
  }

  it("requires a rotation plan for a one-hour eight-lane group of 96", async () => {
    const draft = await draftFor(96);
    expect(draft?.availabilityStatus).not.toBe(PLAN_AVAILABILITY_STATUSES.UNAVAILABLE);
    expect(draft?.payload.coverageFeasibility).toBe("REQUIRES_ROTATION_PLAN");
    expect(draft?.payload.coverageAssessment?.rotationRequired).toBe(true);
    expect(draft?.customerFacingReason).toContain("A rotation plan is required");
  });

  it("leaves a 12-guest lane rental free of a rotation block", async () => {
    const draft = await draftFor(12);
    expect(draft?.payload.coverageAssessment?.rotationRequired).not.toBe(true);
  });
});

describe("generations mixed catalog configuration", () => {
  it("defaults mixed groups to bowling and does not require an explicit attraction", () => {
    const dataset = parseBookingCatalogDataset(
      JSON.parse(readFileSync(path.join(process.cwd(), "scripts/data/generations-booking/booking-catalog.json"), "utf8")),
    );
    const mixed = dataset.recommendationProfiles.find((row) => row.audience === "MIXED");
    const payload = mixed?.payload as RecommendationProfilePayload;
    expect(payload.requireExplicitAttractions).not.toBe(true);
    expect(payload.defaultAttractionSlugs).toEqual(["bowling-1h"]);
    expect(payload.composition?.tiers.good.coreAttractionSlugs).toEqual(["bowling-1h"]);
    expect(payload.composition?.tiers.better.coreAttractionSlugs).toEqual(["bowling-1h"]);
    expect(payload.composition?.tiers.best.coreAttractionSlugs).toEqual(["bowling-1h"]);
    expect(payload.composition?.tiers.best.upgradeSlugs).not.toContain("axe-throwing-60");
    const adults = dataset.recommendationProfiles.find((row) => row.audience === "ADULTS");
    const adultPayload = adults?.payload as RecommendationProfilePayload;
    expect(adultPayload.requireExplicitAttractions).not.toBe(true);
    expect(adultPayload.composition?.tiers.good.coreAttractionSlugs).toContain("bowling-1h");
  });

  it("does not branch the coverage engine on a tenant slug", () => {
    const source = readFileSync(path.join(process.cwd(), "src/server/catalog/experience-coverage.ts"), "utf8");
    const engine = readFileSync(path.join(process.cwd(), "src/server/services/proposal-engine.ts"), "utf8");
    expect(source.includes('slug === "generations"')).toBe(false);
    expect(engine.includes('slug === "generations"')).toBe(false);
  });
});

describe("package dining eligibility", () => {
  it("respects No Food without inventing package contents", () => {
    expect(
      assessPackageDiningEligibility({
        productKind: "PACKAGE",
        diningPreference: "none",
        experienceGrants: [grant({ experienceKey: "bowling", kind: COVERAGE_KINDS.ACTIVITY, durationMinutesPerParticipant: 60 })],
      }),
    ).toBe(PACKAGE_INTAKE_ELIGIBILITY.NEEDS_INFORMATION);
    expect(
      assessPackageDiningEligibility({
        productKind: "PACKAGE",
        diningPreference: "none",
        experienceGrants: [grant({ experienceKey: "pizza", kind: COVERAGE_KINDS.FOOD, servings: 10 })],
      }),
    ).toBe(PACKAGE_INTAKE_ELIGIBILITY.INELIGIBLE);
    expect(
      assessPackageDiningEligibility({
        productKind: "PACKAGE",
        diningPreference: "none",
        experienceGrants: [grant({ experienceKey: "pizza", kind: COVERAGE_KINDS.FOOD, servings: 10, optionalBenefit: true })],
      }),
    ).toBe(PACKAGE_INTAKE_ELIGIBILITY.ELIGIBLE);
    expect(
      assessPackageDiningEligibility({
        productKind: "PACKAGE",
        diningPreference: "none",
        experienceGrants: [],
        foodInclusion: FOOD_INCLUSIONS.NONE,
      }),
    ).toBe(PACKAGE_INTAKE_ELIGIBILITY.ELIGIBLE);
  });
});

describe("proposal snapshot reader", () => {
  it("keeps the priced coverage assessment on a stored plan", () => {
    const stored = {
      organizationId: ORG_A,
      guestCount: 96,
      durationMinutes: 60,
      lineItems: [{ slug: "bowling-1h", totalCents: 81600 }],
      coverageFeasibility: "REQUIRES_ROTATION_PLAN",
      coverageAssessment: {
        feasibility: "REQUIRES_ROTATION_PLAN",
        rotationRequired: true,
        declared: true,
      },
    };
    const read = readEventPlanPayload(stored);
    expect(read.coverageFeasibility).toBe("REQUIRES_ROTATION_PLAN");
    expect(read.coverageAssessment?.rotationRequired).toBe(true);
    expect(read.lineItems?.[0]?.totalCents).toBe(81600);
  });
});
