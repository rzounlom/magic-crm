export function dollarsToCents(dollars: number): number {
  return Math.round(dollars * 100);
}

/**
 * Format stored integer cents for a dollar-denominated form control (always two decimals).
 * Does not use floating-point multiplication for display of the integer cent value.
 */
export function centsToDollarInputValue(cents: number): string {
  const safe = Number.isFinite(cents) ? Math.trunc(cents) : 0;
  const negative = safe < 0;
  const absolute = Math.abs(safe);
  const dollars = Math.floor(absolute / 100);
  const remainder = absolute % 100;
  const formatted = `${dollars}.${String(remainder).padStart(2, "0")}`;
  return negative ? `-${formatted}` : formatted;
}

export type DollarInputParseResult =
  | { ok: true; cents: number }
  | { ok: false; error: string };

/**
 * Parse a dollar amount string into integer cents at the form boundary.
 * Accepts "49.99", "550", "550.0", optional leading $. Rejects >2 decimal places and non-numeric input.
 */
export function parseDollarInputToCents(raw: string): DollarInputParseResult {
  const trimmed = raw.trim().replace(/\$/g, "").replace(/,/g, "");
  if (!trimmed) {
    return { ok: false, error: "Enter a unit price." };
  }
  if (trimmed.startsWith("-")) {
    return { ok: false, error: "Unit price cannot be negative." };
  }
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) {
    return {
      ok: false,
      error: "Use a dollar amount with up to two decimal places (for example 49.99).",
    };
  }
  const [wholePart, fractionPart = ""] = trimmed.split(".");
  const whole = Number(wholePart);
  if (!Number.isSafeInteger(whole) || whole < 0) {
    return { ok: false, error: "Unit price is out of range." };
  }
  const frac = fractionPart.padEnd(2, "0").slice(0, 2);
  const centsPart = Number(frac);
  if (!Number.isInteger(centsPart) || centsPart < 0 || centsPart > 99) {
    return { ok: false, error: "Unit price is invalid." };
  }
  const cents = whole * 100 + centsPart;
  if (!Number.isSafeInteger(cents)) {
    return { ok: false, error: "Unit price is out of range." };
  }
  return { ok: true, cents };
}

export function formatMoneyFromCents(cents: number, currency = "USD"): string {
  const fractionDigits = cents % 100 === 0 ? 0 : 2;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(cents / 100);
}

/** Customer-facing deposit line. Percent comes from the tenant snapshot, never a global override. */
export function formatEstimatedDepositLine(
  cents: number,
  percent: number | null | undefined,
  currency = "USD",
): string {
  const amount = formatMoneyFromCents(cents, currency);
  const share =
    typeof percent === "number" && Number.isInteger(percent) && percent >= 0 && percent <= 100
      ? ` (${percent}%)`
      : "";
  return `Estimated deposit: ${amount}${share}. Payment is not collected yet.`;
}

export function perPersonCents(totalCents: number, guestCount: number): number | null {
  if (!guestCount || guestCount < 1) {
    return null;
  }
  return Math.round(totalCents / guestCount);
}
