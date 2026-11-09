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
    expect(html).toContain("Suggested next steps");
    expect(html).toContain("Verify pricing against live venue rates");
  });

  it("labels tenant_live verified pricing with configuration revision", () => {
    const html = render({
      status: "ready",
      pricingSource: "tenant_live",
      pricingRevision: "abc123:def456",
    });
    expect(html).toContain("Calculated with tenant_live verified pricing");
    expect(html).toContain("configuration revision abc123:def456");
    expect(html).toContain("pricing source tenant_live");
  });

  it("labels approved_plugin_baseline without the unverified plugin-default estimate banner", () => {
    const html = render({
      status: "ready",
      pricingSource: "approved_plugin_baseline",
      rulesVersion: "2026-11-02",
      pricingRevision: "889a29ae88d4:approved_plugin_baseline",
    });
    expect(html).toContain("Pricing source: Generations-approved WordPress plugin baseline");
    expect(html).toContain(
      "Using Generations-approved Event Planner pricing. Final price verification required before operational go-live.",
    );
    expect(html).not.toContain("ESTIMATE — Plugin-default pricing");
    expect(html).toContain("configuration revision 889a29ae88d4:approved_plugin_baseline");
    expect(html).toContain("Do not send a final customer quote until operational go-live");
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

  it("shows itinerary and itemized estimate for a ready snapshot", () => {
    const html = render({
      status: "ready",
      pricingSource: "plugin_defaults",
      snapshot: {
        snapshot_version: 1,
        valid: true,
        dates: [
          {
            date: "2026-12-01",
            recommendation: {
              name: "Custom Package",
              total_cents: 10000,
              subtotal_cents: 9300,
              tax_cents: 700,
              per_guest_cents: 250,
              dining_minutes: 30,
              required_minutes: 120,
              fits_duration: true,
              hard_review: false,
              selected_attractions: ["bowling"],
              review: ["Verify lane availability."],
              why: "Fits requested attractions.",
              items: [{ label: "Bowling", quantity: 4, subtotal_cents: 8000, tax_cents: 0 }],
              itinerary: [
                {
                  start_minute: 0,
                  end_minute: 60,
                  label: "Bowling",
                  group: "All guests",
                  start: "1:00 PM",
                  end: "2:00 PM",
                },
              ],
            },
            alternatives: [],
          },
        ],
      },
    });
    expect(html).toContain("Suggested itinerary");
    expect(html).toContain("1:00 PM – 2:00 PM");
    expect(html).toContain("Itemized estimate");
    expect(html).toContain("Bowling × 4");
    expect(html).toContain("Scheduling / capacity warnings");
    expect(html).toContain("Verify lane availability.");
  });
});
