/**
 * WordPress Event Planner `Engine::group_sizes()` / `Engine::lanes()` (3.4.0+ / 3.5.0).
 * Balanced cohort split replaces the 3.3.0 fill-first lane recursion.
 * Tenant catalog guestsPerUnit remains the MagicCRM default booking path.
 */

/** `Engine::group_sizes($n, $capacity)` — even split; leftovers differ by at most 1. */
export function wpGroupSizes(guestCount: number, capacity: number): number[] {
  const n = Math.max(0, Math.floor(guestCount));
  const cap = Math.max(1, Math.floor(capacity));
  if (n <= 0) {
    return [];
  }
  const count = Math.ceil(n / cap);
  const base = Math.floor(n / count);
  const extra = n % count;
  const sizes: number[] = [];
  for (let i = 0; i < count; i += 1) {
    sizes.push(base + (i < extra ? 1 : 0));
  }
  return sizes;
}

/** `Engine::lanes($n)` — sum lane needs across balanced 50-guest cohorts. */
export function wpBowlingLanes(guestCount: number): number {
  let lanes = 0;
  for (const size of wpGroupSizes(guestCount, 50)) {
    lanes += size > 48 ? 8 : Math.ceil(size / 6);
  }
  return lanes;
}
