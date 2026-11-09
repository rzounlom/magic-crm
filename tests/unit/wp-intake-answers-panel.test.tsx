import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { WpIntakeAnswersPanel } from "@/components/layout/wp-intake-answers-panel";
import {
  buildWpIntakeMessageMetadata,
  type WpIntakeAnswers,
  type WpPrivateCalculationMeta,
} from "@/lib/event-planner/wp-intake-contract";

const answers: WpIntakeAnswers = {
  firstName: "Ada",
  lastName: "Lovelace",
  company: "Analytical Engines",
  phone: "5745550100",
  email: "ada@example.com",
  eventType: "Birthday",
  dates: ["2026-11-06"],
  time: "13:00",
  adults: 6,
  children: 0,
  duration: "3 hours",
  otherHours: null,
  minutes: 180,
  attractions: { bowling: "yes", axe: "no", laser: "no", golf: "no", climbing: "no", arcade: "no" },
  food: "no",
  privateRoom: "no",
  craft: "no",
  hasBudget: "no",
  budgetCents: null,
  description: "Birthday",
  comments: null,
  referral: "Friend",
};

function render(calc: Partial<WpPrivateCalculationMeta>): string {
  return renderToStaticMarkup(
    <WpIntakeAnswersPanel metadata={buildWpIntakeMessageMetadata(answers, calc)} />,
  );
}

describe("WpIntakeAnswersPanel pricing source", () => {
  it("labels plugin defaults as an unverified estimate", () => {
    const html = render({ status: "ready", pricingSource: "plugin_defaults" });
    expect(html).toContain("ESTIMATE — Plugin-default pricing. Verify before sending to customer.");
    expect(html).toContain("Do not send these totals to the customer");
  });

  it("labels tenant_live verified pricing", () => {
    const html = render({ status: "ready", pricingSource: "tenant_live" });
    expect(html).toContain("Calculated with tenant_live verified pricing");
  });

  it("shows incomplete state and lists missing keys", () => {
    const html = render({
      status: "incomplete",
      pricingSource: "incomplete",
      missingKeys: ["catalog.bowling.shoes", "packages"],
    });
    expect(html).toContain("Incomplete — needs staff review");
    expect(html).toContain("catalog.bowling.shoes");
    expect(html).toContain("packages");
  });
});
