import { dollarsToCents } from "@/lib/event-planner/money";
import {
  PRODUCT_PRICE_STRATEGIES,
  WEEKDAY_KEYS,
  type CatalogPriceInput,
  type CatalogProductInput,
  type PricedLineItem,
  type PriceQuote,
  type PricingContext,
  type WeekdayKey,
} from "@/types/catalog";

export function catalogPriceFromRow(row: {
  strategy: string;
  amountCents: number;
  additionalGuestCents: number | null;
  includedGuests: number | null;
  includedHours: number | null;
  additionalHourCents: number | null;
  minGuests: number | null;
  weekdayAmountCents: number | null;
  weekendAmountCents: number | null;
  daysOfWeek: unknown;
  afterHour: number | null;
  afterHourAmountCents: number | null;
  shoeAddOnCents: number | null;
  unitLabel: string | null;
}): CatalogPriceInput {
  const days = Array.isArray(row.daysOfWeek)
    ? row.daysOfWeek.filter((entry): entry is WeekdayKey => typeof entry === "string")
    : [];
  return {
    strategy: row.strategy,
    amountCents: row.amountCents,
    additionalGuestCents: row.additionalGuestCents,
    includedGuests: row.includedGuests,
    includedHours: row.includedHours,
    additionalHourCents: row.additionalHourCents,
    minGuests: row.minGuests,
    weekdayAmountCents: row.weekdayAmountCents,
    weekendAmountCents: row.weekendAmountCents,
    daysOfWeek: days.length > 0 ? days : null,
    afterHour: row.afterHour,
    afterHourAmountCents: row.afterHourAmountCents,
    shoeAddOnCents: row.shoeAddOnCents,
    unitLabel: row.unitLabel,
  };
}

export function weekdayKeyFromIsoDate(isoDate: string): WeekdayKey {
  const day = new Date(`${isoDate}T00:00:00.000Z`).getUTCDay();
  return WEEKDAY_KEYS[day] ?? "sun";
}

export function isWeekendKey(key: WeekdayKey): boolean {
  return key === "sat" || key === "sun";
}

export function parseClockToHour(startTime: string | null): number | null {
  if (!startTime) {
    return null;
  }
  const [hour, minute] = startTime.split(":").map(Number);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
    return null;
  }
  return (minute ?? 0) >= 0 ? hour : null;
}

export function percentOfCents(cents: number, percent: number): number {
  return Math.trunc((cents * percent + 50) / 100);
}

export const DEFAULT_DEPOSIT_PERCENT = 30;

export function depositPercentFromTenant(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 100) {
    return DEFAULT_DEPOSIT_PERCENT;
  }
  return value;
}

export function depositRequiredCents(totalCents: number, percent: number): number {
  return percentOfCents(Math.max(0, totalCents), depositPercentFromTenant(percent));
}

export function depositPreviewNote(percent: number): string {
  return `${depositPercentFromTenant(percent)}% deposit preview for planning only. Payment is not collected yet.`;
}

function asDays(value: CatalogPriceInput["daysOfWeek"]): WeekdayKey[] | null {
  if (!value || value.length === 0) {
    return null;
  }
  return value;
}

function daysMatch(price: CatalogPriceInput, weekday: WeekdayKey | null): boolean {
  const days = asDays(price.daysOfWeek);
  if (!days) {
    return true;
  }
  if (!weekday) {
    return false;
  }
  return days.includes(weekday);
}

function afterHourApplies(price: CatalogPriceInput, startHour: number | null): boolean {
  if (price.afterHour == null) {
    return false;
  }
  if (startHour == null) {
    return false;
  }
  return startHour >= price.afterHour;
}

function priceSpecificity(price: CatalogPriceInput, weekday: WeekdayKey | null, startHour: number | null): number {
  let score = 0;
  if (asDays(price.daysOfWeek)?.length) {
    score += 10;
  }
  if (afterHourApplies(price, startHour)) {
    score += 20;
  } else if (price.afterHour != null) {
    score += 1;
  }
  if (price.weekdayAmountCents != null || price.weekendAmountCents != null) {
    score += 5;
  }
  if (weekday && asDays(price.daysOfWeek)?.includes(weekday)) {
    score += 2;
  }
  return score;
}

export function selectProductPrice(
  prices: CatalogPriceInput[],
  context: PricingContext,
): CatalogPriceInput | null {
  const weekday = context.eventDate ? weekdayKeyFromIsoDate(context.eventDate) : null;
  const startHour = parseClockToHour(context.startTime);
  const candidates = prices.filter((price) => {
    if (!daysMatch(price, weekday)) {
      return false;
    }
    if (price.afterHour != null && !afterHourApplies(price, startHour)) {
      return false;
    }
    return true;
  });
  if (candidates.length === 0) {
    return prices[0] ?? null;
  }
  return [...candidates].sort(
    (left, right) => priceSpecificity(right, weekday, startHour) - priceSpecificity(left, weekday, startHour),
  )[0];
}

function billedGuestCount(guestCount: number, minGuests: number | null): number {
  if (minGuests && minGuests > guestCount) {
    return minGuests;
  }
  return Math.max(0, guestCount);
}

function extraHours(durationMinutes: number, includedHours: number | null): number {
  const included = includedHours && includedHours > 0 ? includedHours : 0;
  const hours = Math.max(1, Math.ceil(durationMinutes / 60));
  return Math.max(0, hours - included);
}

function comboQuantity(guestCount: number, servesMin: number | null): number | null {
  if (!servesMin || servesMin < 1) {
    return null;
  }
  return Math.max(1, Math.ceil(guestCount / servesMin));
}

