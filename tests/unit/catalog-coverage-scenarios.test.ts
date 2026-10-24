import { describe, expect, it } from "vitest";

import { PARTICIPANT_RULES, type ExperienceGrant } from "@/server/catalog/experience-coverage";
import { loadBookingCatalogDataset } from "@/server/catalog/load-dataset";
import { buildCatalogEventPlans, type LoadedCatalogProduct } from "@/server/services/proposal-engine";
import type { CatalogResourceRequirementRow } from "@/server/catalog/requirements";
import type { RecommendationProfilePayload } from "@/types/catalog";
import { EVENT_PLAN_TIERS, type EventPlanDraft } from "@/types/event-planner";
import { PLAN_AVAILABILITY_STATUSES } from "@/types/resource-schedule";
import type { PlannerInquiryFacts } from "@/server/event-planner/build-event-plans";

const ORG = "generations-fixture";
const dataset = loadBookingCatalogDataset();
const inventory = new Map(dataset.resourceTypes.map((row) => [row.slug, row.count]));

function grantFor(row: NonNullable<(typeof dataset.products)[number]["coverage"]>[number]): ExperienceGrant {
  return {
    organizationId: ORG,
    experienceKey: row.experienceKey,
    kind: row.kind,
    durationMinutesPerParticipant: row.durationMinutesPerParticipant ?? null,
    sessionsPerParticipant: row.sessionsPerParticipant ?? null,
    servings: row.servings ?? null,
    participantRule: row.participantRule === "FIXED" ? PARTICIPANT_RULES.FIXED : PARTICIPANT_RULES.ALL_GUESTS,
    fixedParticipants: row.fixedParticipants ?? null,
    creditCents: row.creditCents ?? null,
    simultaneousGuestCapacity: row.simultaneousGuestCapacity ?? null,
    rotationMinutesPerParticipant: row.rotationMinutesPerParticipant ?? null,
    minAge: row.minAge ?? null,
    minWeightLbs: row.minWeightLbs ?? null,
    requiresParticipantBreakdown: row.requiresParticipantBreakdown,
    optionalBenefit: row.optionalBenefit ?? false,
  };
}

const products: LoadedCatalogProduct[] = dataset.products.map((product) => ({
  id: product.slug,
  slug: product.slug,
  name: product.name,
  kind: product.kind,
  audience: product.audience,
  durationMinutes: product.durationMinutes ?? null,
  minGuests: product.minGuests ?? null,
  maxGuests: product.maxGuests ?? null,
  weekendOnly: product.weekendOnly,
  fulfillmentGroup: product.fulfillmentGroup ?? null,
  schedulingBehavior: product.schedulingBehavior ?? null,
  guestsPerUnit: product.requirements.find((row) => row.guestsPerUnit)?.guestsPerUnit ?? null,
  prices: product.prices.map((price) => ({
    strategy: price.strategy,
    amountCents: price.amountCents,
    additionalGuestCents: price.additionalGuestCents ?? null,
    includedGuests: price.includedGuests ?? null,
    includedHours: price.includedHours ?? null,
    additionalHourCents: price.additionalHourCents ?? null,
    minGuests: price.minGuests ?? null,
    weekdayAmountCents: price.weekdayAmountCents ?? null,
    weekendAmountCents: price.weekendAmountCents ?? null,
    daysOfWeek: price.daysOfWeek ?? null,
    afterHour: price.afterHour ?? null,
    afterHourAmountCents: price.afterHourAmountCents ?? null,
    shoeAddOnCents: price.shoeAddOnCents ?? null,
    unitLabel: price.unitLabel ?? null,
  })),
  serving: product.serving
    ? {
        servesMin: product.serving.servesMin,
        servesMax: product.serving.servesMax,
        unitCount: product.serving.unitCount ?? null,
      }
    : null,
  experienceGrants: (product.coverage ?? []).map((row) => grantFor(row)),
  foodInclusion: product.intakeDeclarations?.foodInclusion ?? null,
  containsAlcohol: product.intakeDeclarations?.containsAlcohol === true,
}));

