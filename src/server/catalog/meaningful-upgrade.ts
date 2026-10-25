import { INQUIRY_AUDIENCES, PRODUCT_KINDS, PRODUCT_SCHEDULING_BEHAVIORS, type InquiryAudience } from "@/types/catalog";

export type MeaningfulUpgradeKind = "dining" | "activity_time" | "added_activity" | "space" | "inclusion";

export type MeaningfulUpgrade = {
  kind: MeaningfulUpgradeKind;
  summary: string;
};

export type UpgradeProduct = {
  id: string;
  slug?: string;
  name: string;
  kind: string;
  audience?: string | null;
  fulfillmentGroup?: string | null;
  durationMinutes?: number | null;
  schedulingBehavior?: string | null;
};

const NOISE_TOKENS =
  /\b(r\d+|regular|unlimited|exclusive|rental|area|play|combination|minutes?|hours?|hour|\d+\s*h|\d+)\b/g;

export function experienceIdentity(product: Pick<UpgradeProduct, "name" | "slug" | "fulfillmentGroup">): string {
  if (product.fulfillmentGroup?.trim()) {
    return product.fulfillmentGroup.trim().toLowerCase();
  }
  return normalizeExperienceKey(product.name) || normalizeExperienceKey(product.slug ?? "");
}

function normalizeExperienceKey(value: string): string {
  return value
    .toLowerCase()
    .replace(NOISE_TOKENS, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function scheduledDurationMinutes(product: UpgradeProduct): number {
  if (product.kind === PRODUCT_KINDS.RENTAL || product.kind === PRODUCT_KINDS.ADD_ON) {
    return 0;
  }
  if (
    product.schedulingBehavior === PRODUCT_SCHEDULING_BEHAVIORS.NON_SCHEDULED ||
    product.schedulingBehavior === PRODUCT_SCHEDULING_BEHAVIORS.SPACE_WINDOW
  ) {
    return 0;
  }
  return typeof product.durationMinutes === "number" && product.durationMinutes > 0 ? product.durationMinutes : 0;
}

export function remainingScheduledMinutes(input: {
  requestedMinutes: number | null | undefined;
  reservedMinutes: number;
  chosen: UpgradeProduct[];
}): number | null {
  if (!input.requestedMinutes || input.requestedMinutes <= 0) {
    return null;
  }
  const used = input.chosen.reduce((sum, row) => sum + scheduledDurationMinutes(row), 0);
  return input.requestedMinutes - input.reservedMinutes - used;
}

export function fitsRemainingMinutes(product: UpgradeProduct, remaining: number | null): boolean {
  if (remaining == null) {
    return true;
  }
  const need = scheduledDurationMinutes(product);
  return need <= 0 || need <= remaining;
}

/**
 * Adult-restricted products are not auto-added to youth or mixed events.
 * Explicit customer selections still win.
 */
export function autoAddAudienceAllowed(
  productAudience: string | null | undefined,
  inquiryAudience: InquiryAudience,
  explicit: boolean,
): boolean {
  if (explicit) {
    return true;
  }
  if (productAudience === INQUIRY_AUDIENCES.ADULTS && inquiryAudience !== INQUIRY_AUDIENCES.ADULTS) {
    return false;
  }
  return true;
}

export function hasOverlappingExperience(existing: UpgradeProduct[], candidate: UpgradeProduct): boolean {
  const key = experienceIdentity(candidate);
  if (!key) {
    return false;
  }
  return existing.some((row) => experienceIdentity(row) === key);
}

export function evaluateMeaningfulUpgrades(
  previous: UpgradeProduct[] | null,
  current: UpgradeProduct[],
): MeaningfulUpgrade[] {
  if (!previous) {
    return [];
  }
  const upgrades: MeaningfulUpgrade[] = [];
  const previousFood = previous.find((row) => row.kind === PRODUCT_KINDS.FOOD) ?? null;
  const currentFood = current.find((row) => row.kind === PRODUCT_KINDS.FOOD) ?? null;
  if (previousFood && currentFood && previousFood.slug !== currentFood.slug && previousFood.name !== currentFood.name) {
    upgrades.push({
      kind: "dining",
      summary: `Upgraded from ${previousFood.name} to ${currentFood.name}`,
    });
  }

  const previousByGroup = new Map(
    previous.filter((row) => row.fulfillmentGroup).map((row) => [row.fulfillmentGroup as string, row]),
  );
  for (const row of current) {
    if (!row.fulfillmentGroup) {
      continue;
    }
    const prior = previousByGroup.get(row.fulfillmentGroup);
    if (!prior || prior.slug === row.slug) {
      continue;
    }
    const longer =
      scheduledDurationMinutes(row) > scheduledDurationMinutes(prior)
        ? "activity_time"
        : "added_activity";
    upgrades.push({
      kind: longer,
      summary:
        scheduledDurationMinutes(row) > scheduledDurationMinutes(prior)
          ? `More time in ${row.name}`
          : `Upgrades ${prior.name} to ${row.name}`,
    });
  }

  const previousIds = new Set(previous.map((row) => row.id));
  const previousSpaces = previous.filter((row) => row.kind === PRODUCT_KINDS.RENTAL);
  const currentSpace = current.find((row) => row.kind === PRODUCT_KINDS.RENTAL) ?? null;
  for (const row of current) {
    if (previousIds.has(row.id) || row.kind === PRODUCT_KINDS.FOOD) {
      continue;
    }
    if (row.kind === PRODUCT_KINDS.RENTAL) {
      continue;
    }
    if (hasOverlappingExperience(previous, row)) {
      continue;
    }
    upgrades.push({
      kind: row.kind === PRODUCT_KINDS.ADD_ON ? "inclusion" : "added_activity",
      summary: `Adds ${row.name}`,
    });
  }
  if (currentSpace && !previousSpaces.some((row) => row.id === currentSpace.id)) {
    upgrades.push({
      kind: "space",
      summary: `Includes private event space (${currentSpace.name})`,
    });
  }
  return upgrades;
}
