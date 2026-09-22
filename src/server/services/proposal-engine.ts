import { attractionModeFromIntake, audienceFromGuestMix } from "@/server/catalog/audience";
import { buildItinerary } from "@/server/catalog/itinerary";
import { percentOfCents, priceProduct, weekdayKeyFromIsoDate, isWeekendKey, depositPercentFromTenant, depositPreviewNote } from "@/server/catalog/pricing";
import {
  deriveCatalogResourceRequirements,
  type CatalogResourceRequirementRow,
} from "@/server/catalog/requirements";
import { applyAvailabilityProvider, type PlanAvailabilityProvider } from "@/server/event-planner/availability";
import type { PlannerInquiryFacts } from "@/server/event-planner/build-event-plans";
import { searchViableStructuredItinerary } from "@/server/resources/itinerary-search";
import { planAvailabilityStatusFromCheck } from "@/server/resources/plan-availability-status";
import { stampPlanResourceWindows } from "@/server/resources/segment-windows";
import {
  ATTRACTION_MODES,
  type CatalogProductInput,
  type InquiryAudience,
  type PricedLineItem,
  type RecommendationProfilePayload,
} from "@/types/catalog";
import {
  CUSTOMER_AVAILABILITY_NOTE,
  EVENT_PLAN_TIER_TITLES,
  EVENT_PLAN_TIERS,
  type EventPlanDraft,
  type EventPlanTier,
} from "@/types/event-planner";
import { PLAN_AVAILABILITY_STATUSES, type ResourceAvailabilityResult } from "@/types/resource-schedule";

const TIER_ORDER: Array<{ tier: EventPlanTier; key: "good" | "better" | "best"; addOn: "goodAddOnSlugs" | "betterAddOnSlugs" | "bestAddOnSlugs"; includeSpace: boolean }> =
  [
    { tier: EVENT_PLAN_TIERS.BUDGET, key: "good", addOn: "goodAddOnSlugs", includeSpace: false },
    { tier: EVENT_PLAN_TIERS.BEST_FIT, key: "better", addOn: "betterAddOnSlugs", includeSpace: false },
    { tier: EVENT_PLAN_TIERS.PREMIUM, key: "best", addOn: "bestAddOnSlugs", includeSpace: true },
  ];

export type LoadedCatalogProduct = CatalogProductInput & {
  weekendOnly: boolean;
  fulfillmentGroup: string | null;
};

export type LoadedRecommendationProfile = {
  audience: string;
  payload: RecommendationProfilePayload;
};

function profileForAudience(
  profiles: LoadedRecommendationProfile[],
  audience: InquiryAudience,
): RecommendationProfilePayload {
  const match = profiles.find((row) => row.audience === audience) ?? profiles.find((row) => row.audience === "MIXED");
  return (
    match?.payload ?? {
      defaultPackageSlugs: { good: "", better: "", best: "" },
      defaultAttractionSlugs: [],
      defaultFoodSlug: null,
      foodFirst: false,
      goodAddOnSlugs: [],
      betterAddOnSlugs: [],
      bestAddOnSlugs: [],
    }
  );
}

function resolveFulfillmentSlug(
  group: string,
  requested: LoadedCatalogProduct[],
  profile: RecommendationProfilePayload,
): string | null {
  const config = profile.fulfillmentGroups?.[group];
  if (!config) {
    return requested[0]?.slug ?? null;
  }
  for (const product of requested) {
    const haystack = `${product.slug} ${product.name}`.toLowerCase();
    for (const [key, slug] of Object.entries(config.options)) {
      if (haystack.includes(key.toLowerCase())) {
        return slug;
      }
    }
  }
  return config.default;
}