const requirements: CatalogResourceRequirementRow[] = dataset.products.flatMap((product) =>
  product.requirements.map((row) => ({
    productId: product.slug,
    productName: product.name,
    resourceTypeId: row.resourceTypeSlug,
    resourceTypeSlug: row.resourceTypeSlug,
    resourceTypeName: row.resourceTypeSlug,
    inventoryConfigured: true,
    activeCount: inventory.get(row.resourceTypeSlug) ?? 0,
    quantityRule: row.quantityRule,
    quantity: row.quantity ?? null,
    guestsPerUnit: row.guestsPerUnit ?? null,
    durationMinutes: row.durationMinutes ?? null,
    exclusive: row.exclusive ?? false,
  })),
);

const profiles = dataset.recommendationProfiles.map((row) => ({
  audience: row.audience,
  payload: row.payload as RecommendationProfilePayload,
}));

function facts(overrides: Partial<PlannerInquiryFacts>): PlannerInquiryFacts {
  return {
    eventType: "Birthday Party",
    eventGoal: "Birthday Party",
    guestCount: 12,
    guestMix: "mostly_adults",
    desiredDurationMinutes: 180,
    desiredDate: "2026-10-13",
    desiredStartTime: "18:00",
    budgetMin: null,
    budgetMax: null,
    diningPreference: "not_sure",
    spacePreference: "no_preference",
    attractionInterestIds: [],
    customerNotes: null,
    ...overrides,
  };
}

async function plans(
  inquiry: PlannerInquiryFacts,
  selections: Array<{ interestSlug: string; productIds: string[] }> = [],
  directAttractionProductIds: string[] = [],
) {
  return buildCatalogEventPlans({
    organizationId: ORG,
    inquiry,
    products,
    profiles,
    resourceRequirements: requirements,
    currency: "USD",
    attractionSelections: selections,
    directAttractionProductIds,
  });
}

function tier(drafts: EventPlanDraft[], name: string) {
  const match = drafts.find((row) => row.tier === name);
  expect(match).toBeTruthy();
  return match as EventPlanDraft;
}

function slugs(draft: EventPlanDraft) {
  return [...new Set((draft.payload.lineItems ?? []).map((row) => row.slug))];
}

