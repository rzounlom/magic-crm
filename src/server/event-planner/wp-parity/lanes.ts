/**
 * WordPress Event Planner `Engine::lanes()` — bowling lane count from guest headcount.
 * Ported for golden parity; tenant catalog guestsPerUnit remains the MagicCRM default path.
 */
export function wpBowlingLanes(guestCount: number): number {
  const n = Math.max(0, Math.floor(guestCount));
  if (n <= 48) {
    return Math.ceil(n / 6);
  }
  if (n <= 50) {
    return 8;
  }
  return 8 * Math.floor(n / 50) + wpBowlingLanes(n % 50);
}
