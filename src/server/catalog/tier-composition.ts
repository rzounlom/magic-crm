import type { PlannerInquiryFacts } from "@/server/event-planner/build-event-plans";
import {
  ATTRACTION_MODES,
  BUDGET_FITS,
  PRODUCT_KINDS,
  type BudgetFit,
  type FoodTierStrategy,
  type RecommendationProfilePayload,
  type TierCompositionConfig,
} from "@/types/catalog";

export type AttractionSelection = {
  interestSlug: string;
  productIds: string[];
};

export type CompositionProduct = {
  id: string;
  slug: string;
  name: string;
  kind: string;
  minGuests: number | null;
  maxGuests: number | null;
  weekendOnly: boolean;
  fulfillmentGroup: string | null;
};

type CatalogProduct = CompositionProduct;

export type TierCompositionResult<T extends CatalogProduct = CatalogProduct> = {
  products: T[];
  unfulfilledInterestSlugs: string[];
  spaceUnmet: boolean;
};

function usable(product: CatalogProduct, eventDate: string | null, isWeekend: (date: string) => boolean): boolean {
  if (!product.weekendOnly || !eventDate) {
    return true;
  }
  return isWeekend(eventDate);
}

function fitsGuests(product: CatalogProduct, guestCount: number): boolean {
  if (product.minGuests != null && guestCount < product.minGuests) {
    return false;
  }
  if (product.maxGuests != null && guestCount > product.maxGuests) {
    return false;
  }
  return true;
}

function wantsPrivateSpace(spacePreference: string | null): boolean {
  return spacePreference === "private" || spacePreference === "semi_private";
}

export function readTierComposition(
  profile: RecommendationProfilePayload,
  tierKey: "good" | "better" | "best",
): TierCompositionConfig | null {
  const composition = profile.composition;
  const tier = composition?.tiers[tierKey];
  if (!composition || !tier) {
    return null;
  }
  if (!composition.foodStrategies || !Array.isArray(composition.spaceSlugs)) {
    return null;
  }
  return tier;
}

export function budgetFitForTotal(input: {
  totalCents: number;
  budgetMin: number | null;
  budgetMax: number | null;
  flexible: boolean;
}): BudgetFit {
  if (input.flexible) {
    return BUDGET_FITS.FLEXIBLE;
  }
  if (input.budgetMin == null && input.budgetMax == null) {
    return BUDGET_FITS.UNSPECIFIED;
  }
  if (input.budgetMax != null && input.totalCents > input.budgetMax) {
    return BUDGET_FITS.ABOVE_RANGE;
  }
  if (input.budgetMin != null && input.totalCents < input.budgetMin) {
    return BUDGET_FITS.BELOW_RANGE;
  }
  return BUDGET_FITS.WITHIN_RANGE;
}

export function selectFoodWithinBudget(input: {
  primarySlug: string | null;
  alternateSlugs: string[];
  proposalTotalByFoodSlug: Map<string, number>;
  budgetMax: number | null;
  allowSwap: boolean;
}): string | null {
  if (!input.primarySlug) {
    return null;
  }
  if (!input.allowSwap || input.budgetMax == null) {
    return input.primarySlug;
  }
  const primaryTotal = input.proposalTotalByFoodSlug.get(input.primarySlug);
  if (primaryTotal == null || primaryTotal <= input.budgetMax) {
    return input.primarySlug;
  }
  for (const slug of input.alternateSlugs) {
    if (slug === input.primarySlug) {
      continue;
    }
    const total = input.proposalTotalByFoodSlug.get(slug);
    if (total != null && total <= input.budgetMax) {
      return slug;
    }
  }
  return input.primarySlug;
}

function explicitFoodSlug(
  inquiry: PlannerInquiryFacts,
  profile: RecommendationProfilePayload,
  productsBySlug: Map<string, CatalogProduct>,
): string | null {
  if (!inquiry.diningPreference || inquiry.diningPreference === "none" || inquiry.diningPreference === "not_sure") {
    return null;
  }
  const mapped = profile.diningPreferenceMap?.[inquiry.diningPreference];
  if (mapped && productsBySlug.has(mapped)) {
    return mapped;
  }
  if (!inquiry.diningPreference.includes("_") && productsBySlug.has(inquiry.diningPreference)) {
    return inquiry.diningPreference;
  }
  return null;
}

