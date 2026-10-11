import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PriceBreakdown } from "@/components/ui/price-breakdown";

describe("PriceBreakdown", () => {
  it("renders authoritative totals and deposit preview without inventing tax", () => {
    const html = renderToStaticMarkup(
      <PriceBreakdown
        currency="USD"
        totalCents={500000}
        pricingComplete
        guestCount={24}
        perPersonCents={20833}
        depositPreviewCents={150000}
        depositPreviewPercent={30}
      />,
    );
    expect(html).toContain("data-price-breakdown");
    expect(html).toContain('data-pricing-resolved="true"');
    expect(html).toContain("$5,000");
    expect(html).toContain("Estimated total");
    expect(html).toContain("Estimated deposit");
    expect(html).toContain("Payment is not collected yet");
    expect(html).not.toContain("Tax");
    expect(html).not.toContain("payment received");
  });

  it("handles unresolved pricing honestly", () => {
    const html = renderToStaticMarkup(
      <PriceBreakdown currency="USD" totalCents={null} pricingComplete={false} />,
    );
    expect(html).toContain("Pricing to confirm");
    expect(html).toContain('data-pricing-resolved="false"');
    expect(html).toContain("not a quote or invoice");
    expect(html).not.toContain("Estimated deposit");
  });
});
