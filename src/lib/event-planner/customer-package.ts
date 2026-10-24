import {
  formatCustomerDurationText,
  formatDiningPreference,
  formatEventDuration,
  formatGuestMix,
  formatSpacePreference,
} from "@/lib/event-planner/labels";
import { formatMoneyFromCents } from "@/lib/event-planner/money";
import { formatEventLocalDateTime } from "@/lib/inquiries/tenant-datetime";
import { INQUIRY_AUDIENCES, PRODUCT_KINDS } from "@/types/catalog";
import {
  CUSTOMER_AVAILABILITY_NOTE,
  CUSTOMER_OCCUPANCY_NOTE,
  DINING_PREFERENCE_LABELS,
  EVENT_PLAN_TIERS,
  PACKAGE_PRESENTATION,
  UNCONFIRMED_DINING_LABEL,
  type EventPlanDining,
  type EventPlanLineItem,
  type EventPlanPayload,
} from "@/types/event-planner";
import { PLAN_AVAILABILITY_STATUSES } from "@/types/resource-schedule";
import { TAX_CALCULATION_STATUSES, type TaxBreakdownSnapshot } from "@/types/tax";

export type PackageSectionKey = "activity" | "food" | "space" | "addon";

export type PackagePresentation = {
  label: string;
  subtitle: string;
};

export type CustomerEventSummary = {
  title: string;
  dateTime: string;
  guestCount: string;
  duration: string | null;
  audience: string | null;
  diningPreference: string | null;
  spacePreference: string | null;
};

const TIER_ORDER = [EVENT_PLAN_TIERS.BUDGET, EVENT_PLAN_TIERS.BEST_FIT, EVENT_PLAN_TIERS.PREMIUM] as const;

const AUDIENCE_LABELS: Record<string, string> = {
  [INQUIRY_AUDIENCES.KIDS_YOUTH]: "Kids / Youth",
  [INQUIRY_AUDIENCES.ADULTS]: "Adults",
  [INQUIRY_AUDIENCES.MIXED]: "Mixed ages",
};

const MISSING_LABEL = "Not specified";
const PLACEHOLDER_DINING = new Set<string>([
  UNCONFIRMED_DINING_LABEL,
  DINING_PREFERENCE_LABELS.not_sure,
  DINING_PREFERENCE_LABELS.catered_help,
]);

export function isUnresolvedDining(dining: Pick<EventPlanDining, "label" | "knowledgeItemId" | "priceCents">): boolean {
  if (dining.knowledgeItemId || dining.priceCents > 0) {
    return false;
  }
  const label = dining.label.trim();
  return !label || PLACEHOLDER_DINING.has(label);
}

export function packagePresentation(tier: string): PackagePresentation {
  if (tier === EVENT_PLAN_TIERS.BUDGET) {
    return PACKAGE_PRESENTATION.budget;
  }
  if (tier === EVENT_PLAN_TIERS.BEST_FIT) {
    return PACKAGE_PRESENTATION.best_fit;
  }
  return PACKAGE_PRESENTATION.premium;
}

export function classifyProductKind(kind: string | null | undefined): PackageSectionKey | "other" {
  if (kind === PRODUCT_KINDS.ATTRACTION || kind === PRODUCT_KINDS.PACKAGE || kind === PRODUCT_KINDS.FIELD_TRIP) {
    return "activity";
  }
  if (kind === PRODUCT_KINDS.FOOD) {
    return "food";
  }
  if (kind === PRODUCT_KINDS.RENTAL) {
    return "space";
  }
  if (kind === PRODUCT_KINDS.ADD_ON) {
    return "addon";
  }
  return "other";
}