function foodSlugForInquiry(inquiry: PlannerInquiryFacts, profile: RecommendationProfilePayload): string | null {
  if (inquiry.diningPreference === "none") {
    return null;
  }
  const mapped =
    inquiry.diningPreference && profile.diningPreferenceMap
      ? profile.diningPreferenceMap[inquiry.diningPreference]
      : undefined;
  if (mapped) {
    return mapped;
  }
  if (inquiry.diningPreference && inquiry.diningPreference.length > 0 && !inquiry.diningPreference.includes("_")) {
    return inquiry.diningPreference;
  }
  return profile.defaultFoodSlug;
}

function productUsableOnDate(product: LoadedCatalogProduct, eventDate: string | null): boolean {
  if (!product.weekendOnly || !eventDate) {
    return true;
  }
  return isWeekendKey(weekdayKeyFromIsoDate(eventDate));
}

export function selectCatalogProductsForTier(input: {
  tierKey: "good" | "better" | "best";
  addOnSlugs: string[];
  includeSpace: boolean;
  inquiry: PlannerInquiryFacts;
  attractionMode: string;
  profile: RecommendationProfilePayload;
  productsBySlug: Map<string, LoadedCatalogProduct>;
  productsById: Map<string, LoadedCatalogProduct>;
}): LoadedCatalogProduct[] {
  const selected = input.inquiry.attractionInterestIds
    .map((id) => input.productsById.get(id) ?? input.productsBySlug.get(id))
    .filter((row): row is LoadedCatalogProduct => Boolean(row));
  const override = input.attractionMode === ATTRACTION_MODES.KNOWN && selected.length > 0;
  const chosen: LoadedCatalogProduct[] = [];
  const seen = new Set<string>();

  const pushSlug = (slug: string | null | undefined) => {
    if (!slug) {
      return;
    }
    const product = input.productsBySlug.get(slug);
    if (!product || seen.has(product.id)) {
      return;
    }
    if (!productUsableOnDate(product, input.inquiry.desiredDate)) {
      return;
    }
    seen.add(product.id);
    chosen.push(product);
  };

  if (override) {
    const groups = new Set(selected.map((row) => row.fulfillmentGroup).filter((value): value is string => Boolean(value)));
    if (groups.size > 0) {
      for (const group of groups) {
        const slug = resolveFulfillmentSlug(
          group,
          selected,
          input.profile,
        );
        pushSlug(slug);
      }
      for (const product of selected) {
        if (!product.fulfillmentGroup) {
          pushSlug(product.slug);
        }
      }
    } else {
      for (const product of selected) {
        pushSlug(product.slug);
      }
    }
  } else {
    pushSlug(input.profile.defaultPackageSlugs[input.tierKey]);
    for (const slug of input.profile.defaultAttractionSlugs) {
      pushSlug(slug);
    }
  }

  pushSlug(foodSlugForInquiry(input.inquiry, input.profile));
  for (const slug of input.addOnSlugs) {
    pushSlug(slug);
  }
  if (input.includeSpace) {
    pushSlug(input.profile.premiumSpaceSlug ?? null);
  }
  return chosen;
}

