export function dollarsToCents(dollars: number): number {
  return Math.round(dollars * 100);
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