export function formatComponentPrice(
  item: Pick<EventPlanLineItem, "name" | "quantity" | "unitPriceCents" | "totalCents">,
  currency: string,
): string | null {
  if (item.quantity < 1 || item.unitPriceCents < 0 || item.totalCents < 0) {
    return null;
  }
  const name = formatCustomerDurationText(item.name);
  return `${item.quantity} × ${name} at ${formatMoneyFromCents(item.unitPriceCents, currency)} = ${formatMoneyFromCents(item.totalCents, currency)}`;
}

export function lineItemsForSection(payload: EventPlanPayload, section: PackageSectionKey): EventPlanLineItem[] {
  return (payload.lineItems ?? []).filter((row) => classifyProductKind(row.kind) === section);
}

export function matchingLineItem(
  payload: EventPlanPayload,
  input: { name: string; productId?: string },
): EventPlanLineItem | null {
  const items = payload.lineItems ?? [];
  if (input.productId) {
    const byId = items.find((row) => row.productId === input.productId);
    if (byId) {
      return byId;
    }
  }
  return items.find((row) => row.name === input.name) ?? null;
}

export function itemizedTotalMatchesEstimate(
  payload: EventPlanPayload,
  estimatedTotalCents: number | null,
): boolean {
  const items = payload.lineItems ?? [];
  if (items.length === 0 || estimatedTotalCents == null) {
    return false;
  }
  const sum = items.reduce((total, row) => total + row.totalCents, 0);
  return sum === estimatedTotalCents;
}

/**
 * Factual upgrade lines only. Returns [] when nothing proven changed.
 * Prefers catalog compositionDelta; otherwise compares customer-visible names.
 */
export function describeTierImprovements(
  previous: EventPlanPayload | null,
  current: EventPlanPayload,
): string[] {
  if (!previous) {
    return [];
  }
  const delta = current.compositionDelta;
  if (delta) {
    return uniqueLines([
      ...(delta.foodFrom && delta.foodTo
        ? [`Upgraded from ${formatCustomerDurationText(delta.foodFrom)} to ${formatCustomerDurationText(delta.foodTo)}`]
        : []),
      ...delta.fulfillmentChanges.map(
        (change) =>
          `Upgrades ${formatCustomerDurationText(change.fromName)} to ${formatCustomerDurationText(change.toName)}`,
      ),
      ...delta.addedProductNames.map((name) => `Adds ${formatCustomerDurationText(name)}`),
      ...(delta.spaceAdded
        ? [`Includes private event space (${formatCustomerDurationText(delta.spaceAdded)})`]
        : []),
    ]);
  }
  return derivedImprovements(previous, current);
}

function derivedImprovements(previous: EventPlanPayload, current: EventPlanPayload): string[] {
  const lines: string[] = [];
  const previousActivities = new Set(previous.activities.map((row) => row.name));
  for (const activity of current.activities) {
    if (!previousActivities.has(activity.name)) {
      lines.push(`Adds ${formatCustomerDurationText(activity.name)}`);
    }
  }
  if (previous.dining.label !== current.dining.label) {
    const previousFood = previous.dining.label.trim();
    const currentFood = current.dining.label.trim();
    if (
      previousFood &&
      currentFood &&
      !PLACEHOLDER_DINING.has(previousFood) &&
      !PLACEHOLDER_DINING.has(currentFood)
    ) {
      lines.push(`Upgraded from ${formatCustomerDurationText(previousFood)} to ${formatCustomerDurationText(currentFood)}`);
    }
  }
  const previousSpaces = new Set(previous.spaces.map((row) => row.name));
  for (const space of current.spaces) {
    if (!previousSpaces.has(space.name)) {
      lines.push(`Includes private event space (${formatCustomerDurationText(space.name)})`);
    }
  }
  return uniqueLines(lines);
}

export function previousTierInSet(tier: string, presentTiers: string[]): string | null {
  const present = TIER_ORDER.filter((row) => presentTiers.includes(row));
  const index = present.indexOf(tier as (typeof TIER_ORDER)[number]);
  return index > 0 ? present[index - 1] : null;
}