export async function buildCatalogEventPlans(input: {
  organizationId: string;
  locationId?: string | null;
  inquiry: PlannerInquiryFacts;
  products: LoadedCatalogProduct[];
  profiles: LoadedRecommendationProfile[];
  resourceRequirements: CatalogResourceRequirementRow[];
  currency: string;
  depositPercent?: number;
  availabilityProvider?: PlanAvailabilityProvider;
  excludeInquiryId?: string | null;
}): Promise<EventPlanDraft[]> {
  const audience = audienceFromGuestMix(input.inquiry.guestMix);
  const attractionMode = attractionModeFromIntake({
    attractionInterestIds: input.inquiry.attractionInterestIds,
  });
  const profile = profileForAudience(input.profiles, audience);
  const productsBySlug = new Map(input.products.map((row) => [row.slug, row]));
  const productsById = new Map(input.products.map((row) => [row.id, row]));
  const drafts: EventPlanDraft[] = [];

  for (const [sortOrder, config] of TIER_ORDER.entries()) {
    const selected = selectCatalogProductsForTier({
      tierKey: config.key,
      addOnSlugs: profile[config.addOn],
      includeSpace: config.includeSpace,
      inquiry: input.inquiry,
      attractionMode,
      profile,
      productsBySlug,
      productsById,
    });
    if (selected.length === 0) {
      continue;
    }

    const durationMinutes = Math.max(
      input.inquiry.desiredDurationMinutes ?? 0,
      ...selected.map((row) => row.durationMinutes ?? 0),
      60,
    );
    const pricingContext = {
      guestCount: input.inquiry.guestCount,
      eventDate: input.inquiry.desiredDate,
      startTime: input.inquiry.desiredStartTime,
      durationMinutes,
    };
    const quotes = selected.map((product) => priceProduct(product, pricingContext));
    const lineItems: PricedLineItem[] = quotes.flatMap((quote) => quote.lineItems);
    const totalCents = quotes.reduce((sum, quote) => sum + quote.totalCents, 0);
    const pricingComplete = quotes.every((quote) => quote.pricingComplete);
    const selectedProducts = selected.map((row) => ({
      id: row.id,
      name: row.name,
      kind: row.kind,
      durationMinutes: row.durationMinutes,
    }));
    const requestedStartTime = input.inquiry.desiredStartTime;
    let itinerary = buildItinerary({
      startTime: requestedStartTime,
      durationMinutes,
      foodFirst: profile.foodFirst,
      products: selectedProducts,
    });
    const baseRequirements = deriveCatalogResourceRequirements({
      productIds: selected.map((row) => row.id),
      guestCount: input.inquiry.guestCount,
      durationMinutes,
      requirements: input.resourceRequirements,
    });
    let resourceRequirements = stampPlanResourceWindows({
      itinerary,
      startTime: requestedStartTime,
      resourceRequirements: baseRequirements,
    });
    const food = selected.find((row) => row.kind === "FOOD");
    const spaces = selected.filter((row) => row.kind === "RENTAL");
    const activities = selected.filter((row) => row.kind !== "FOOD" && row.kind !== "RENTAL");
    const availabilityInput = (startTime: string, requirements = resourceRequirements) => ({
      eventDate: input.inquiry.desiredDate,
      startTime,
      durationMinutes,
      guestCount: input.inquiry.guestCount,
      activities: activities.map((row) => ({
        knowledgeItemId: row.id,
        productId: row.id,
        name: row.name,
        quantity: 1,
        priceCents: quotes.find((quote) => quote.productId === row.id)?.totalCents ?? 0,
      })),
      spaces: spaces.map((row) => ({
        knowledgeItemId: row.id,
        name: row.name,
        priceCents: quotes.find((quote) => quote.productId === row.id)?.totalCents ?? 0,
      })),
      resourceRequirements: requirements,
      excludeInquiryId: input.excludeInquiryId,
    });
    const availability = await applyAvailabilityProvider(
      availabilityInput(requestedStartTime ?? ""),
      input.availabilityProvider,
    );
    let result: ResourceAvailabilityResult = {
      validated: availability.validated === true,
      available: availability.available ?? availability.validated === true,
      note: availability.note ?? CUSTOMER_AVAILABILITY_NOTE,
      types: availability.types ?? [],
    };
    let suggestedStartTimes: string[] = [];
    let itineraryAdjusted = false;
    let adjustmentNote = "";
    let conflictingActivityLabels: string[] = [];
    let viableStartTime = requestedStartTime;

    if (input.availabilityProvider) {
      const viable = await searchViableStructuredItinerary({
        requestedStartTime,
        durationMinutes,
        foodFirst: profile.foodFirst,
        products: selectedProducts,
        baseRequirements,
        check: async ({ startTime, requirements }) => {
          const next = await applyAvailabilityProvider(
            availabilityInput(startTime, requirements),
            input.availabilityProvider,
          );
          return {
            validated: next.validated === true,
            available: next.available ?? false,
            note: next.note ?? "",
            types: next.types ?? [],
          };
        },
      });
      if (viable) {
        itinerary = viable.itinerary;
        resourceRequirements = viable.requirements;
        result = viable.availability;
        viableStartTime = viable.startTime;
        itineraryAdjusted = viable.adjusted;
        adjustmentNote = viable.adjustmentNote;
        conflictingActivityLabels = viable.originalConflictLabels;
        if (viable.adjusted) {
          suggestedStartTimes = [viable.startTime];
        }
      } else if (result.validated && !result.available) {
        suggestedStartTimes = [];
      }
    }

    const availabilityStatus = planAvailabilityStatusFromCheck({
      previouslyValidated: false,
      result,
    });
    const depositPercent = depositPercentFromTenant(input.depositPercent);
    const depositPreviewCents = pricingComplete ? percentOfCents(totalCents, depositPercent) : null;
    const names = selected.map((row) => row.name).join(", ");
    const locationExclusive = resourceRequirements.some((row) => row.locationExclusive);
    const exclusiveNote = locationExclusive ? " Private use of the full facility." : "";
    const viable = result.validated && result.available;

    drafts.push({
      tier: config.tier,
      title: EVENT_PLAN_TIER_TITLES[config.tier],
      sortOrder,
      estimatedTotalCents: totalCents,
      currency: input.currency,
      guestCount: input.inquiry.guestCount,
      durationMinutes,
      customerFacingReason:
        (config.tier === EVENT_PLAN_TIERS.BEST_FIT
          ? `Recommended mix for this group: ${names}.`
          : `Includes ${names}.`) + exclusiveNote,
      availabilityValidated: viable,
      availabilityNote:
        itineraryAdjusted && adjustmentNote
          ? adjustmentNote
          : suggestedStartTimes.length > 0
            ? `${result.note} Nearby times currently open: ${suggestedStartTimes.join(", ")}.`
            : result.note,
      availabilityStatus: viable
        ? PLAN_AVAILABILITY_STATUSES.AVAILABLE
        : availabilityStatus,
      payload: {
        organizationId: input.organizationId,
        locationId: input.locationId ?? null,
        guestCount: input.inquiry.guestCount,
        eventDate: input.inquiry.desiredDate,
        startTime: viableStartTime,
        durationMinutes,
        activities: activities.map((row) => {
          const quote = quotes.find((item) => item.productId === row.id);
          return {
            knowledgeItemId: row.id,
            productId: row.id,
            name: row.name,
            quantity: quote?.lineItems[0]?.quantity ?? 1,
            unitLabel: quote?.lineItems[0]?.unitLabel ?? undefined,
            priceCents: quote?.totalCents ?? 0,
          };
        }),
        dining: {
          knowledgeItemId: food?.id,
          label: food?.name ?? "No food included",
          quantity: quotes.find((quote) => quote.productId === food?.id)?.lineItems[0]?.quantity,
          priceCents: quotes.find((quote) => quote.productId === food?.id)?.totalCents ?? 0,
        },
        spaces: spaces.map((row) => ({
          knowledgeItemId: row.id,
          name: row.name,
          priceCents: quotes.find((quote) => quote.productId === row.id)?.totalCents ?? 0,
        })),
        schedule: itinerary.map((row) => `${row.startTime}–${row.endTime} ${row.label}`),
        itinerary,
        lineItems,
        depositPreviewCents,
        depositPreviewPercent: depositPercent,
        depositPreviewNote: depositPreviewNote(depositPercent),
        suggestedStartTimes,
        requestedStartTime,
        itineraryAdjusted,
        adjustmentNote: itineraryAdjusted ? adjustmentNote : undefined,
        conflictingActivityLabels,
        catalogBacked: true,
        locationExclusive,
        pricingComplete,
        customerAvailabilityNote: itineraryAdjusted && adjustmentNote ? adjustmentNote : CUSTOMER_AVAILABILITY_NOTE,
        resourceRequirements,
      },
    });
  }

  return drafts;
}
