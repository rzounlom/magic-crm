import { customerActivityName } from "@/server/catalog/scheduling-behavior";
import {
  formatCustomerDurationMinutes,
  formatCustomerDurationText,
  formatDiningPreference,
  formatDurationMinutes,
  formatEventDuration,
  formatGuestMix,
  formatSpacePreference,
} from "@/lib/event-planner/labels";
import { formatMoneyFromCents } from "@/lib/event-planner/money";
import { formatEventLocalDateTime, formatEventLocalTime } from "@/lib/inquiries/tenant-datetime";
import { INQUIRY_AUDIENCES, PRODUCT_KINDS } from "@/types/catalog";
import {
  CUSTOMER_AVAILABILITY_NOTE,
  CUSTOMER_OCCUPANCY_NOTE,
  DINING_PREFERENCE_LABELS,
  EVENT_PLAN_TIERS,
  PACKAGE_PRESENTATION,
  UNCONFIRMED_DINING_LABEL,
  type EventPlanDining,
  type EventPlanItinerarySegment,
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

const GENERIC_AVAILABILITY_NOTES = new Set([CUSTOMER_AVAILABILITY_NOTE, CUSTOMER_OCCUPANCY_NOTE]);

/** Package-specific warnings only. Generic confirmation language belongs below the comparison. */
export function packageSpecificAvailabilityNote(input: {
  availabilityStatus?: string | null;
  itineraryAdjusted?: boolean;
  customerAvailabilityNote?: string | null;
}): string | null {
  const copy = customerAvailabilityCopy(input);
  return GENERIC_AVAILABILITY_NOTES.has(copy) ? null : copy;
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

const SHOE_NAME = /\bshoes\b/i;
const DURATION_IN_NAME = /\b(\d+)\s*(minutes?|mins?|hours?|hrs?)\b/i;

export function isShoeLineItem(item: Pick<EventPlanLineItem, "name" | "unitLabel">): boolean {
  return item.unitLabel === "pair" || SHOE_NAME.test(item.name);
}

export function packageInclusionLines(payload: EventPlanPayload): string[] {
  const guestCount = payload.guestCount;
  const items = payload.lineItems ?? [];
  const lines: string[] = [];

  if (items.length > 0) {
    const activities = items.filter((row) => classifyProductKind(row.kind) === "activity" && !isShoeLineItem(row));
    const shoes = items.filter((row) => isShoeLineItem(row));
    const addons = items.filter((row) => classifyProductKind(row.kind) === "addon" && !isShoeLineItem(row));
    const foods = items.filter((row) => classifyProductKind(row.kind) === "food");
    const spaces = items.filter((row) => classifyProductKind(row.kind) === "space");

    lines.push(...activities.map((row) => formatActivityInclusion(row, payload)));
    lines.push(...shoes.map((row) => formatShoeInclusion(row)));
    lines.push(...addons.map((row) => formatNamedQuantity(formatCustomerDurationText(row.name), row.quantity, row.unitLabel, guestCount)));
    if (foods.length > 0) {
      lines.push(...foods.map((row) => formatFoodInclusion(row, guestCount)));
    } else {
      lines.push(...fallbackDiningLines(payload));
    }
    lines.push(...(payload.beverages ?? []).map((item) => formatNamedQuantity(item.name, item.quantity ?? 1, item.unitLabel, guestCount)));
    if (spaces.length > 0) {
      lines.push(...spaces.map((row) => formatCustomerDurationText(row.name)));
    } else {
      lines.push(...payload.spaces.map((space) => formatCustomerDurationText(space.name)));
    }
    return uniqueLines(lines);
  }

  lines.push(
    ...payload.activities.map((activity) => {
      const duration = durationTextForName(activity.name, payload);
      const name = customerActivityName(formatCustomerDurationText(activity.name));
      return duration ? `${name} — ${duration}` : name;
    }),
  );
  lines.push(...fallbackDiningLines(payload));
  lines.push(...(payload.beverages ?? []).map((item) => formatNamedQuantity(item.name, item.quantity ?? 1, item.unitLabel, guestCount)));
  lines.push(...payload.spaces.map((space) => formatCustomerDurationText(space.name)));
  lines.push(
    ...(payload.includedItems ?? []).map((item) =>
      formatNamedQuantity(formatCustomerDurationText(item.name), item.quantity ?? 1, item.unitLabel, guestCount),
    ),
  );
  return uniqueLines(lines);
}

export function packagePriceBreakdownRows(
  payload: EventPlanPayload,
  currency: string,
): Array<{ label: string; amount: string }> {
  return (payload.lineItems ?? []).map((item) => ({
    label: priceBreakdownLabel(item),
    amount: formatMoneyFromCents(item.totalCents, currency),
  }));
}

export function packageDistinctionSummary(
  current: EventPlanPayload,
  previous: EventPlanPayload | null,
): string | null {
  const activities = uniqueActivityNames(current);
  const dining = resolvedDiningLabel(current);
  const activityList = joinEnglish(activities);

  if (!previous) {
    if (activityList && dining) {
      return `${activityList} and ${dining} dining`;
    }
    return activityList || dining;
  }

  const previousActivities = new Set(uniqueActivityNames(previous));
  const addedActivities = activities.filter((name) => !previousActivities.has(name));
  const previousDining = resolvedDiningLabel(previous);
  const foodChanged = Boolean(dining && previousDining && dining !== previousDining);
  const spaceAdded = current.spaces.some((space) => !previous.spaces.some((row) => row.name === space.name));
  const delta = current.compositionDelta;
  const deltaFoodOnly = Boolean(
    delta &&
      delta.foodFrom &&
      delta.foodTo &&
      delta.addedProductNames.length === 0 &&
      !delta.spaceAdded &&
      delta.fulfillmentChanges.length === 0,
  );
  const deltaAddedOnly = Boolean(
    delta &&
      !delta.foodFrom &&
      !delta.foodTo &&
      !delta.spaceAdded &&
      delta.fulfillmentChanges.length === 0 &&
      delta.addedProductNames.length > 0,
  );

  if (describeTierImprovements(previous, current).length === 0 && addedActivities.length === 0 && !foodChanged && !spaceAdded) {
    return null;
  }
  if ((deltaFoodOnly || (foodChanged && addedActivities.length === 0 && !spaceAdded)) && activityList && dining) {
    return `${activityList} with upgraded ${dining} dining`;
  }
  if (deltaAddedOnly || (addedActivities.length > 0 && !foodChanged && !spaceAdded)) {
    return activityList || null;
  }
  if (activityList && dining && (foodChanged || addedActivities.length > 0)) {
    return `${activityList} with ${dining} dining`;
  }
  if (spaceAdded && activityList) {
    const spaceName = current.spaces.find((space) => !previous.spaces.some((row) => row.name === space.name))?.name;
    return spaceName ? `${activityList} with ${formatCustomerDurationText(spaceName)}` : activityList;
  }
  return activityList || dining;
}

export function sampleItineraryDetail(segment: EventPlanItinerarySegment): string {
  const raw = formatCustomerDurationText(segment.label).trim();
  const diningName = raw.replace(/^dining\s*[:·-]\s*/i, "").trim();
  if (segment.role === "DINING" || /^dining\s*[:·-]/i.test(raw)) {
    return diningName ? `Dining · ${diningName}` : "Dining";
  }
  return customerActivityName(diningName || raw);
}

/** Compact range such as `5:00–6:00 PM` when both clocks share a period. */
export function formatSampleItineraryRange(start: string, end: string): string {
  const startLabel = formatEventLocalTime(start);
  const endLabel = formatEventLocalTime(end);
  if (!startLabel || !endLabel) {
    return [startLabel, endLabel].filter(Boolean).join("–");
  }
  const startPeriod = startLabel.replace(/^.*\s/, "");
  const endPeriod = endLabel.replace(/^.*\s/, "");
  const startClock = startLabel.replace(/\s*[AP]M$/i, "");
  if (startPeriod === endPeriod) {
    return `${startClock}–${endLabel}`;
  }
  return `${startLabel}–${endLabel}`;
}

function formatActivityInclusion(item: EventPlanLineItem, payload: EventPlanPayload): string {
  const name = customerActivityName(formatCustomerDurationText(item.name));
  const duration = durationTextForName(item.name, payload);
  return duration ? `${name} — ${duration}` : name;
}

function formatShoeInclusion(item: EventPlanLineItem): string {
  const base = customerActivityName(formatCustomerDurationText(item.name.replace(/\s*shoes\s*$/i, "").trim()));
  const quantity = item.quantity > 0 ? item.quantity : null;
  return quantity ? `${base} shoes for ${quantity} guests` : `${base} shoes`;
}

function formatFoodInclusion(item: EventPlanLineItem, guestCount: number): string {
  return formatNamedQuantity(formatCustomerDurationText(item.name), item.quantity, item.unitLabel, guestCount);
}

function formatNamedQuantity(
  name: string,
  quantity: number,
  unitLabel: string | null | undefined,
  guestCount: number,
): string {
  const phrase = quantityPhrase(quantity, unitLabel, guestCount);
  return phrase ? `${name} — ${phrase}` : name;
}

function quantityPhrase(
  quantity: number,
  unitLabel: string | null | undefined,
  guestCount: number,
): string | null {
  if (quantity < 1) {
    return null;
  }
  const unit = unitLabel?.trim().toLowerCase() ?? "";
  if (unit === "person" || unit === "guest") {
    return `${quantity} ${quantity === 1 ? "guest" : "guests"}`;
  }
  if (unit === "combo") {
    return `${quantity} ${quantity === 1 ? "combo" : "combos"}`;
  }
  if (unit === "pair") {
    return `for ${quantity} guests`;
  }
  if (unit) {
    const plural = quantity === 1 || unit.endsWith("s") ? unit : `${unit}s`;
    return `${quantity} ${plural}`;
  }
  if (quantity > 1 && quantity === guestCount) {
    return `${quantity} guests`;
  }
  if (quantity > 1) {
    return String(quantity);
  }
  return null;
}

function durationTextForName(name: string, payload: EventPlanPayload): string | null {
  const fromName = DURATION_IN_NAME.exec(name);
  if (fromName) {
    const count = Number(fromName[1]);
    if (Number.isFinite(count)) {
      const minutes = /^h/i.test(fromName[2]) ? count * 60 : count;
      return formatCustomerDurationMinutes(minutes) || formatDurationMinutes(minutes);
    }
  }
  const activityName = customerActivityName(formatCustomerDurationText(name)).toLowerCase();
  const matching = payload.itinerary?.find((segment) => {
    const label = customerActivityName(formatCustomerDurationText(segment.label)).toLowerCase();
    return label === activityName || label.includes(activityName) || activityName.includes(label);
  });
  if (matching?.durationMinutes && matching.durationMinutes > 0) {
    return formatDurationMinutes(matching.durationMinutes);
  }
  return null;
}

function uniqueActivityNames(payload: EventPlanPayload): string[] {
  const fromActivities = payload.activities.map((row) => customerActivityName(formatCustomerDurationText(row.name)));
  if (fromActivities.length > 0) {
    return uniqueLines(fromActivities);
  }
  return uniqueLines(
    (payload.lineItems ?? [])
      .filter((row) => classifyProductKind(row.kind) === "activity" && !isShoeLineItem(row))
      .map((row) => customerActivityName(formatCustomerDurationText(row.name))),
  );
}

function resolvedDiningLabel(payload: EventPlanPayload): string | null {
  if (payload.dining.label === DINING_PREFERENCE_LABELS.none || isUnresolvedDining(payload.dining)) {
    return null;
  }
  const label = formatCustomerDurationText(payload.dining.label).trim();
  return label || null;
}

function fallbackDiningLines(payload: EventPlanPayload): string[] {
  if (payload.dining.label === DINING_PREFERENCE_LABELS.none) {
    return ["No food included"];
  }
  if (isUnresolvedDining(payload.dining)) {
    return [UNCONFIRMED_DINING_LABEL];
  }
  const quantity = payload.dining.quantity;
  if (quantity && quantity > 1) {
    const unit = quantity === payload.guestCount ? "guests" : String(quantity);
    return unit === "guests"
      ? [`${payload.dining.label} — ${quantity} guests`]
      : [`${payload.dining.label} — ${quantity}`];
  }
  return payload.dining.label.trim() ? [payload.dining.label] : [];
}

function priceBreakdownLabel(item: EventPlanLineItem): string {
  if (isShoeLineItem(item)) {
    const base = customerActivityName(formatCustomerDurationText(item.name.replace(/\s*shoes\s*$/i, "").trim()));
    return `${base} shoes`;
  }
  if (classifyProductKind(item.kind) === "food") {
    return formatCustomerDurationText(item.name);
  }
  return customerActivityName(formatCustomerDurationText(item.name));
}

function joinEnglish(names: string[]): string {
  if (names.length <= 1) {
    return names[0] ?? "";
  }
  if (names.length === 2) {
    return `${names[0]} and ${names[1]}`;
  }
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}