export function customerAvailabilityCopy(input: {
  availabilityStatus?: string | null;
  itineraryAdjusted?: boolean;
  customerAvailabilityNote?: string | null;
}): string {
  if (
    input.availabilityStatus === PLAN_AVAILABILITY_STATUSES.UNAVAILABLE ||
    input.availabilityStatus === PLAN_AVAILABILITY_STATUSES.NEEDS_ADJUSTMENT
  ) {
    return "This option is not available at the requested time.";
  }
  if (input.itineraryAdjusted) {
    return "Adjusted from your requested time. This itinerary is currently viable.";
  }
  if (input.availabilityStatus === PLAN_AVAILABILITY_STATUSES.AVAILABLE) {
    return CUSTOMER_OCCUPANCY_NOTE;
  }
  return input.customerAvailabilityNote?.trim() || CUSTOMER_AVAILABILITY_NOTE;
}

export function customerTaxNote(
  tax: TaxBreakdownSnapshot | undefined,
  currency: string,
): string | null {
  if (!tax) {
    return null;
  }
  if (
    (tax.status === TAX_CALCULATION_STATUSES.CALCULATED ||
      tax.status === TAX_CALCULATION_STATUSES.EXEMPT ||
      tax.status === TAX_CALCULATION_STATUSES.ZERO_RATE) &&
    tax.taxTotalCents != null
  ) {
    return `Estimated tax ${formatMoneyFromCents(tax.taxTotalCents, currency)} is not included in this total.`;
  }
  if (tax.status === TAX_CALCULATION_STATUSES.DISABLED) {
    return null;
  }
  return "Taxes and fees are not included in this estimate. The venue will confirm them.";
}

export function summarizeCustomerEvent(input: {
  occasion?: string | null;
  eventType?: string | null;
  eventGoal?: string | null;
  desiredDate?: Date | string | null;
  desiredStartTime?: string | null;
  payloadDate?: string | null;
  payloadStartTime?: string | null;
  guestCount?: number | null;
  durationMinutes?: number | null;
  guestMix?: string | null;
  audience?: string | null;
  diningPreference?: string | null;
  spacePreference?: string | null;
}): CustomerEventSummary {
  const title = firstPresent(input.occasion, input.eventType, input.eventGoal) ?? "Your event";
  const dateTime = formatEventLocalDateTime({
    date: input.desiredDate ?? input.payloadDate,
    time: input.desiredStartTime ?? input.payloadStartTime,
  });
  const guestCount =
    typeof input.guestCount === "number" && input.guestCount > 0
      ? `${input.guestCount} guests`
      : MISSING_LABEL;
  const duration =
    typeof input.durationMinutes === "number" && input.durationMinutes > 0
      ? formatEventDuration(input.durationMinutes)
      : null;
  const mix = input.guestMix ? formatGuestMix(input.guestMix) : "";
  const audienceFromMix = mix && mix !== "—" ? mix : null;
  const audience = audienceFromMix ?? (input.audience ? AUDIENCE_LABELS[input.audience] ?? null : null);
  const dining = input.diningPreference ? formatDiningPreference(input.diningPreference) : "";
  const space = input.spacePreference ? formatSpacePreference(input.spacePreference) : "";
  return {
    title,
    dateTime: dateTime || MISSING_LABEL,
    guestCount,
    duration,
    audience,
    diningPreference: dining && dining !== "—" ? dining : null,
    spacePreference: space && space !== "—" ? space : null,
  };
}

export function sharedDurationMinutes(durations: Array<number | null | undefined>): number | null {
  const known = durations.filter((value): value is number => typeof value === "number" && value > 0);
  if (known.length === 0) {
    return null;
  }
  return known.every((value) => value === known[0]) ? known[0] : null;
}

function firstPresent(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) {
      return trimmed;
    }
  }
  return null;
}

function uniqueLines(lines: string[]): string[] {
  return [...new Set(lines.filter((row) => row.trim().length > 0))];
}
