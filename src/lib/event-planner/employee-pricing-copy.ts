/**
 * Presentation-only employee copy for WordPress pricing provenance.
 * Does not change stored pricingSource codes or delivery policy codes.
 */

export type EmployeePricingSourceKey =
  | "plugin_defaults"
  | "tenant_live"
  | "approved_plugin_baseline"
  | "incomplete"
  | string;

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
