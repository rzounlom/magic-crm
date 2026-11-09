import { describe, expect, it } from "vitest";

import { assertApprovedQuoteAmountsConsistent } from "@/lib/inquiries/approved-quote-amounts";
import { depositPercentFromTenant, depositRequiredCents } from "@/server/catalog/pricing";
import { lineItemsFromPayload } from "@/server/services/pending-booking-service";
import type { EventPlanPayload } from "@/types/event-planner";

describe("quote → booking → payment amount preservation", () => {
  it("keeps approved line-item cents into booking lines and deposit math", () => {
    const payload = {
      version: 1,
      guestCount: 10,
      durationMinutes: 180,
      eventDate: "2099-07-01",
      startTime: "14:00",
      activities: [{ name: "stale", durationMinutes: 60, priceCents: 1 }],
      spaces: [],
      dining: { label: null, priceCents: 0 },
      lineItems: [
        {
          slug: "bowling",
          name: "Bowling",
          quantity: 2,
          unitPriceCents: 4500,
          totalCents: 9000,
          kind: "WP_LINE",
          productId: "wp-bowling",
        },
        {
          slug: "tax",
          name: "Sales tax",
          quantity: 1,
          unitPriceCents: 630,
          totalCents: 630,
          kind: "TAX",
          productId: "",
        },
      ],
      employeeApprovedQuote: {
        marker: "employee_approved_wordpress_quote",
        approvedAt: "2099-01-01T00:00:00.000Z",
        availabilityConfirmed: true,
        availabilityNote: "ok",
      },
    } as unknown as EventPlanPayload;

    const check = assertApprovedQuoteAmountsConsistent({
      estimatedTotalCents: 9630,
      payload,
      onlyForEmployeeApprovedQuote: true,
    });
    expect(check.ok).toBe(true);
    if (!check.ok) {
      throw new Error(check.error);
    }

    const items = lineItemsFromPayload(payload);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      name: "Bowling",
      quantity: 2,
      unitPriceCents: 4500,
      totalCents: 9000,
    });
    expect(items.reduce((sum, row) => sum + row.totalCents, 0)).toBe(check.totalCents);

    const depositPercent = depositPercentFromTenant(50);
    expect(depositRequiredCents(check.totalCents, depositPercent)).toBe(4815);
  });
});
