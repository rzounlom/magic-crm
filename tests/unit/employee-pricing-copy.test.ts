import { describe, expect, it } from "vitest";

import {
  CUSTOMER_QUOTE_DELIVERY_UNAVAILABLE_MESSAGE,
  employeeCatalogDiscrepancyLabel,
  employeePricingSourceDetail,
  employeePricingSourceLabel,
} from "@/lib/event-planner/employee-pricing-copy";

describe("employee pricing copy", () => {
  it("keeps delivery restriction payment-neutral and non-sending", () => {
    expect(CUSTOMER_QUOTE_DELIVERY_UNAVAILABLE_MESSAGE).toContain(
      "Customer quote delivery is unavailable until live pricing is verified",
    );
    expect(CUSTOMER_QUOTE_DELIVERY_UNAVAILABLE_MESSAGE).toContain("approval does not send it");
    expect(CUSTOMER_QUOTE_DELIVERY_UNAVAILABLE_MESSAGE.toLowerCase()).not.toContain("unpaid");
  });

  it("humanizes known catalog discrepancy keys", () => {
    expect(employeeCatalogDiscrepancyLabel("food.salad", "salad-pan")).toBe("Salad pan");
    expect(employeeCatalogDiscrepancyLabel("rooms.lower_extra", "x")).toBe("Lower room extra hour");
    expect(employeeCatalogDiscrepancyLabel("unknown.key", "bowling-shoes")).toBe("Bowling Shoes");
  });

  it("labels approved baseline without claiming live parity", () => {
    expect(employeePricingSourceLabel("approved_plugin_baseline")).toBe(
      "Approved Event Planner catalog",
    );
    expect(employeePricingSourceDetail("approved_plugin_baseline")).toContain(
      "Final live venue price verification is still required",
    );
  });
});
