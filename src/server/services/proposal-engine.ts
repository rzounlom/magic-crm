import { attractionModeFromIntake, audienceFromGuestMix } from "@/server/catalog/audience";
import { composeEventItinerary, itinerarySpanMinutes, type ItineraryProduct } from "@/server/catalog/itinerary";
import {
  addedScheduledActivities,
  customerActivityName,
  eventDurationExplanation,
  isSampleItinerarySegment,
  optionExperienceSentence,
  resolveSchedulingBehavior,
} from "@/server/catalog/scheduling-behavior";
import { percentOfCents, priceProduct, weekdayKeyFromIsoDate, isWeekendKey, depositPercentFromTenant, depositPreviewNote } from "@/server/catalog/pricing";
import {
  budgetFitForTotal,
  compositionDelta,
  compositionReason,
  composeTierProducts,
  readTierComposition,
  selectFoodWithinBudget,
  type AttractionSelection,
} from "@/server/catalog/tier-composition";
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
  PRODUCT_SCHEDULING_BEHAVIORS,
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
  hasResourceRequirements?: boolean;
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
        const inGroup = selected.filter((row) => row.fulfillmentGroup === group);
        const slug = resolveFulfillmentSlug(group, inGroup, input.profile);
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

function toItineraryProduct(row: LoadedCatalogProduct, requirementIds: Set<string>): ItineraryProduct {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    durationMinutes: row.durationMinutes,
    schedulingBehavior: row.schedulingBehavior,
    hasResourceRequirements: row.hasResourceRequirements ?? requirementIds.has(row.id),
  };
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
  attractionSelections?: AttractionSelection[];
  directAttractionProductIds?: string[];
}): Promise<EventPlanDraft[]> {
  const audience = audienceFromGuestMix(input.inquiry.guestMix);
  const attractionMode = attractionModeFromIntake({
    attractionInterestIds: input.inquiry.attractionInterestIds,
  });
  const profile = profileForAudience(input.profiles, audience);
  const productsBySlug = new Map(input.products.map((row) => [row.slug, row]));
  const productsById = new Map(input.products.map((row) => [row.id, row]));
  const drafts: EventPlanDraft[] = [];
  let previousProducts: LoadedCatalogProduct[] | null = null;

  for (const [sortOrder, config] of TIER_ORDER.entries()) {
    const tierStrategy = readTierComposition(profile, config.key);
    const composed = tierStrategy
      ? composeTierProducts({
          tierKey: config.key,
          tier: tierStrategy,
          profile,
          inquiry: input.inquiry,
          attractionMode,
          selections: input.attractionSelections ?? [],
          directProductIds: input.directAttractionProductIds ?? [],
          productsBySlug,
          productsById,
          isWeekend: (date) => isWeekendKey(weekdayKeyFromIsoDate(date)),
        })
      : null;
    let selected = composed
      ? composed.products
      : selectCatalogProductsForTier({
          tierKey: config.key,
          addOnSlugs: profile[config.addOn],
          includeSpace: config.includeSpace,
          inquiry: input.inquiry,
          attractionMode,
          profile,
          productsBySlug,
          productsById,
        });
    let spaceUnmet = composed?.spaceUnmet ?? false;
    let unfulfilledInterestSlugs = composed?.unfulfilledInterestSlugs ?? [];
    if (selected.length === 0) {
      continue;
    }
    if (tierStrategy && config.key === "good" && input.inquiry.budgetMax != null && input.inquiry.diningPreference !== "none") {
      const priceTotal = (rows: LoadedCatalogProduct[]) =>
        rows.reduce((sum, product) => sum + priceProduct(product, {
          guestCount: input.inquiry.guestCount,
          eventDate: input.inquiry.desiredDate,
          startTime: input.inquiry.desiredStartTime,
          durationMinutes: input.inquiry.desiredDurationMinutes ?? 60,
        }).totalCents, 0);
      const primaryFood = selected.find((row) => row.kind === "FOOD");
      const alternates = profile.composition?.foodStrategies.value ?? [];
      const totals = new Map<string, number>();
      if (primaryFood) {
        totals.set(primaryFood.slug, priceTotal(selected));
      }
      for (const slug of alternates) {
        if (totals.has(slug)) {
          continue;
        }
        const alternate = composeTierProducts({
          tierKey: config.key,
          tier: tierStrategy,
          profile,
          inquiry: input.inquiry,
          attractionMode,
          selections: input.attractionSelections ?? [],
          directProductIds: input.directAttractionProductIds ?? [],
          productsBySlug,
          productsById,
          isWeekend: (date) => isWeekendKey(weekdayKeyFromIsoDate(date)),
          foodSlugOverride: slug,
        });
        totals.set(slug, priceTotal(alternate.products));
      }
      const chosenFood = selectFoodWithinBudget({
        primarySlug: primaryFood?.slug ?? null,
        alternateSlugs: alternates,
        proposalTotalByFoodSlug: totals,
        budgetMax: input.inquiry.budgetMax,
        allowSwap: true,
      });
      if (chosenFood && chosenFood !== primaryFood?.slug) {
        const swapped = composeTierProducts({
          tierKey: config.key,
          tier: tierStrategy,
          profile,
          inquiry: input.inquiry,
          attractionMode,
          selections: input.attractionSelections ?? [],
          directProductIds: input.directAttractionProductIds ?? [],
          productsBySlug,
          productsById,
          isWeekend: (date) => isWeekendKey(weekdayKeyFromIsoDate(date)),
          foodSlugOverride: chosenFood,
        });
        selected = swapped.products;
        spaceUnmet = swapped.spaceUnmet;
        unfulfilledInterestSlugs = swapped.unfulfilledInterestSlugs;
      }
    }

    const requirementIds = new Set(input.resourceRequirements.map((row) => row.productId));
    const selectedProducts = selected.map((row) => toItineraryProduct(row, requirementIds));
    const requestedStartTime = input.inquiry.desiredStartTime;
    const itineraryDraft = composeEventItinerary({
      startTime: requestedStartTime,
      foodFirst: profile.foodFirst,
      products: selectedProducts,
      fallbackMinutes: input.inquiry.desiredDurationMinutes ?? 60,
    });
    let durationMinutes = itineraryDraft.eventLengthMinutes || input.inquiry.desiredDurationMinutes || 60;
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
    let itinerary = itineraryDraft.itinerary;
    const scheduledProductIds = selectedProducts
      .filter((row) => resolveSchedulingBehavior(row) !== PRODUCT_SCHEDULING_BEHAVIORS.NON_SCHEDULED)
      .map((row) => row.id);
    const baseRequirements = deriveCatalogResourceRequirements({
      productIds: scheduledProductIds,
      guestCount: input.inquiry.guestCount,
      durationMinutes,
      requirements: input.resourceRequirements,
    });
    let resourceRequirements = stampPlanResourceWindows({
      itinerary,
      startTime: requestedStartTime,
      resourceRequirements: baseRequirements,
    });
    const roleOfSelected = (row: LoadedCatalogProduct) =>
      resolveSchedulingBehavior(toItineraryProduct(row, requirementIds));
    const food = selected.find((row) => roleOfSelected(row) === "DINING");
    const spaces = selected.filter((row) => roleOfSelected(row) === PRODUCT_SCHEDULING_BEHAVIORS.SPACE_WINDOW);
    const activities = selected.filter((row) => roleOfSelected(row) === PRODUCT_SCHEDULING_BEHAVIORS.SCHEDULED);
    const included = selected.filter((row) => roleOfSelected(row) === PRODUCT_SCHEDULING_BEHAVIORS.NON_SCHEDULED);
    const availabilityInput = (
      startTime: string,
      requirements = resourceRequirements,
      spanMinutes = durationMinutes,
    ) => ({
      eventDate: input.inquiry.desiredDate,
      startTime,
      durationMinutes: spanMinutes,
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
        queryPhaseMs: () => input.availabilityProvider?.lastQueryPhaseMs ?? 0,
        check: async ({ startTime, requirements, eventLengthMinutes }) => {
          const next = await applyAvailabilityProvider(
            availabilityInput(startTime, requirements, eventLengthMinutes),
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
        durationMinutes = viable.eventLengthMinutes || durationMinutes;
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
    const sampleItinerary = itinerary.filter(isSampleItinerarySegment);
    const spanMinutes = itinerarySpanMinutes(sampleItinerary);
    if (spanMinutes > durationMinutes) {
      durationMinutes = spanMinutes;
    }
    const sequenced = sampleItinerary
      .filter((segment) => segment.durationMinutes && segment.durationMinutes > 0)
      .map((segment) => ({ name: segment.label, durationMinutes: segment.durationMinutes ?? 0 }));
    const currentNames = sequenced.map((row) => customerActivityName(row.name));
    const budgetDraft = drafts.find((draft) => draft.tier === EVENT_PLAN_TIERS.BUDGET);
    const budgetNames = (budgetDraft?.payload.itinerary ?? [])
      .filter(isSampleItinerarySegment)
      .map((segment) => customerActivityName(segment.label));
    const baselineNames =
      config.tier === EVENT_PLAN_TIERS.BUDGET || budgetNames.length === 0 ? currentNames : budgetNames;
    const added = addedScheduledActivities({ sequenced, baselineNames });
    const durationNote = eventDurationExplanation({
      requestedMinutes: input.inquiry.desiredDurationMinutes,
      eventLengthMinutes: durationMinutes,
      sequenced,
      roomMinutes: itineraryDraft.roomMinutes,
      baselineNames,
    });
    const delta = tierStrategy ? compositionDelta(previousProducts, selected) : null;
    const fallbackReason =
      (config.tier === EVENT_PLAN_TIERS.BEST_FIT
        ? `Recommended mix for this group: ${names}.`
        : `Includes ${names}.`) + exclusiveNote;
    const experience = delta
      ? compositionReason(delta, names)
      : optionExperienceSentence(added.map((row) => row.name), fallbackReason);
    const spaceNote = spaceUnmet
      ? "No private space in this venue's catalog fits this group."
      : null;
    const customerFacingReason = [added.length > 0 && !delta ? `${experience}${exclusiveNote}` : experience, durationNote, spaceNote]
      .filter(Boolean)
      .join(" ");
    const budgetFit = budgetFitForTotal({
      totalCents,
      budgetMin: input.inquiry.budgetMin,
      budgetMax: input.inquiry.budgetMax,
      flexible: input.inquiry.budgetFlexible === true,
    });

    drafts.push({
      tier: config.tier,
      title: EVENT_PLAN_TIER_TITLES[config.tier],
      sortOrder,
      estimatedTotalCents: totalCents,
      currency: input.currency,
      guestCount: input.inquiry.guestCount,
      durationMinutes,
      customerFacingReason,
      availabilityValidated: viable,
      availabilityNote: itineraryAdjusted && adjustmentNote ? adjustmentNote : result.note,
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
        includedItems: included.map((row) => {
          const line = quotes.find((quote) => quote.productId === row.id)?.lineItems[0];
          return {
            knowledgeItemId: row.id,
            name: row.name,
            quantity: line?.quantity,
            unitLabel: line?.unitLabel ?? undefined,
          };
        }),
        spaces: spaces.map((row) => {
          const window = itinerary.find((segment) => segment.productId === row.id && segment.role === "SPACE");
          return {
            knowledgeItemId: row.id,
            name: row.name,
            priceCents: quotes.find((quote) => quote.productId === row.id)?.totalCents ?? 0,
            startTime: window?.startTime ?? null,
            endTime: window?.endTime ?? null,
            durationMinutes: window?.durationMinutes ?? row.durationMinutes,
          };
        }),
        durationNote,
        schedule: sampleItinerary.map((row) => `${row.startTime}–${row.endTime} ${row.label}`),
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
        budgetFit,
        spaceUnmet,
        unfulfilledInterestSlugs,
        compositionDelta: delta
          ? { comparedWithTier: previousProducts ? drafts[drafts.length - 1]?.tier ?? null : null, ...delta }
          : undefined,
        pricingComplete,
        customerAvailabilityNote: itineraryAdjusted && adjustmentNote ? adjustmentNote : CUSTOMER_AVAILABILITY_NOTE,
        resourceRequirements,
      },
    });
    previousProducts = selected;
  }

  return drafts;
}
