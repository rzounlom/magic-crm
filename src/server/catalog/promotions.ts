/**
 * Tenant-configurable promotion evaluation.
 * Runs after base priceProduct on the post-inclusion product set.
 * No implicit stacking. Integer cents only.
 */

import { parseClockToHour, percentOfCents, weekdayKeyFromIsoDate } from "@/server/catalog/pricing";
import type {
  AppliedPromotionSnapshot,
  PriceQuote,
  PricedLineItem,
  PricingContext,
  WeekdayKey,
} from "@/types/catalog";
import { PRODUCT_KINDS } from "@/types/catalog";

export const PROMOTION_TYPES = {
  PERCENTAGE: "PERCENTAGE",
  FIXED_AMOUNT: "FIXED_AMOUNT",
  FIXED_PRICE: "FIXED_PRICE",
  BUY_X_GET_Y: "BUY_X_GET_Y",
} as const;

export type PromotionType = (typeof PROMOTION_TYPES)[keyof typeof PROMOTION_TYPES];

export type PromotionPayload = {
  percent?: number;
  amountCents?: number;
  promotionalPriceCents?: number;
  application?: "PER_UNIT" | "PER_LINE";
  buyQuantity?: number;
  getQuantity?: number;
  rewardPercent?: number;
  maxApplications?: number;
  identicalProductsOnly?: boolean;
  allowStoredValue?: boolean;
};

export type PricingPromotionRule = {
  id: string;
  organizationId: string;
  locationId: string | null;
  slug: string;
  name: string;
  type: PromotionType;
  version: number;
  active: boolean;
  stackable: boolean;
  stackingGroup: string | null;
  priority: number;
  allowsFurtherDiscount: boolean;
  productSlugs: string[] | null;
  categorySlugs: string[] | null;
  daysOfWeek: WeekdayKey[] | null;
  localStartMinute: number | null;
  localEndMinute: number | null;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  minQuantity: number | null;
  maxQuantity: number | null;
  payload: PromotionPayload;
};

export type PromotionEvaluationResult = {
  quotes: PriceQuote[];
  applied: AppliedPromotionSnapshot[];
};

function clockMinute(startTime: string | null): number | null {
  const hour = parseClockToHour(startTime);
  if (hour == null || !startTime) {
    return null;
  }
  const parts = startTime.split(":");
  const minute = Number(parts[1] ?? 0);
  return hour * 60 + (Number.isFinite(minute) ? minute : 0);
}

function dateOnly(value: string | null): string | null {
  if (!value) {
    return null;
  }
  return value.slice(0, 10);
}

function quoteQuantity(quote: PriceQuote): number {
  return quote.lineItems.reduce((sum, row) => sum + row.quantity, 0);
}

function cloneQuote(quote: PriceQuote): PriceQuote {
  return {
    ...quote,
    lineItems: quote.lineItems.map((row) => ({ ...row })),
    appliedPromotions: quote.appliedPromotions ? [...quote.appliedPromotions] : undefined,
  };
}

function isStoredValueKind(kind: string): boolean {
  return kind === PRODUCT_KINDS.ADD_ON || kind === "PLAY_CREDIT";
}

function promotionMatchesProduct(
  promotion: PricingPromotionRule,
  quote: PriceQuote,
  context: PricingContext,
): boolean {
  if (promotion.productSlugs && promotion.productSlugs.length > 0) {
    if (!promotion.productSlugs.includes(quote.slug)) {
      return false;
    }
  }
  if (promotion.categorySlugs && promotion.categorySlugs.length > 0) {
    const category = context.categorySlugByProductId?.[quote.productId];
    if (!category || !promotion.categorySlugs.includes(category)) {
      return false;
    }
  }
  return true;
}

