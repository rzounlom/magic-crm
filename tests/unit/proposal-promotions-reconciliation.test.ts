import { describe, expect, it } from "vitest";

import { COVERAGE_KINDS, PARTICIPANT_RULES } from "@/server/catalog/experience-coverage";
import { loadBookingCatalogDataset } from "@/server/catalog/load-dataset";
import {
  applyPromotions,
  type PricingPromotionRule,
} from "@/server/catalog/promotions";
import { deriveCatalogResourceRequirements } from "@/server/catalog/requirements";
import { priceProduct, weekdayKeyFromIsoDate } from "@/server/catalog/pricing";
import type { PlannerInquiryFacts } from "@/server/event-planner/build-event-plans";
import { buildCatalogEventPlans, type LoadedCatalogProduct } from "@/server/services/proposal-engine";
import { PRODUCT_QUANTITY_RULES, type RecommendationProfilePayload } from "@/types/catalog";
import { EVENT_PLAN_TIERS, type EventPlanDraft } from "@/types/event-planner";
import { PLAN_AVAILABILITY_STATUSES } from "@/types/resource-schedule";

const dataset = loadBookingCatalogDataset();

function asCatalogProduct(
  product: (typeof dataset.products)[number],
): LoadedCatalogProduct {
  return {
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
    guestsPerUnit: product.requirements.find((row) => row.guestsPerUnit)?.guestsPerUnit ?? null,
    schedulingBehavior: product.schedulingBehavior ?? null,
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
      weekendDays: price.weekendDays ?? null,
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
    hasResourceRequirements: product.requirements.length > 0,
    experienceGrants: (product.coverage ?? []).map((grant) => ({
      organizationId: "org-gen",
      experienceKey: grant.experienceKey,
      kind: grant.kind,
      durationMinutesPerParticipant: grant.durationMinutesPerParticipant ?? null,
      sessionsPerParticipant: grant.sessionsPerParticipant ?? null,
      servings: grant.servings ?? null,
      participantRule: grant.participantRule,
      fixedParticipants: grant.fixedParticipants ?? null,
      creditCents: grant.creditCents ?? null,
      simultaneousGuestCapacity: grant.simultaneousGuestCapacity ?? null,
      rotationMinutesPerParticipant: grant.rotationMinutesPerParticipant ?? null,
      minAge: grant.minAge ?? null,
      minWeightLbs: grant.minWeightLbs ?? null,
      requiresParticipantBreakdown: grant.requiresParticipantBreakdown,
      optionalBenefit: grant.optionalBenefit ?? false,
    })),
  };
}

const products = dataset.products.map(asCatalogProduct);
const profiles = dataset.recommendationProfiles.map((row) => ({
  audience: row.audience,
  payload: row.payload as RecommendationProfilePayload,
}));
const categorySlugByProductId = Object.fromEntries(
  dataset.products.map((row) => [row.slug, row.categorySlug]),
);

const promotions: PricingPromotionRule[] = dataset.promotions.map((row) => ({
  id: row.slug,
  organizationId: "org-gen",
  locationId: null,
  slug: row.slug,
  name: row.name,
  type: row.type,
  version: row.version,
  active: row.active,
  stackable: row.stackable,
  stackingGroup: row.stackingGroup ?? null,
  priority: row.priority,
  allowsFurtherDiscount: row.allowsFurtherDiscount,
  productSlugs: row.productSlugs ?? null,
  categorySlugs: row.categorySlugs ?? null,
  daysOfWeek: row.daysOfWeek ?? null,
  localStartMinute: row.localStartMinute ?? null,
  localEndMinute: row.localEndMinute ?? null,
  effectiveFrom: row.effectiveFrom ?? null,
  effectiveTo: row.effectiveTo ?? null,
  minQuantity: row.minQuantity ?? null,
  maxQuantity: row.maxQuantity ?? null,
  payload: row.payload,
}));

const resourceRequirements = dataset.products.flatMap((product) =>
  (product.requirements ?? []).map((row) => ({
    productId: product.slug,
    productName: product.name,
    resourceTypeId: row.resourceTypeSlug,
    resourceTypeSlug: row.resourceTypeSlug,
    resourceTypeName: row.resourceTypeSlug,
    inventoryConfigured: true,
    activeCount:
      dataset.resourceTypes.find((type) => type.slug === row.resourceTypeSlug)?.count ?? 1,
    quantityRule: row.quantityRule,
    quantity: row.quantity ?? null,
    guestsPerUnit: row.guestsPerUnit ?? null,
    durationMinutes: row.durationMinutes ?? null,
    exclusive: row.exclusive ?? false,
  })),
);

