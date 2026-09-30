import { customerActivityName } from "@/server/catalog/scheduling-behavior";
import type { PlannerInquiryFacts } from "@/server/event-planner/build-event-plans";
import {
  ATTRACTION_MODES,
  BUDGET_EXPLANATION_CODES,
  BUDGET_FITS,
  PRODUCT_KINDS,
  type BudgetAssessment,
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

export function spaceReservationConflicts(input: {
  spaceProductId: string;
  requirements: Array<{ productId?: string | null; resourceTypeSlug: string }>;
  types: Array<{ resourceTypeSlug: string; conflict: boolean }>;
}): boolean {
  const slugs = new Set(
    input.requirements
      .filter((row) => row.productId === input.spaceProductId)
      .map((row) => row.resourceTypeSlug),
  );
  if (slugs.size === 0) {
    return false;
  }
  return input.types.some((row) => row.conflict && slugs.has(row.resourceTypeSlug));
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

export function budgetAssessment(input: {
  totalCents: number;
  budgetMin: number | null;
  budgetMax: number | null;
  flexible: boolean;
}): BudgetAssessment {
  const budgetFit = budgetFitForTotal(input);
  if (budgetFit === BUDGET_FITS.FLEXIBLE) {
    return {
      budgetFit,
      budgetExplanationCode: BUDGET_EXPLANATION_CODES.NO_BUDGET,
      budgetDifferenceCents: null,
    };
  }
  if (budgetFit === BUDGET_FITS.UNSPECIFIED) {
    return {
      budgetFit,
      budgetExplanationCode: BUDGET_EXPLANATION_CODES.UNSPECIFIED,
      budgetDifferenceCents: null,
    };
  }
  if (budgetFit === BUDGET_FITS.ABOVE_RANGE && input.budgetMax != null) {
    return {
      budgetFit,
      budgetExplanationCode: BUDGET_EXPLANATION_CODES.ABOVE_BUDGET,
      budgetDifferenceCents: input.totalCents - input.budgetMax,
    };
  }
  if (budgetFit === BUDGET_FITS.BELOW_RANGE && input.budgetMin != null) {
    return {
      budgetFit,
      budgetExplanationCode: BUDGET_EXPLANATION_CODES.BELOW_BUDGET,
      budgetDifferenceCents: input.totalCents - input.budgetMin,
    };
  }
  return {
    budgetFit,
    budgetExplanationCode: BUDGET_EXPLANATION_CODES.WITHIN_BUDGET,
    budgetDifferenceCents: 0,
  };
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
  guestCount: number,
  isWeekend: (date: string) => boolean,
): string | null {
  const slugs = profile.composition?.foodStrategies[strategy] ?? [];
  return (
    slugs.find((slug) => {
      const product = productsBySlug.get(slug);
      return Boolean(product && fitsGuests(product, guestCount) && usable(product, eventDate, isWeekend));
    }) ?? null
  );
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

function chooseSpace<T extends CatalogProduct>(input: {
  tier: TierCompositionConfig;
  profile: RecommendationProfilePayload;
  inquiry: PlannerInquiryFacts;
  productsBySlug: Map<string, T>;
  isWeekend: (date: string) => boolean;
  excludedSpaceSlugs?: string[];
}): T | null {
  const fits = (product: T | undefined): product is T =>
    Boolean(
      product &&
        fitsGuests(product, input.inquiry.guestCount) &&
        usable(product, input.inquiry.desiredDate, input.isWeekend),
    );
  const excluded = new Set(input.excludedSpaceSlugs ?? []);
  const ordered = input.tier.spaceSlugOrder ?? [];
  if (ordered.length > 0) {
    for (const slug of ordered) {
      if (excluded.has(slug)) {
        continue;
      }
      const product = input.productsBySlug.get(slug);
      if (fits(product)) {
        return product;
      }
    }
    return null;
  }
  const fitting = (input.profile.composition?.spaceSlugs ?? [])
    .filter((slug) => !excluded.has(slug))
    .map((slug) => input.productsBySlug.get(slug))
    .filter((row): row is T => fits(row))
    .sort((left, right) => (left.maxGuests ?? Number.MAX_SAFE_INTEGER) - (right.maxGuests ?? Number.MAX_SAFE_INTEGER));
  return input.tier.spaceFit === "largest" ? (fitting[fitting.length - 1] ?? null) : (fitting[0] ?? null);
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
  omitBudgetOptionalUpgrades?: boolean;
  /** Rooms already rejected for this tier, usually because that room's resources conflict. */
  excludedSpaceSlugs?: string[];
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

  const optionalUpgrades = new Set(input.tier.budgetOptionalUpgradeSlugs ?? []);
  for (const slug of input.tier.upgradeSlugs) {
    if (input.omitBudgetOptionalUpgrades && optionalUpgrades.has(slug)) {
      continue;
    }
    const product = input.productsBySlug.get(slug);
    if (product && fitsGuests(product, input.inquiry.guestCount)) {
      push(product);
    }
  }

  // Unknown or null diningPreference still follows the tier food strategy.
  // Only an explicit "none" omits dining. Older rows stored not_sure for "yes".
  if (input.inquiry.diningPreference !== "none") {
    const explicitFood = explicitFoodSlug(input.inquiry, input.profile, input.productsBySlug);
    const foodSlug =
      explicitFood ??
      input.foodSlugOverride ??
      strategyFoodSlug(
        input.tier.foodStrategy,
        input.profile,
        input.productsBySlug,
        input.inquiry.desiredDate,
        input.inquiry.guestCount,
        input.isWeekend,
      );
    push(foodSlug ? input.productsBySlug.get(foodSlug) : null);
    const optional = new Set(input.tier.budgetOptionalUpgradeSlugs ?? []);
    for (const slug of input.tier.beverageSlugs ?? []) {
      if (input.omitBudgetOptionalUpgrades && optional.has(slug)) {
        continue;
      }
      const product = input.productsBySlug.get(slug);
      if (product && fitsGuests(product, input.inquiry.guestCount)) {
        push(product);
      }
    }
  }

  const privateRequested = wantsPrivateSpace(input.inquiry.spacePreference);
  const room = chooseSpace(input);
  let spaceUnmet = false;
  if (privateRequested) {
    if (!room) {
      spaceUnmet = true;
    } else {
      push(room);
    }
  } else if (input.tier.includeSpace) {
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

function englishList(items: string[]): string {
  if (items.length <= 1) {
    return items[0] ?? "";
  }
  if (items.length === 2) {
    return `${items[0]} and ${items[1]}`;
  }
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

function sentence(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  return `${trimmed.charAt(0).toUpperCase()}${trimmed.slice(1)}.`;
}

function upgradePhrase(fromName: string, toName: string): string {
  const fromParts = fromName.split(" - ");
  const toParts = toName.split(" - ");
  if (fromParts.length >= 2 && toParts.length >= 2 && fromParts[0] === toParts[0]) {
    return `upgrades ${fromParts[0]} to ${toParts.slice(1).join(" - ")}`;
  }
  return `upgrades ${fromName} to ${toName}`;
}

function includedSentence(products: CompositionProduct[], explicitSelections: boolean): string {
  const attractions = products.filter(
    (row) => row.kind === PRODUCT_KINDS.ATTRACTION || row.kind === PRODUCT_KINDS.PACKAGE,
  );
  const food = products.find((row) => row.kind === PRODUCT_KINDS.FOOD) ?? null;
  const space = products.find((row) => row.kind === PRODUCT_KINDS.RENTAL) ?? null;
  const addOns = products.filter((row) => row.kind === PRODUCT_KINDS.ADD_ON);
  const chunks: string[] = [];
  if (attractions.length > 0) {
    const names = englishList(attractions.map((row) => customerActivityName(row.name)));
    chunks.push(explicitSelections ? `your selected ${names}` : names);
  }
  if (food) {
    chunks.push(`${food.name} dining`);
  }
  if (addOns.length > 0) {
    chunks.push(englishList(addOns.map((row) => customerActivityName(row.name))));
  }
  if (space) {
    chunks.push(`private event space (${space.name})`);
  }
  if (chunks.length === 0) {
    return "Includes this venue's configured option.";
  }
  return `Includes ${englishList(chunks)}.`;
}

export function compositionReason<T extends CatalogProduct>(input: {
  current: T[];
  previous: T[] | null;
  explicitSelections: boolean;
}): string {
  if (!input.previous) {
    return includedSentence(input.current, input.explicitSelections);
  }
  const delta = compositionDelta(input.previous, input.current);
  const previousSpace = input.previous.find((row) => row.kind === PRODUCT_KINDS.RENTAL) ?? null;
  const currentSpace = input.current.find((row) => row.kind === PRODUCT_KINDS.RENTAL) ?? null;
  const changes: string[] = [];
  for (const change of delta.fulfillmentChanges) {
    changes.push(upgradePhrase(change.fromName, change.toName));
  }
  if (delta.foodTo) {
    changes.push(`upgrades dining to ${delta.foodTo}`);
  }
  if (delta.addedProductNames.length > 0) {
    changes.push(`adds ${englishList(delta.addedProductNames.map((name) => customerActivityName(name)))}`);
  }
  if (currentSpace && !previousSpace) {
    changes.push(`adds ${currentSpace.name}`);
  } else if (currentSpace && previousSpace && currentSpace.id !== previousSpace.id) {
    changes.push(`moves your group to ${currentSpace.name}`);
  }
  if (changes.length === 0) {
    return includedSentence(input.current, input.explicitSelections);
  }
  const keptSpace =
    currentSpace && previousSpace && currentSpace.id === previousSpace.id ? currentSpace.name : null;
  const keptAttractions = input.explicitSelections
    ? input.current
        .filter((row) => row.kind === PRODUCT_KINDS.ATTRACTION || row.kind === PRODUCT_KINDS.PACKAGE)
        .filter((row) => input.previous?.some((previous) => previous.id === row.id))
        .map((row) => customerActivityName(row.name))
    : [];
  const kept = [
    keptSpace,
    keptAttractions.length > 0 ? `your selected ${englishList(keptAttractions)}` : null,
  ].filter((part): part is string => Boolean(part));
  const body = kept.length > 0 ? `${englishList(changes)} while keeping ${englishList(kept)}` : englishList(changes);
  return sentence(body);
}
