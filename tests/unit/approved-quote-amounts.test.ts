import { describe, expect, it } from "vitest";

import { assertApprovedQuoteAmountsConsistent } from "@/lib/inquiries/approved-quote-amounts";
import { planPayloadTotal } from "@/lib/inquiries/plan-diff";
import type { EventPlanPayload } from "@/types/event-planner";

function payload(partial: Record<string, unknown>): EventPlanPayload {
  return {
    version: 1,
    guestCount: 8,
    durationMinutes: 120,
    eventDate: "2099-06-01",
    startTime: "13:00",
    activities: [],
    spaces: [],
    dining: { label: null, priceCents: 0 },
    schedule: [],
    pricingComplete: true,
    ...partial,
  } as unknown as EventPlanPayload;
}

describe("approved quote amount consistency", () => {
  it("prefers lineItems for planPayloadTotal", () => {
    const row = payload({
      lineItems: [
        {
          productId: "",
          slug: "a",
          name: "A",
          quantity: 2,
          unitPriceCents: 500,
          totalCents: 1000,
          kind: "WP_LINE",
        },
      ],
      activities: [{ name: "ignored", knowledgeItemId: null, quantity: 1, priceCents: 9999 }],
    });
    expect(planPayloadTotal(row)).toBe(1000);
  });

  it("passes when estimatedTotal matches line items for approved quotes", () => {
    const row = payload({
      lineItems: [
        {
          productId: "",
          slug: "a",
          name: "A",
          quantity: 1,
          unitPriceCents: 2500,
          totalCents: 2500,
          kind: "WP_LINE",
        },
      ],
      employeeApprovedQuote: {
        marker: "employee_approved_wordpress_quote",
        approvedAt: "2099-01-01T00:00:00.000Z",
        availabilityConfirmed: true,
        availabilityNote: "ok",
      },
    });
    const check = assertApprovedQuoteAmountsConsistent({
      estimatedTotalCents: 2500,
      payload: row,
      onlyForEmployeeApprovedQuote: true,
    });
    expect(check.ok).toBe(true);
    if (check.ok) {
      expect(check.totalCents).toBe(2500);
    }
  });

  it("fails when approved quote line items diverge from estimatedTotalCents", () => {
    const row = payload({
      lineItems: [
        {
          productId: "",
          slug: "a",
          name: "A",
          quantity: 1,
          unitPriceCents: 2500,
          totalCents: 2500,
          kind: "WP_LINE",
        },
      ],
      employeeApprovedQuote: {
        marker: "employee_approved_wordpress_quote",
        approvedAt: "2099-01-01T00:00:00.000Z",
        availabilityConfirmed: true,
        availabilityNote: "ok",
      },
    });
    const check = assertApprovedQuoteAmountsConsistent({
      estimatedTotalCents: 3000,
      payload: row,
      onlyForEmployeeApprovedQuote: true,
    });
    expect(check.ok).toBe(false);
  });

  it("does not enforce mismatch for non-approved plans when onlyForEmployeeApprovedQuote", () => {
    const row = payload({
      lineItems: [
        {
          productId: "",
          slug: "a",
          name: "A",
          quantity: 1,
          unitPriceCents: 100,
          totalCents: 100,
          kind: "WP_LINE",
        },
      ],
    });
    const check = assertApprovedQuoteAmountsConsistent({
      estimatedTotalCents: 999,
      payload: row,
      onlyForEmployeeApprovedQuote: true,
    });
    expect(check.ok).toBe(true);
  });
});