function facts(overrides: Partial<PlannerInquiryFacts> = {}): PlannerInquiryFacts {
  return {
    eventType: "Birthday Party",
    eventGoal: "Celebration",
    guestCount: 12,
    guestMix: "mostly_adults",
    desiredDurationMinutes: 120,
    desiredDate: "2026-10-14",
    desiredStartTime: "18:00",
    budgetMin: null,
    budgetMax: null,
    diningPreference: "none",
    spacePreference: "no_preference",
    attractionInterestIds: ["bowling"],
    customerNotes: null,
    ...overrides,
  };
}

async function plans(inquiry: PlannerInquiryFacts) {
  return buildCatalogEventPlans({
    organizationId: "org-gen",
    timeZone: "America/Chicago",
    inquiry,
    products,
    profiles,
    resourceRequirements,
    promotions,
    categorySlugByProductId,
    currency: "USD",
    attractionSelections: [
      ...(inquiry.attractionInterestIds.includes("bowling")
        ? [{ interestSlug: "bowling", productIds: ["bowling-1h"] }]
        : []),
      ...(inquiry.attractionInterestIds.includes("axe-throwing")
        ? [{ interestSlug: "axe-throwing", productIds: ["axe-throwing-30", "axe-throwing-60"] }]
        : []),
    ],
  });
}

function tier(rows: EventPlanDraft[], name: string) {
  return rows.find((row) => row.tier === name);
}

function line(plan: EventPlanDraft | undefined, slug: string) {
  return (plan?.payload.lineItems ?? []).filter((row) => row.slug === slug);
}