export function promotionIsEligible(
  promotion: PricingPromotionRule,
  quote: PriceQuote,
  context: PricingContext,
): boolean {
  if (!promotion.active) {
    return false;
  }
  if (context.organizationId && promotion.organizationId !== context.organizationId) {
    return false;
  }
  if (promotion.locationId && context.locationId && promotion.locationId !== context.locationId) {
    return false;
  }
  if (promotion.locationId && !context.locationId) {
    return false;
  }
  if (!promotionMatchesProduct(promotion, quote, context)) {
    return false;
  }
  const eventDate = dateOnly(context.eventDate);
  if (promotion.effectiveFrom && eventDate && eventDate < promotion.effectiveFrom.slice(0, 10)) {
    return false;
  }
  if (promotion.effectiveTo && eventDate && eventDate > promotion.effectiveTo.slice(0, 10)) {
    return false;
  }
  if (promotion.daysOfWeek && promotion.daysOfWeek.length > 0) {
    if (!eventDate) {
      return false;
    }
    const weekday = weekdayKeyFromIsoDate(eventDate, context.timeZone);
    if (!promotion.daysOfWeek.includes(weekday)) {
      return false;
    }
  }
  if (promotion.localStartMinute != null || promotion.localEndMinute != null) {
    const minute = clockMinute(context.startTime);
    if (minute == null) {
      return false;
    }
    if (promotion.localStartMinute != null && minute < promotion.localStartMinute) {
      return false;
    }
    if (promotion.localEndMinute != null && minute > promotion.localEndMinute) {
      return false;
    }
  }
  const quantity = quoteQuantity(quote);
  if (promotion.minQuantity != null && quantity < promotion.minQuantity) {
    return false;
  }
  if (promotion.maxQuantity != null && quantity > promotion.maxQuantity) {
    return false;
  }
  if (isStoredValueKind(quote.lineItems[0]?.kind ?? "") && promotion.payload.allowStoredValue !== true) {
    return false;
  }
  return true;
}

function primaryActivityLine(quote: PriceQuote): PricedLineItem | null {
  return quote.lineItems.find((row) => !/shoes$/i.test(row.name) && !row.name.toLowerCase().includes(" shoe")) ?? quote.lineItems[0] ?? null;
}

function applyDiscountToLine(
  line: PricedLineItem,
  discountCents: number,
): PricedLineItem {
  const capped = Math.min(Math.max(0, discountCents), line.totalCents);
  const nextTotal = line.totalCents - capped;
  const nextUnit = line.quantity > 0 ? Math.floor(nextTotal / line.quantity) : 0;
  return {
    ...line,
    originalUnitPriceCents: line.originalUnitPriceCents ?? line.unitPriceCents,
    originalTotalCents: line.originalTotalCents ?? line.totalCents,
    discountCents: (line.discountCents ?? 0) + capped,
    unitPriceCents: nextUnit,
    totalCents: nextTotal,
  };
}

function applyPercentage(quote: PriceQuote, promotion: PricingPromotionRule): { quote: PriceQuote; discount: number } {
  const percent = promotion.payload.percent ?? 0;
  const line = primaryActivityLine(quote);
  if (!line || percent <= 0) {
    return { quote, discount: 0 };
  }
  const discount = percentOfCents(line.totalCents, percent);
  const nextLine = applyDiscountToLine(line, discount);
  const lineItems = quote.lineItems.map((row) => (row === line ? nextLine : row));
  const totalCents = lineItems.reduce((sum, row) => sum + row.totalCents, 0);
  return { quote: { ...quote, lineItems, totalCents }, discount };
}

function applyFixedAmount(quote: PriceQuote, promotion: PricingPromotionRule): { quote: PriceQuote; discount: number } {
  const amount = promotion.payload.amountCents ?? 0;
  const line = primaryActivityLine(quote);
  if (!line || amount <= 0) {
    return { quote, discount: 0 };
  }
  const application = promotion.payload.application ?? "PER_LINE";
  const raw = application === "PER_UNIT" ? amount * line.quantity : amount;
  const discount = Math.min(raw, line.totalCents);
  const nextLine = applyDiscountToLine(line, discount);
  const lineItems = quote.lineItems.map((row) => (row === line ? nextLine : row));
  const totalCents = lineItems.reduce((sum, row) => sum + row.totalCents, 0);
  return { quote: { ...quote, lineItems, totalCents }, discount };
}

function applyFixedPrice(quote: PriceQuote, promotion: PricingPromotionRule): { quote: PriceQuote; discount: number } {
  const promotional = promotion.payload.promotionalPriceCents;
  const line = primaryActivityLine(quote);
  if (promotional == null || !line) {
    return { quote, discount: 0 };
  }
  const application = promotion.payload.application ?? "PER_UNIT";
  const targetTotal =
    application === "PER_LINE" ? promotional : promotional * line.quantity;
  const discount = Math.max(0, line.totalCents - targetTotal);
  const nextLine = applyDiscountToLine(line, discount);
  const lineItems = quote.lineItems.map((row) => (row === line ? nextLine : row));
  const totalCents = lineItems.reduce((sum, row) => sum + row.totalCents, 0);
  return { quote: { ...quote, lineItems, totalCents }, discount };
}

