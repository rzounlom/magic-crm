import { planPayloadTotal } from "@/lib/inquiries/plan-diff";
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
 * Ensure booking/payment money matches an employee-approved (or WP) quote snapshot.
 * Prefer estimatedTotalCents; verify lineItems sum when present.
 */
export function assertApprovedQuoteAmountsConsistent(input: {
  estimatedTotalCents: number | null | undefined;
  payload: EventPlanPayload;
  /** When true, only enforce for employee-approved WP customer quotes. */
  onlyForEmployeeApprovedQuote?: boolean;
}): ApprovedQuoteAmountCheck {
  const lineItemsTotalCents = planPayloadTotal(input.payload);
  const isApprovedWpQuote = hasEmployeeApprovedMarker(input.payload);
  if (input.onlyForEmployeeApprovedQuote && !isApprovedWpQuote) {
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

  if ((input.payload.lineItems?.length ?? 0) > 0 && lineItemsTotalCents !== input.estimatedTotalCents) {
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
