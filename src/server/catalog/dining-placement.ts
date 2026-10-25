export const DINING_PLACEMENTS = {
  FIRST: "first",
  LAST: "last",
  FLEXIBLE: "flexible",
  NONE: "none",
} as const;

export type DiningPlacement = (typeof DINING_PLACEMENTS)[keyof typeof DINING_PLACEMENTS];

export const DEFAULT_DINING_BLOCK_MINUTES = 60;

const PLACEMENTS = new Set<string>(Object.values(DINING_PLACEMENTS));

export function diningPlacementFromProfile(profile: {
  foodFirst?: boolean;
  diningPlacement?: string | null;
}): DiningPlacement {
  const raw = profile.diningPlacement?.trim().toLowerCase();
  if (raw && PLACEMENTS.has(raw)) {
    return raw as DiningPlacement;
  }
  return profile.foodFirst ? DINING_PLACEMENTS.FIRST : DINING_PLACEMENTS.FLEXIBLE;
}

export function diningPlacementFromFlags(foodFirst: boolean, diningPlacement?: string | null): DiningPlacement {
  return diningPlacementFromProfile({ foodFirst, diningPlacement });
}

export function diningIsSequential(placement: DiningPlacement): boolean {
  return placement === DINING_PLACEMENTS.FIRST || placement === DINING_PLACEMENTS.LAST;
}

export function diningBlockMinutes(product: { durationMinutes?: number | null }): number {
  return product.durationMinutes && product.durationMinutes > 0
    ? product.durationMinutes
    : DEFAULT_DINING_BLOCK_MINUTES;
}

export function diningSegmentLabel(name: string): string {
  return /^dining\s*:/i.test(name.trim()) ? name.trim() : `Dining: ${name.trim()}`;
}