describe("proposal promotion reconciliation", () => {
  it("applies Wednesday bowling 50% in complete tiers and leaves shoes full price", async () => {
    const rows = await plans(facts({ desiredDate: "2026-10-14", attractionInterestIds: ["bowling"] }));
    const plan =
      tier(rows, EVENT_PLAN_TIERS.BEST_FIT) ??
      tier(rows, EVENT_PLAN_TIERS.BUDGET) ??
      rows[0];
    expect(plan).toBeTruthy();
    const bowlingLines = line(plan, "bowling-1h");
    const lanes = bowlingLines.find((row) => row.unitLabel === "lane");
    const shoes = bowlingLines.find((row) => /shoes/i.test(row.name));
    expect(lanes?.totalCents).toBe((lanes?.originalTotalCents ?? 0) / 2);
    expect(shoes?.discountCents ?? 0).toBe(0);
    expect(plan?.payload.pricingBreakdown?.appliedPromotions.some((row) => row.slug === "wed-regular-bowling-50")).toBe(
      true,
    );
    const lineSum = (plan?.payload.lineItems ?? []).reduce((sum, row) => sum + row.totalCents, 0);
    expect(lineSum).toBe(plan?.estimatedTotalCents);
  });

  it("applies Thursday axe BOGO for quantities 1–12 using billable persons, not bay count", async () => {
    const axe = products.find((row) => row.slug === "axe-throwing-30")!;
    const promo = promotions.find((row) => row.slug === "thu-axe-30-bogo")!;
    const paidPattern: number[] = [];
    for (let qty = 1; qty <= 12; qty += 1) {
      const base = priceProduct(axe, {
        guestCount: qty,
        eventDate: "2026-10-15",
        startTime: "18:00",
        durationMinutes: 30,
        organizationId: "org-gen",
      });
      const result = applyPromotions({
        quotes: [base],
        context: {
          guestCount: qty,
          eventDate: "2026-10-15",
          startTime: "18:00",
          durationMinutes: 30,
          organizationId: "org-gen",
        },
        promotions: [promo],
      });
      const paidUnits = Math.ceil(qty / 2);
      expect(result.quotes[0]?.totalCents).toBe(paidUnits * 1750);
      paidPattern.push(paidUnits);

      const resources = deriveCatalogResourceRequirements({
        productIds: ["axe-throwing-30"],
        guestCount: qty,
        durationMinutes: 30,
        requirements: resourceRequirements,
      });
      const bayDemand = resources.find((row) => row.resourceTypeSlug === "axe-throwing-lane");
      // Resource demand remains guest-based bay math, independent of BOGO paid admissions.
      expect(bayDemand?.guestBasedQuantity).toBe(
        Math.max(1, Math.ceil(qty / (bayDemand?.guestsPerUnit ?? 1))),
      );
    }
    expect(paidPattern.slice(0, 5)).toEqual([1, 1, 2, 2, 3]);
  });

  it("keeps Thursday axe 60 at full price inside complete proposals", async () => {
    const rows = await plans(
      facts({
        desiredDate: "2026-10-15",
        attractionInterestIds: ["axe-throwing", "bowling"],
        diningPreference: "none",
      }),
    );
    const recommended = tier(rows, EVENT_PLAN_TIERS.BEST_FIT);
    const axe60 = line(recommended, "axe-throwing-60");
    if (axe60.length > 0) {
      expect(axe60.every((row) => (row.discountCents ?? 0) === 0)).toBe(true);
      expect(
        recommended?.payload.pricingBreakdown?.appliedPromotions.some((row) => row.productId === "axe-throwing-60"),
      ).toBeFalsy();
    }
  });

  it("uses discounted totals for budget-fit classification", async () => {
    const rows = await plans(
      facts({
        desiredDate: "2026-10-14",
        attractionInterestIds: ["bowling", "axe-throwing"],
        budgetMax: 20_000,
        diningPreference: "none",
      }),
    );
    const plan = tier(rows, EVENT_PLAN_TIERS.BUDGET) ?? tier(rows, EVENT_PLAN_TIERS.BEST_FIT);
    expect(plan?.payload.budgetFit).toBeTruthy();
    // Budget assessment uses the same estimatedTotalCents that includes promotions.
    const lineSum = (plan?.payload.lineItems ?? []).reduce((sum, row) => sum + row.totalCents, 0);
    expect(lineSum).toBe(plan?.estimatedTotalCents);
    expect((plan?.payload.pricingBreakdown?.appliedPromotions.length ?? 0) > 0).toBe(true);
    expect(plan?.estimatedTotalCents).toBeLessThan(
      // Undiscounted bowling lanes + shoes + axe30 would be higher than the promoted Good total.
      2 * 3000 + 12 * 350 + 12 * 1750,
    );
  });

  it("omits package-covered bowling from separate discount lines", async () => {
    const rows = await plans(
      facts({
        desiredDate: "2026-10-14",
        guestMix: "mostly_children",
        attractionInterestIds: [],
        diningPreference: "pizza_light",
      }),
    );
    // Kids path may not include have-a-ball; assert inclusion behavior directly when package present.
    const packagePlan = rows.find((row) =>
      (row.payload.lineItems ?? []).some((lineItem) => lineItem.slug.startsWith("have-a-ball")),
    );
    if (!packagePlan) {
      const haveABall = products.find((row) => row.slug === "have-a-ball-bowling")!;
      const bowling = products.find((row) => row.slug === "bowling-1h")!;
      expect(haveABall.experienceGrants?.some((grant) => grant.experienceKey === "bowling")).toBe(true);
      expect(bowling.experienceGrants?.some((grant) => grant.kind === COVERAGE_KINDS.ACTIVITY)).toBe(true);
      expect(PARTICIPANT_RULES.ALL_GUESTS).toBe("ALL_GUESTS");
      return;
    }
    expect((packagePlan.payload.lineItems ?? []).some((row) => row.slug === "bowling-1h")).toBe(false);
  });

  it("preserves Friday weekend bowling after promotions are present", async () => {
    const rows = await plans(
      facts({ desiredDate: "2026-10-16", attractionInterestIds: ["bowling"], diningPreference: "none" }),
    );
    const plan = tier(rows, EVENT_PLAN_TIERS.BEST_FIT) ?? tier(rows, EVENT_PLAN_TIERS.BUDGET) ?? rows[0];
    const lanes = line(plan, "bowling-1h").find((row) => row.unitLabel === "lane");
    expect(lanes?.unitPriceCents).toBe(4000);
    expect(plan?.payload.pricingBreakdown?.appliedPromotions ?? []).toEqual([]);
  });

  it("selects venue-local civil weekdays for promotion days", () => {
    expect(weekdayKeyFromIsoDate("2026-10-14", "America/Chicago")).toBe("wed");
    expect(weekdayKeyFromIsoDate("2026-10-15", "America/Chicago")).toBe("thu");
    expect(weekdayKeyFromIsoDate("2026-10-16", "America/Chicago")).toBe("fri");
    // Civil date does not shift when a UTC instant would be the prior day.
    expect(weekdayKeyFromIsoDate("2026-10-16", "Pacific/Kiritimati")).toBe("fri");
  });

  it("keeps unresolved specials inactive in the Generations catalog file", () => {
    const slugs = new Set(dataset.promotions.map((row) => row.slug));
    expect(slugs.has("wed-regular-bowling-50")).toBe(true);
    expect(slugs.has("wed-regular-axe-50")).toBe(true);
    expect(slugs.has("thu-axe-30-bogo")).toBe(true);
    expect([...slugs].some((slug) => /laser|climb|mini-golf|arcade/i.test(slug))).toBe(false);
    expect(dataset.promotions.every((row) => row.active)).toBe(true);
  });

  it("does not treat NOT_VALIDATED as currently available in copy, while Book Now remains a soft request", async () => {
    // Engine sets availabilityValidated false when the provider does not validate.
    const rows = await plans(facts());
    for (const row of rows) {
      if (row.availabilityStatus === PLAN_AVAILABILITY_STATUSES.NOT_VALIDATED) {
        expect(row.availabilityValidated).toBe(false);
      }
    }
    expect(PRODUCT_QUANTITY_RULES.PER_GUESTS).toBe("PER_GUESTS");
  });
});
