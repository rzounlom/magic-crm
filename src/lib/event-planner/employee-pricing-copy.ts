/**
 * Presentation-only employee copy for WordPress pricing provenance.
 * Does not change stored pricingSource codes or delivery policy codes.
 */

/** Canonical staff-facing delivery gate (presentation). Does not change canDeliver. */
export const CUSTOMER_QUOTE_DELIVERY_UNAVAILABLE_MESSAGE =
  "Customer quote delivery is unavailable until live pricing is verified. You can prepare and approve an internal quote, but approval does not send it.";

export type EmployeePricingSourceKey =
  | "plugin_defaults"
  | "tenant_live"
  | "approved_plugin_baseline"
  | "incomplete"
  | string;

/** Humanize WP/catalog discrepancy keys for staff (display only). */
export function employeeCatalogDiscrepancyLabel(wpKey: string, productSlug: string): string {
  const known: Record<string, string> = {
    "food.salad": "Salad pan",
    "rooms.lower_extra": "Lower room extra hour",
    "rooms.upper_extra": "Upper room extra hour",
    "bowling.shoes": "Bowling shoes",
  };
  if (known[wpKey]) {
    return known[wpKey]!;
  }
  const fromSlug = productSlug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
  return fromSlug || wpKey;
}

/** Short label for status strips and summary rows. */
export function employeePricingSourceLabel(source: EmployeePricingSourceKey | null | undefined): string {
  switch (source) {
    case "tenant_live":
      return "Verified venue pricing";
    case "approved_plugin_baseline":
      return "Approved Event Planner catalog";
    case "plugin_defaults":
      return "Plugin-default estimate (unverified)";
    case "incomplete":
      return "Incomplete pricing";
    default:
      return source ? String(source) : "Unknown";
  }
}

/** Longer guidance shown near estimates and quote drafts. */
export function employeePricingSourceDetail(source: EmployeePricingSourceKey | null | undefined): string {
  switch (source) {
    case "tenant_live":
      return "Prices come from this organization’s verified WordPress pricing pack. Confirm availability and customer requirements before quoting.";
    case "approved_plugin_baseline":
      return "Pricing based on the approved Event Planner catalog. Final live venue price verification is still required before customer email delivery.";
    case "plugin_defaults":
      return "Private staff estimate only. Do not send these totals to the customer until live venue pricing is verified.";
    case "incomplete":
      return "Pricing configuration is incomplete. Customer quotes cannot be approved or sent.";
    default:
      return "Review pricing carefully before contacting the customer.";
  }
}
