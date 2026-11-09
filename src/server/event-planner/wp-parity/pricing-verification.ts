import {
  WP_PLUGIN_DEFAULT_ESTIMATE_LABEL,
  parseWpIntakeMessageMetadata,
  type WpPrivateCalculationMeta,
} from "@/lib/event-planner/wp-intake-contract";
import { READY_FOR_HUMAN_REASONS } from "@/lib/inquiries/ready-for-human-reason";

export { WP_PLUGIN_DEFAULT_ESTIMATE_LABEL };

/**
 * Plugin-default, approved-plugin-baseline, and incomplete WP private calculations must
 * never be published as customer quotes. Only `tenant_live` + `ready` may be treated as
 * verified live pricing (approved baseline still requires pre-go-live revalidation).
 */
export function isWpPrivatePricingVerifiedForCustomerQuote(
  calc: Pick<WpPrivateCalculationMeta, "status" | "pricingSource"> | null | undefined,
): boolean {
  return calc?.pricingSource === "tenant_live" && calc.status === "ready";
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