/**
 * Buy X get Y: for equal-priced units, free units = floor(qty / (buy+get)) * get,
 * capped by maxApplications. Odd remainders stay paid.
 */
function applyBuyXGetY(quote: PriceQuote, promotion: PricingPromotionRule): { quote: PriceQuote; discount: number } {
  const buy = promotion.payload.buyQuantity ?? 0;
  const get = promotion.payload.getQuantity ?? 0;
  const rewardPercent = promotion.payload.rewardPercent ?? 100;
  const line = primaryActivityLine(quote);
  if (!line || buy < 1 || get < 1 || line.quantity < 1) {
    return { quote, discount: 0 };
  }
  const cycle = buy + get;
  const applications = Math.floor(line.quantity / cycle);
  const capped =
    promotion.payload.maxApplications != null
      ? Math.min(applications, promotion.payload.maxApplications)
      : applications;
  const freeUnits = capped * get;
  if (freeUnits <= 0) {
    return { quote, discount: 0 };
  }
  const freeValue = freeUnits * line.unitPriceCents;
  const discount = percentOfCents(freeValue, rewardPercent);
  const nextLine = applyDiscountToLine(line, discount);
  const lineItems = quote.lineItems.map((row) => (row === line ? nextLine : row));
  const totalCents = lineItems.reduce((sum, row) => sum + row.totalCents, 0);
  return { quote: { ...quote, lineItems, totalCents }, discount };
}

export function applySinglePromotion(
  quote: PriceQuote,
  promotion: PricingPromotionRule,
): { quote: PriceQuote; discount: number } {
  switch (promotion.type) {
    case PROMOTION_TYPES.PERCENTAGE:
      return applyPercentage(quote, promotion);
    case PROMOTION_TYPES.FIXED_AMOUNT:
      return applyFixedAmount(quote, promotion);
    case PROMOTION_TYPES.FIXED_PRICE:
      return applyFixedPrice(quote, promotion);
    case PROMOTION_TYPES.BUY_X_GET_Y:
      return applyBuyXGetY(quote, promotion);
    default:
      return { quote, discount: 0 };
  }
}

function snapshotFor(
  promotion: PricingPromotionRule,
  productId: string,
  originalTotalCents: number,
  discountCents: number,
  finalTotalCents: number,
  stackingDecision: string,
): AppliedPromotionSnapshot {
  return {
    promotionId: promotion.id,
    slug: promotion.slug,
    version: promotion.version,
    type: promotion.type,
    productId,
    originalTotalCents,
    discountCents,
    finalTotalCents,
    stackingDecision,
  };
}

/**
 * Deterministic promotion application.
 * Exclusive promotions: best (lowest) final line total, then lower priority, then slug.
 * Stackable promotions in the same group apply in priority then slug order.
 */