describe("real catalog proposal scenarios", () => {
  it("builds three differentiated adult tiers for bowling, axe, and food", async () => {
    const drafts = await plans(
      facts({
        guestMix: "mostly_adults",
        attractionInterestIds: ["bowling", "axe-throwing"],
      }),
      [
        { interestSlug: "bowling", productIds: ["bowling-1h"] },
        { interestSlug: "axe-throwing", productIds: ["axe-throwing-30", "axe-throwing-60"] },
      ],
    );
    expect(drafts).toHaveLength(3);
    const good = tier(drafts, EVENT_PLAN_TIERS.BUDGET);
    const recommended = tier(drafts, EVENT_PLAN_TIERS.BEST_FIT);
    const premium = tier(drafts, EVENT_PLAN_TIERS.PREMIUM);
    expect(slugs(good)).toEqual(expect.arrayContaining(["bowling-1h", "axe-throwing-30", "pizza-pitcher-combo"]));
    expect(slugs(recommended)).toEqual(expect.arrayContaining(["bowling-1h", "axe-throwing-60", "slider-bar"]));
    expect(slugs(premium)).toEqual(expect.arrayContaining(["bowling-1h", "axe-throwing-60", "smokehouse-bbq"]));
    expect(slugs(premium)).not.toContain("unlimited-arcade-1h");
    expect(slugs(premium)).not.toContain("skybox");
    expect(good.estimatedTotalCents).toBeLessThan(premium.estimatedTotalCents);
    expect(good.payload.coverageFeasibility).toBe("FEASIBLE");
    expect(good.payload.lineItems?.find((row) => row.slug === "bowling-1h")?.totalCents).toBeGreaterThan(0);
    expect(good.durationMinutes).toBeGreaterThan(0);
    expect(good.payload.resourceRequirements?.some((row) => row.resourceTypeSlug === "bowling-lane")).toBe(true);
  });

  it("keeps an explicit kids selection and still differentiates food", async () => {
    const drafts = await plans(
      facts({
        guestCount: 24,
        guestMix: "mostly_children",
        desiredDate: "2026-10-17",
        attractionInterestIds: ["laser-tag", "arcade"],
      }),
      [
        { interestSlug: "laser-tag", productIds: ["unlimited-laser-tag-90"] },
        { interestSlug: "arcade", productIds: ["unlimited-arcade-1h"] },
      ],
    );
    expect(drafts).toHaveLength(3);
    for (const draft of drafts) {
      expect(slugs(draft)).toEqual(expect.arrayContaining(["unlimited-laser-tag-90", "unlimited-arcade-1h"]));
      expect(draft.payload.coverageFeasibility).toBe("FEASIBLE");
    }
    expect(slugs(tier(drafts, EVENT_PLAN_TIERS.BUDGET))).toContain("pizza-pitcher-combo");
    expect(slugs(tier(drafts, EVENT_PLAN_TIERS.BUDGET))).not.toContain("fajita-bar");
    expect(slugs(tier(drafts, EVENT_PLAN_TIERS.PREMIUM))).not.toContain("climbers-cove-90");
    expect(slugs(tier(drafts, EVENT_PLAN_TIERS.PREMIUM))).toContain("smokehouse-bbq");
  });

  it("keeps an explicit mixed selection instead of inventing a default", async () => {
    const drafts = await plans(
      facts({
        guestMix: "mixed_ages",
        attractionInterestIds: ["bowling"],
      }),
      [{ interestSlug: "bowling", productIds: ["bowling-1h"] }],
    );
    expect(drafts).toHaveLength(3);
    expect(slugs(tier(drafts, EVENT_PLAN_TIERS.BUDGET))).toContain("bowling-1h");
    expect(slugs(tier(drafts, EVENT_PLAN_TIERS.BUDGET))).toContain("pizza-pitcher-combo");
    expect(slugs(tier(drafts, EVENT_PLAN_TIERS.BUDGET))).not.toContain("fajita-bar");
    expect(slugs(tier(drafts, EVENT_PLAN_TIERS.BUDGET))).not.toContain("axe-throwing-60");
    expect(slugs(tier(drafts, EVENT_PLAN_TIERS.PREMIUM))).toEqual(
      expect.arrayContaining(["bowling-1h", "smokehouse-bbq"]),
    );
    expect(slugs(tier(drafts, EVENT_PLAN_TIERS.PREMIUM))).not.toContain("axe-throwing-60");
    expect(slugs(tier(drafts, EVENT_PLAN_TIERS.PREMIUM))).not.toContain("skybox");
  });

  it("keeps package bowling coverage without inventing food when No Food is selected", async () => {
    const drafts = await plans(
      facts({
        guestCount: 10,
        guestMix: "mostly_children",
        diningPreference: "none",
        attractionInterestIds: ["bowling"],
      }),
      [{ interestSlug: "bowling", productIds: ["bowling-1h"] }],
      ["have-a-ball-bowling"],
    );
    const recommended =
      drafts.find((row) => row.tier === EVENT_PLAN_TIERS.BEST_FIT) ??
      drafts.find((row) => row.tier === EVENT_PLAN_TIERS.BUDGET);
    expect(recommended).toBeTruthy();
    expect(slugs(recommended!)).toContain("have-a-ball-bowling");
    expect(slugs(recommended!)).not.toContain("bowling-1h");
    expect(slugs(recommended!).some((slug) => slug.includes("pizza") || slug.includes("bar"))).toBe(false);
    expect(recommended!.payload.coverageFeasibility).toBe("NEEDS_INFORMATION");
    expect(recommended!.availabilityValidated).toBe(false);
  });

  it("adds a private room without treating the room as food", async () => {
    const drafts = await plans(
      facts({
        guestMix: "mostly_adults",
        spacePreference: "private",
        attractionInterestIds: ["bowling"],
      }),
      [{ interestSlug: "bowling", productIds: ["bowling-1h"] }],
    );
    const good = tier(drafts, EVENT_PLAN_TIERS.BUDGET);
    const premium = tier(drafts, EVENT_PLAN_TIERS.PREMIUM);
    expect(slugs(good)).toContain("lower-event-room");
    expect(slugs(premium)).toContain("skybox");
    expect(slugs(good)).not.toEqual(slugs(premium));
    expect(good.payload.resourceRequirements?.some((row) => row.resourceTypeSlug === "lower-event-room")).toBe(true);
  });

  it("marks a 96-guest bowling option as needing a rotation plan with an eight-lane allocation", async () => {
    const drafts = await plans(
      facts({
        guestCount: 96,
        guestMix: "mostly_adults",
        diningPreference: "none",
        attractionInterestIds: ["bowling"],
      }),
      [{ interestSlug: "bowling", productIds: ["bowling-1h"] }],
    );
    expect(drafts.length).toBeGreaterThan(0);
    expect(drafts.length).toBeLessThan(3);
    for (const draft of drafts) {
      expect(draft.payload.coverageFeasibility).toBe("REQUIRES_ROTATION_PLAN");
      expect(draft.availabilityStatus).not.toBe(PLAN_AVAILABILITY_STATUSES.UNAVAILABLE);
      expect(draft.availabilityValidated).toBe(false);
      const lane = draft.payload.resourceRequirements?.find((row) => row.resourceTypeSlug === "bowling-lane");
      expect(lane?.guestBasedQuantity).toBe(16);
      expect(lane?.quantity).toBe(8);
      expect(lane?.rotationWaves).toBeNull();
    }
  });

  it("caps simultaneous lanes at inventory for 12, 48, and 49 guests", async () => {
    const run = async (guestCount: number) =>
      plans(
        facts({
          guestCount,
          guestMix: "mostly_adults",
          diningPreference: "none",
          attractionInterestIds: ["bowling"],
        }),
        [{ interestSlug: "bowling", productIds: ["bowling-1h"] }],
      );
    const twelve = (await run(12))[0];
    const fortyEight = (await run(48))[0];
    const fortyNine = (await run(49))[0];
    expect(twelve?.payload.resourceRequirements?.find((row) => row.resourceTypeSlug === "bowling-lane")?.quantity).toBe(2);
    expect(fortyEight?.payload.resourceRequirements?.find((row) => row.resourceTypeSlug === "bowling-lane")?.quantity).toBe(8);
    expect(fortyNine?.payload.coverageFeasibility).toBe("REQUIRES_ROTATION_PLAN");
    expect(fortyNine?.payload.resourceRequirements?.find((row) => row.resourceTypeSlug === "bowling-lane")?.quantity).toBe(8);
    expect(fortyNine?.payload.resourceRequirements?.find((row) => row.resourceTypeSlug === "bowling-lane")?.guestBasedQuantity).toBe(9);
  });

  it("keeps itinerary duration independent of coverage entitlement minutes", async () => {
    const drafts = await plans(
      facts({
        guestMix: "mostly_adults",
        attractionInterestIds: ["bowling", "axe-throwing"],
      }),
      [
        { interestSlug: "bowling", productIds: ["bowling-1h"] },
        { interestSlug: "axe-throwing", productIds: ["axe-throwing-30", "axe-throwing-60"] },
      ],
    );
    const good = tier(drafts, EVENT_PLAN_TIERS.BUDGET);
    const entitlementSum = (good.payload.coverageAssessment?.entitlements ?? []).reduce(
      (sum, row) => sum + (row.durationMinutesPerParticipant ?? 0),
      0,
    );
    expect(good.durationMinutes).toBe(180);
    expect(entitlementSum).toBeGreaterThan(0);
    expect(good.durationMinutes).not.toBe(entitlementSum);
  });

  it("does not change an adult bowling price when the only new data is an activity grant", async () => {
    const withoutGrants = products.map((product) => ({ ...product, experienceGrants: [] }));
    const inquiry = facts({
      guestMix: "mostly_adults",
      diningPreference: "none",
      attractionInterestIds: ["bowling"],
    });
    const selections = [{ interestSlug: "bowling", productIds: ["bowling-1h"] }];
    const granted = await plans(inquiry, selections);
    const plain = await buildCatalogEventPlans({
      organizationId: ORG,
      inquiry,
      products: withoutGrants,
      profiles,
      resourceRequirements: requirements,
      currency: "USD",
      attractionSelections: selections,
    });
    const grantedDraft = granted.find((row) => row.tier === EVENT_PLAN_TIERS.BEST_FIT) ?? granted[0];
    const plainDraft = plain.find((row) => row.tier === EVENT_PLAN_TIERS.BEST_FIT) ?? plain[0];
    expect(grantedDraft).toBeTruthy();
    expect(plainDraft).toBeTruthy();
    const grantedBowling = grantedDraft!.payload.lineItems?.find((row) => row.slug === "bowling-1h");
    const plainBowling = plainDraft!.payload.lineItems?.find((row) => row.slug === "bowling-1h");
    expect(grantedBowling?.totalCents).toBe(plainBowling?.totalCents);
    expect(grantedDraft!.estimatedTotalCents).toBe(plainDraft!.estimatedTotalCents);
  });
});


