import { planPayloadTotal } from "@/lib/inquiries/plan-diff";
import { readWpQuoteDraftProvenance } from "@/server/event-planner/wp-parity/quote-draft";
import type { EventPlanPayload } from "@/types/event-planner";

export type ApprovedQuoteAmountCheck =
  | {
      ok: true;
      totalCents: number;
      lineItemsTotalCents: number;
    }
  | {
      ok: false;
      error: string;
      totalCents: number | null;
      lineItemsTotalCents: number;
    };

function hasEmployeeApprovedMarker(payload: EventPlanPayload): boolean {
  return payload.employeeApprovedQuote?.marker === "employee_approved_wordpress_quote";
}

/**
 * Money authority for WordPress-derived quotes:
 * - customer-facing employee-approved marker, or
 * - staff AGENT_WORKING draft with wpQuoteDraft provenance
 *
 * MagiCRM catalog SKUs must not silently replace these cents.
 */
export function isWordpressQuoteMoneyAuthority(payload: EventPlanPayload): boolean {
  if (hasEmployeeApprovedMarker(payload)) {
    return true;
  }
  return readWpQuoteDraftProvenance(payload) != null;
}

/**
 * Ensure booking/payment money matches a WordPress quote snapshot (staff draft or
 * employee-approved customer quote). Prefer estimatedTotalCents; verify lineItems
 * sum when present. WP authorities with a positive total must retain lineItems —
 * zero-priced activity fallbacks must not collapse the booking total.
 */
export function assertApprovedQuoteAmountsConsistent(input: {
  estimatedTotalCents: number | null | undefined;
  payload: EventPlanPayload;
  /**
   * When true, only enforce for WP quote money authorities (employee-approved marker
   * or staff WP draft provenance). Non-WP catalog plans are skipped.
   */
  onlyForEmployeeApprovedQuote?: boolean;
}): ApprovedQuoteAmountCheck {
  const lineItemsTotalCents = planPayloadTotal(input.payload);
  const isWpAuthority = isWordpressQuoteMoneyAuthority(input.payload);
  if (input.onlyForEmployeeApprovedQuote && !isWpAuthority) {
    return {
      ok: true,
      totalCents: input.estimatedTotalCents ?? lineItemsTotalCents,
      lineItemsTotalCents,
    };
  }

  if (input.estimatedTotalCents == null || input.estimatedTotalCents < 0) {
    return {
      ok: false,
      error: "Approved quote is missing estimatedTotalCents.",
      totalCents: null,
      lineItemsTotalCents,
    };
  }

  const lineCount = input.payload.lineItems?.length ?? 0;
  if (isWpAuthority && input.estimatedTotalCents > 0 && lineCount === 0) {
    return {
      ok: false,
      error:
        "WordPress quote is missing lineItems. Booking cannot fall back to zero-priced activity rows.",
      totalCents: input.estimatedTotalCents,
      lineItemsTotalCents,
    };
  }

  if (lineCount > 0 && lineItemsTotalCents !== input.estimatedTotalCents) {
    return {
      ok: false,
      error: `Quote line items (${lineItemsTotalCents}) do not match estimatedTotalCents (${input.estimatedTotalCents}).`,
      totalCents: input.estimatedTotalCents,
      lineItemsTotalCents,
    };
  }

  return {
    ok: true,
    totalCents: input.estimatedTotalCents,
    lineItemsTotalCents,
  };
}