export function applyPromotions(input: {
  quotes: PriceQuote[];
  context: PricingContext;
  promotions: PricingPromotionRule[];
}): PromotionEvaluationResult {
  const applied: AppliedPromotionSnapshot[] = [];
  const quotes = input.quotes.map((quote) => {
    const eligible = input.promotions
      .filter((promotion) => promotionIsEligible(promotion, quote, input.context))
      .sort((left, right) => left.priority - right.priority || left.slug.localeCompare(right.slug));
    if (eligible.length === 0) {
      return quote;
    }

    const exclusive = eligible.filter((row) => !row.stackable);
    const stackable = eligible.filter((row) => row.stackable);

    let current = cloneQuote(quote);
    const originalTotal = quote.totalCents;

    if (exclusive.length > 0) {
      let best: {
        promotion: PricingPromotionRule;
        quote: PriceQuote;
        discount: number;
      } | null = null;
      for (const promotion of exclusive) {
        const result = applySinglePromotion(cloneQuote(quote), promotion);
        if (!best) {
          best = { promotion, ...result };
          continue;
        }
        if (
          result.quote.totalCents < best.quote.totalCents ||
          (result.quote.totalCents === best.quote.totalCents &&
            (promotion.priority < best.promotion.priority ||
              (promotion.priority === best.promotion.priority &&
                promotion.slug.localeCompare(best.promotion.slug) < 0)))
        ) {
          best = { promotion, ...result };
        }
      }
      if (best && best.discount > 0) {
        current = best.quote;
        applied.push(
          snapshotFor(
            best.promotion,
            quote.productId,
            originalTotal,
            best.discount,
            current.totalCents,
            "exclusive-best-price",
          ),
        );
        if (!best.promotion.allowsFurtherDiscount && best.promotion.type === PROMOTION_TYPES.FIXED_PRICE) {
          return { ...current, appliedPromotions: applied.filter((row) => row.productId === quote.productId) };
        }
      }
    }

    const groups = new Map<string, PricingPromotionRule[]>();
    for (const promotion of stackable) {
      const key = promotion.stackingGroup ?? promotion.slug;
      const list = groups.get(key) ?? [];
      list.push(promotion);
      groups.set(key, list);
    }
    for (const group of groups.values()) {
      const ordered = [...group].sort(
        (left, right) => left.priority - right.priority || left.slug.localeCompare(right.slug),
      );
      for (const promotion of ordered) {
        if (
          current.appliedPromotions?.some((row) => row.promotionId === promotion.id) ||
          applied.some((row) => row.promotionId === promotion.id && row.productId === quote.productId)
        ) {
          continue;
        }
        const blockedByFixed =
          applied.some(
            (row) =>
              row.productId === quote.productId &&
              row.type === PROMOTION_TYPES.FIXED_PRICE &&
              !ordered.find((item) => item.id === row.promotionId)?.allowsFurtherDiscount,
          ) &&
          exclusive.some((row) => row.type === PROMOTION_TYPES.FIXED_PRICE && !row.allowsFurtherDiscount);
        if (blockedByFixed && promotion.type === PROMOTION_TYPES.PERCENTAGE) {
          continue;
        }
        const before = current.totalCents;
        const result = applySinglePromotion(current, promotion);
        if (result.discount <= 0) {
          continue;
        }
        current = result.quote;
        applied.push(
          snapshotFor(promotion, quote.productId, before, result.discount, current.totalCents, "stacked"),
        );
      }
    }

    return current;
  });

  return { quotes, applied };
}

export function grantsForOrganizationPromotions(
  promotions: PricingPromotionRule[],
  organizationId: string,
): PricingPromotionRule[] {
  return promotions.filter((row) => row.organizationId === organizationId);
}

function stringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const rows = value.filter((entry): entry is string => typeof entry === "string");
  return rows.length > 0 ? rows : null;
}

function weekdayArray(value: unknown): WeekdayKey[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const rows = value.filter((entry): entry is WeekdayKey => typeof entry === "string");
  return rows.length > 0 ? rows : null;
}

/** Map a persisted PricingPromotion row into the evaluator rule shape. */
export function pricingPromotionFromRow(row: {
  id: string;
  organizationId: string;
  locationId: string | null;
  slug: string;
  name: string;
  type: string;
  version: number;
  active: boolean;
  stackable: boolean;
  stackingGroup: string | null;
  priority: number;
  allowsFurtherDiscount: boolean;
  productSlugs: unknown;
  categorySlugs: unknown;
  daysOfWeek: unknown;
  localStartMinute: number | null;
  localEndMinute: number | null;
  effectiveFrom: Date | null;
  effectiveTo: Date | null;
  minQuantity: number | null;
  maxQuantity: number | null;
  payload: unknown;
}): PricingPromotionRule {
  const payload =
    row.payload && typeof row.payload === "object" && !Array.isArray(row.payload)
      ? (row.payload as PromotionPayload)
      : {};
  return {
    id: row.id,
    organizationId: row.organizationId,
    locationId: row.locationId,
    slug: row.slug,
    name: row.name,
    type: row.type as PromotionType,
    version: row.version,
    active: row.active,
    stackable: row.stackable,
    stackingGroup: row.stackingGroup,
    priority: row.priority,
    allowsFurtherDiscount: row.allowsFurtherDiscount,
    productSlugs: stringArray(row.productSlugs),
    categorySlugs: stringArray(row.categorySlugs),
    daysOfWeek: weekdayArray(row.daysOfWeek),
    localStartMinute: row.localStartMinute,
    localEndMinute: row.localEndMinute,
    effectiveFrom: row.effectiveFrom ? row.effectiveFrom.toISOString().slice(0, 10) : null,
    effectiveTo: row.effectiveTo ? row.effectiveTo.toISOString().slice(0, 10) : null,
    minQuantity: row.minQuantity,
    maxQuantity: row.maxQuantity,
    payload,
  };
}
