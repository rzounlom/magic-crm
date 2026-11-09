import {
  WP_PLUGIN_DEFAULT_ESTIMATE_LABEL,
  parseWpIntakeMessageMetadata,
  type WpPrivateCalculationMeta,
} from "@/lib/event-planner/wp-intake-contract";
import { READY_FOR_HUMAN_REASONS } from "@/lib/inquiries/ready-for-human-reason";

export { WP_PLUGIN_DEFAULT_ESTIMATE_LABEL };

export const WP_CUSTOMER_QUOTE_DELIVERY_CODES = {
  TENANT_LIVE_VERIFIED: "tenant_live_verified",
  APPROVED_BASELINE_PENDING_OPERATIONAL_VERIFICATION:
    "approved_plugin_baseline_pending_operational_verification",
  PLUGIN_DEFAULTS_BLOCKED: "plugin_defaults_blocked",
  INCOMPLETE_BLOCKED: "incomplete_blocked",
  MISSING_PRICING: "missing_pricing",
} as const;

export type WpCustomerQuoteDeliveryCode =
  (typeof WP_CUSTOMER_QUOTE_DELIVERY_CODES)[keyof typeof WP_CUSTOMER_QUOTE_DELIVERY_CODES];

/**
 * Tenant-scoped customer-quote delivery policy for WordPress private pricing.
 *
 * - `tenant_live` + ready → employee may approve and deliver.
 * - `approved_plugin_baseline` + ready → staff preview + approve allowed; delivery stays
 *   blocked until operational go-live verification promotes pricing to `tenant_live`.
 *   Never relabel baseline as `tenant_live`.
 * - plugin_defaults / incomplete → no customer approve/deliver.
 */
export type WpCustomerQuoteDeliveryPolicy = {
  canPreview: boolean;
  canApprove: boolean;
  canDeliver: boolean;
  code: WpCustomerQuoteDeliveryCode;
  message: string;
};

export function resolveWpCustomerQuoteDeliveryPolicy(
  calc: Pick<WpPrivateCalculationMeta, "status" | "pricingSource"> | null | undefined,
): WpCustomerQuoteDeliveryPolicy {
  if (!calc) {
    return {
      canPreview: false,
      canApprove: false,
      canDeliver: false,
      code: WP_CUSTOMER_QUOTE_DELIVERY_CODES.MISSING_PRICING,
      message: "No WordPress private pricing is available for this inquiry.",
    };
  }
  if (calc.status === "incomplete" || calc.pricingSource === "incomplete") {
    return {
      canPreview: false,
      canApprove: false,
      canDeliver: false,
      code: WP_CUSTOMER_QUOTE_DELIVERY_CODES.INCOMPLETE_BLOCKED,
      message: "Pricing configuration is incomplete. Customer quotes cannot be approved or sent.",
    };
  }
  if (calc.pricingSource === "tenant_live" && calc.status === "ready") {
    return {
      canPreview: true,
      canApprove: true,
      canDeliver: true,
      code: WP_CUSTOMER_QUOTE_DELIVERY_CODES.TENANT_LIVE_VERIFIED,
      message: "Verified tenant_live pricing. Employee may approve and send a customer quote.",
    };
  }
  if (calc.pricingSource === "approved_plugin_baseline" && calc.status === "ready") {
    return {
      canPreview: true,
      canApprove: true,
      canDeliver: false,
      code: WP_CUSTOMER_QUOTE_DELIVERY_CODES.APPROVED_BASELINE_PENDING_OPERATIONAL_VERIFICATION,
      message:
        "Owner-approved plugin baseline allows staff preview and approval, but customer delivery stays disabled until operational price verification (tenant_live).",
    };
  }
  return {
    canPreview: true,
    canApprove: false,
    canDeliver: false,
    code: WP_CUSTOMER_QUOTE_DELIVERY_CODES.PLUGIN_DEFAULTS_BLOCKED,
    message:
      "Plugin-default pricing is staff-estimate only. Do not approve or send these totals to the customer.",
  };
}

/**
 * Plugin-default, approved-plugin-baseline, and incomplete WP private calculations must
 * never be published as customer quotes. Only `tenant_live` + `ready` may be treated as
 * verified live pricing (approved baseline still requires pre-go-live revalidation).
 */
export function isWpPrivatePricingVerifiedForCustomerQuote(
  calc: Pick<WpPrivateCalculationMeta, "status" | "pricingSource"> | null | undefined,
): boolean {
  return resolveWpCustomerQuoteDeliveryPolicy(calc).canDeliver;
}

export function isUnverifiedWpPrivatePricing(
  calc: Pick<WpPrivateCalculationMeta, "status" | "pricingSource"> | null | undefined,
): boolean {
  if (!calc) {
    return false;
  }
  return !isWpPrivatePricingVerifiedForCustomerQuote(calc);
}

/**
 * Narrow guard: customer-facing plan notification emails must not go out for WordPress
 * public intakes while private pricing is still plugin-default / incomplete / failed.
 * Catalog-based staff proposals (no auto email) remain allowed.
 */
export function shouldSuppressCustomerPlanNotificationForWpIntake(input: {
  humanHandoffReason: string | null | undefined;
  planNotificationRequested: boolean;
  privateCalculation?: Pick<WpPrivateCalculationMeta, "status" | "pricingSource"> | null;
}): { suppress: boolean; reason: string | null } {
  if (!input.planNotificationRequested) {
    return { suppress: false, reason: null };
  }
  if (input.humanHandoffReason !== READY_FOR_HUMAN_REASONS.PUBLIC_EVENT_REQUEST) {
    return { suppress: false, reason: null };
  }
  if (
    input.privateCalculation &&
    isWpPrivatePricingVerifiedForCustomerQuote(input.privateCalculation)
  ) {
    return { suppress: false, reason: null };
  }
  return {
    suppress: true,
    reason: "unverified_wp_plugin_default_pricing",
  };
}

export function wpPrivateCalculationFromMessageMetadata(
  metadata: unknown,
): WpPrivateCalculationMeta | null {
  return parseWpIntakeMessageMetadata(metadata)?.privateCalculation ?? null;
}
