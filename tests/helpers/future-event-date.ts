/**
 * Deterministic future calendar dates for integration fixtures.
 * Prefer these over hardcoded ISO dates that become historical as wall-clock moves.
 *
 * Keep fixed absolute dates in unit tests that assert timezone / weekday math.
 */

/** ISO calendar date (YYYY-MM-DD) N days ahead of UTC today. */
export function futureEventDate(daysAhead = 21): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysAhead);
  return d.toISOString().slice(0, 10);
}

/** ISO calendar date for a specific weekday on or after `daysAhead` from UTC today. */
export function futureEventDateOnWeekday(
  weekday: "sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat",
  daysAhead = 21,
): string {
  const target = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"].indexOf(weekday);
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysAhead);
  while (d.getUTCDay() !== target) {
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return d.toISOString().slice(0, 10);
}
