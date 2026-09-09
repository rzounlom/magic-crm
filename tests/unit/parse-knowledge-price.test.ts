import { describe, expect, it } from "vitest";

import { estimateKnowledgePriceCents, parseKnowledgePrice } from "@/server/event-planner/parse-knowledge-price";

describe("parseKnowledgePrice", () => {
  it("parses per-person, per-lane, and package prices from knowledge text", () => {
    expect(parseKnowledgePrice("$30/person for 1 hour")).toMatchObject({
      kind: "per_person",
      amountCents: 3000,
      complete: true,
    });
    expect(parseKnowledgePrice("$30/lane Tue-Thu or $40/lane Fri-Sun for 1 hour")).toMatchObject({
      kind: "per_resource",
      amountCents: 3000,
      unitLabel: "lane",
      complete: true,
    });
    expect(
      parseKnowledgePrice("$349.99 up to 10 guests; $34.99 each additional guest."),
    ).toMatchObject({
      kind: "package",
      amountCents: 34999,
      includedGuests: 10,
      additionalGuestCents: 3499,
      complete: true,
    });
  });

  it("does not invent a price when the text is variable", () => {
    expect(parseKnowledgePrice("Variable.")).toEqual({
      kind: "unknown",
      amountCents: null,
      complete: false,
    });
    expect(parseKnowledgePrice("Menu pricing / custom event quote.")).toMatchObject({
      complete: false,
      amountCents: null,
    });
  });

  it("estimates package extras from published additional-guest pricing", () => {
    const estimate = estimateKnowledgePriceCents({
      priceText: "$349.99 up to 10 guests; $34.99 each additional guest.",
      guestCount: 14,
    });
    expect(estimate.complete).toBe(true);
    expect(estimate.cents).toBe(34999 + 4 * 3499);
  });
});