function strategyFoodSlug<T extends CatalogProduct>(
  strategy: FoodTierStrategy,
  profile: RecommendationProfilePayload,
  productsBySlug: Map<string, T>,
  eventDate: string | null,
  isWeekend: (date: string) => boolean,
): string | null {
  const slugs = profile.composition?.foodStrategies[strategy] ?? [];
  return slugs.find((slug) => {
    const product = productsBySlug.get(slug);
    return Boolean(product && usable(product, eventDate, isWeekend));
  }) ?? null;
}

function chooseFulfillment<T extends CatalogProduct>(
  selection: AttractionSelection,
  tier: TierCompositionConfig,
  productsBySlug: Map<string, T>,
  productsById: Map<string, T>,
  guestCount: number,
  eventDate: string | null,
  isWeekend: (date: string) => boolean,
): T | null {
  const preferredSlug = tier.fulfillmentByInterest[selection.interestSlug];
  const candidates = selection.productIds
    .map((id) => productsById.get(id))
    .filter((row): row is T => Boolean(row));
  const preferred = preferredSlug ? productsBySlug.get(preferredSlug) : undefined;
  const ordered =
    preferred && candidates.some((row) => row.id === preferred.id)
      ? [preferred, ...candidates.filter((row) => row.id !== preferred.id)]
      : candidates;
  return (
    ordered.find(
      (row) => fitsGuests(row, guestCount) && usable(row, eventDate, isWeekend),
    ) ?? null
  );
}

export function composeTierProducts<T extends CatalogProduct>(input: {
  tierKey: "good" | "better" | "best";
  tier: TierCompositionConfig;
  profile: RecommendationProfilePayload;
  inquiry: PlannerInquiryFacts;
  attractionMode: string;
  selections: AttractionSelection[];
  directProductIds: string[];
  productsBySlug: Map<string, T>;
  productsById: Map<string, T>;
  isWeekend: (date: string) => boolean;
  foodSlugOverride?: string | null;
}): TierCompositionResult<T> {
  const chosen: T[] = [];
  const seen = new Set<string>();
  const unfulfilled: string[] = [];
  const push = (product: T | null | undefined, exclusiveGroup = true) => {
    if (!product || seen.has(product.id)) {
      return;
    }
    if (!usable(product, input.inquiry.desiredDate, input.isWeekend)) {
      return;
    }
    if (exclusiveGroup) {
      const sameVariant = chosen.find(
        (row) => row.fulfillmentGroup && row.fulfillmentGroup === product.fulfillmentGroup,
      );
      if (sameVariant) {
        return;
      }
    }
    seen.add(product.id);
    chosen.push(product);
  };

  const explicit = input.attractionMode === ATTRACTION_MODES.KNOWN && (input.selections.length > 0 || input.directProductIds.length > 0);
  if (explicit) {
    for (const selection of input.selections) {
      const product = chooseFulfillment(
        selection,
        input.tier,
        input.productsBySlug,
        input.productsById,
        input.inquiry.guestCount,
        input.inquiry.desiredDate,
        input.isWeekend,
      );
      if (!product) {
        unfulfilled.push(selection.interestSlug);
        continue;
      }
      push(product, false);
    }
    for (const id of input.directProductIds) {
      const product = input.productsById.get(id) ?? input.productsBySlug.get(id);
      if (!product || !fitsGuests(product, input.inquiry.guestCount)) {
        unfulfilled.push(id);
        continue;
      }
      push(product, false);
    }
  } else {
    for (const slug of input.tier.coreAttractionSlugs) {
      const product = input.productsBySlug.get(slug);
      if (!product || !fitsGuests(product, input.inquiry.guestCount)) {
        unfulfilled.push(slug);
        continue;
      }
      push(product);
    }
  }

  for (const slug of input.tier.upgradeSlugs) {
    const product = input.productsBySlug.get(slug);
    if (product && fitsGuests(product, input.inquiry.guestCount)) {
      push(product);
    }
  }

  if (input.inquiry.diningPreference !== "none") {
    const explicitFood = explicitFoodSlug(input.inquiry, input.profile, input.productsBySlug);
    const foodSlug =
      explicitFood ??
      input.foodSlugOverride ??
      strategyFoodSlug(input.tier.foodStrategy, input.profile, input.productsBySlug, input.inquiry.desiredDate, input.isWeekend);
    push(foodSlug ? input.productsBySlug.get(foodSlug) : null);
  }

  const privateRequested = wantsPrivateSpace(input.inquiry.spacePreference);
  const fitting = (input.profile.composition?.spaceSlugs ?? [])
    .map((slug) => input.productsBySlug.get(slug))
    .filter((row): row is T => Boolean(row && fitsGuests(row, input.inquiry.guestCount) && usable(row, input.inquiry.desiredDate, input.isWeekend)))
    .sort((left, right) => (left.maxGuests ?? Number.MAX_SAFE_INTEGER) - (right.maxGuests ?? Number.MAX_SAFE_INTEGER));
  let spaceUnmet = false;
  if (privateRequested) {
    const room = input.tier.spaceFit === "largest" ? fitting[fitting.length - 1] : fitting[0];
    if (!room) {
      spaceUnmet = true;
    } else {
      push(room);
    }
  } else if (input.tier.includeSpace) {
    const room = input.tier.spaceFit === "largest" ? fitting[fitting.length - 1] : fitting[0];
    push(room);
  }

  return { products: chosen, unfulfilledInterestSlugs: unfulfilled, spaceUnmet };
}