function platterQuantity(guestCount: number, servesMin: number | null): number {
  const perPlatter = servesMin && servesMin > 0 ? servesMin : guestCount;
  return Math.max(1, Math.ceil(guestCount / perPlatter));
}

function line(
  product: CatalogProductInput,
  quantity: number,
  unitPriceCents: number,
  unitLabel: string | null,
  name = product.name,
): PricedLineItem {
  return {
    productId: product.id,
    slug: product.slug,
    name,
    kind: product.kind,
    quantity,
    unitLabel,
    unitPriceCents,
    totalCents: quantity * unitPriceCents,
  };
}

export function priceProduct(product: CatalogProductInput, context: PricingContext): PriceQuote {
  const price = selectProductPrice(product.prices, context);
  if (!price) {
    return {
      productId: product.id,
      slug: product.slug,
      name: product.name,
      totalCents: 0,
      lineItems: [],
      pricingComplete: false,
    };
  }

  const weekday = context.eventDate ? weekdayKeyFromIsoDate(context.eventDate) : null;
  const startHour = parseClockToHour(context.startTime);
  const guests = billedGuestCount(context.guestCount, price.minGuests ?? product.minGuests);
  const items: PricedLineItem[] = [];

  switch (price.strategy) {
    case PRODUCT_PRICE_STRATEGIES.PACKAGE_BASE_PLUS_ADDITIONAL: {
      const included = price.includedGuests && price.includedGuests > 0 ? price.includedGuests : guests;
      items.push(line(product, 1, price.amountCents, price.unitLabel ?? "package"));
      const extra = Math.max(0, guests - included);
      if (extra > 0 && price.additionalGuestCents != null) {
        items.push(
          line(product, extra, price.additionalGuestCents, "guest", `${product.name} additional guests`),
        );
      }
      break;
    }
    case PRODUCT_PRICE_STRATEGIES.PER_PERSON:
    case PRODUCT_PRICE_STRATEGIES.FOOD_PER_PERSON: {
      items.push(line(product, guests, price.amountCents, price.unitLabel ?? "person"));
      break;
    }
    case PRODUCT_PRICE_STRATEGIES.PER_LANE_WEEKDAY_WEEKEND: {
      const guestsPerUnit = product.guestsPerUnit;
      if (!guestsPerUnit || guestsPerUnit < 1) {
        return {
          productId: product.id,
          slug: product.slug,
          name: product.name,
          totalCents: 0,
          lineItems: [],
          pricingComplete: false,
        };
      }
      const units = Math.max(1, Math.ceil(context.guestCount / guestsPerUnit));
      const weekend = weekday ? isWeekendKey(weekday) : false;
      const unitRate =
        weekend && price.weekendAmountCents != null
          ? price.weekendAmountCents
          : (price.weekdayAmountCents ?? price.amountCents);
      items.push(line(product, units, unitRate, price.unitLabel ?? "unit"));
      if (price.shoeAddOnCents && context.guestCount > 0) {
        items.push(
          line(product, context.guestCount, price.shoeAddOnCents, "pair", `${product.name} shoes`),
        );
      }
      break;
    }
    case PRODUCT_PRICE_STRATEGIES.FIXED_RENTAL:
    case PRODUCT_PRICE_STRATEGIES.FOOD_FIXED_SET: {
      items.push(line(product, 1, price.amountCents, price.unitLabel ?? "rental"));
      break;
    }
    case PRODUCT_PRICE_STRATEGIES.DAY_SPECIFIC_RENTAL: {
      items.push(line(product, 1, price.amountCents, price.unitLabel ?? "rental"));
      break;
    }
    case PRODUCT_PRICE_STRATEGIES.DURATION_BASE_PLUS_ADDITIONAL_HOUR: {
      items.push(line(product, 1, price.amountCents, price.unitLabel ?? "block"));
      const extra = extraHours(context.durationMinutes, price.includedHours);
      if (extra > 0 && price.additionalHourCents != null) {
        items.push(
          line(product, extra, price.additionalHourCents, "hour", `${product.name} additional hours`),
        );
      }
      break;
    }
    case PRODUCT_PRICE_STRATEGIES.TIME_WINDOW_RENTAL: {
      const afterApplies = afterHourApplies(price, startHour);
      const amount =
        afterApplies && price.afterHourAmountCents != null ? price.afterHourAmountCents : price.amountCents;
      items.push(line(product, 1, amount, price.unitLabel ?? "rental"));
      break;
    }
    case PRODUCT_PRICE_STRATEGIES.FOOD_PER_COMBO: {
      const quantity = comboQuantity(context.guestCount, product.serving?.servesMin ?? null);
      if (quantity == null) {
        return {
          productId: product.id,
          slug: product.slug,
          name: product.name,
          totalCents: 0,
          lineItems: [],
          pricingComplete: false,
        };
      }
      items.push(line(product, quantity, price.amountCents, price.unitLabel ?? "combo"));
      break;
    }
    case PRODUCT_PRICE_STRATEGIES.FOOD_PER_PLATTER: {
      const quantity = platterQuantity(context.guestCount, product.serving?.servesMin ?? null);
      items.push(line(product, quantity, price.amountCents, price.unitLabel ?? "platter"));
      break;
    }
    default: {
      return {
        productId: product.id,
        slug: product.slug,
        name: product.name,
        totalCents: 0,
        lineItems: [],
        pricingComplete: false,
      };
    }
  }

  const totalCents = items.reduce((sum, item) => sum + item.totalCents, 0);
  return {
    productId: product.id,
    slug: product.slug,
    name: product.name,
    totalCents,
    lineItems: items,
    pricingComplete: true,
  };
}

export function dollarsTextToCents(value: string): number {
  return dollarsToCents(Number.parseFloat(value.replace(/,/g, "")));
}
