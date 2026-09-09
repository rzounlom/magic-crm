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

export function perPersonCents(totalCents: number, guestCount: number): number | null {
  if (!guestCount || guestCount < 1) {
    return null;
  }
  return Math.round(totalCents / guestCount);
}