export function compositionDelta<T extends CatalogProduct>(previous: T[] | null, current: T[]) {
  const foodOf = (rows: CatalogProduct[]) => rows.find((row) => row.kind === PRODUCT_KINDS.FOOD) ?? null;
  const spaceOf = (rows: CatalogProduct[]) => rows.find((row) => row.kind === PRODUCT_KINDS.RENTAL) ?? null;
  const previousFood = previous ? foodOf(previous) : null;
  const currentFood = foodOf(current);
  const previousSpace = previous ? spaceOf(previous) : null;
  const currentSpace = spaceOf(current);
  const previousByGroup = new Map(
    (previous ?? [])
      .filter((row) => row.fulfillmentGroup)
      .map((row) => [row.fulfillmentGroup as string, row]),
  );
  const fulfillmentChanges = current.flatMap((row) => {
    if (!row.fulfillmentGroup) {
      return [];
    }
    const prior = previousByGroup.get(row.fulfillmentGroup);
    if (!prior || prior.slug === row.slug) {
      return [];
    }
    return [{ fromName: prior.name, toName: row.name }];
  });
  const previousIds = new Set((previous ?? []).map((row) => row.id));
  const addedProductNames = current
    .filter((row) => !previousIds.has(row.id) && row.kind !== PRODUCT_KINDS.FOOD && row.id !== currentSpace?.id)
    .filter((row) => !fulfillmentChanges.some((change) => change.toName === row.name))
    .map((row) => row.name);
  return {
    addedProductNames,
    foodFrom: previousFood && currentFood && previousFood.slug !== currentFood.slug ? previousFood.name : null,
    foodTo: previousFood && currentFood && previousFood.slug !== currentFood.slug ? currentFood.name : null,
    spaceAdded: currentSpace && currentSpace.id !== previousSpace?.id ? currentSpace.name : null,
    fulfillmentChanges,
  };
}

export function compositionReason(
  delta: ReturnType<typeof compositionDelta>,
  includedNames: string,
): string {
  const parts: string[] = [];
  if (delta.foodFrom && delta.foodTo) {
    parts.push(`Dining changes from ${delta.foodFrom} to ${delta.foodTo}.`);
  }
  for (const change of delta.fulfillmentChanges) {
    parts.push(`${change.toName} replaces ${change.fromName}.`);
  }
  if (delta.addedProductNames.length === 1) {
    parts.push(`Adds ${delta.addedProductNames[0]}.`);
  } else if (delta.addedProductNames.length > 1) {
    parts.push(`Adds ${delta.addedProductNames.join(", ")}.`);
  }
  if (delta.spaceAdded) {
    parts.push(`Adds ${delta.spaceAdded}.`);
  }
  if (parts.length === 0) {
    return `Includes ${includedNames}.`;
  }
  return parts.join(" ");
}
