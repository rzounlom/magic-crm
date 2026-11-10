import { describe, expect, it } from "vitest";

import { assertApprovedQuoteAmountsConsistent } from "@/lib/inquiries/approved-quote-amounts";
import { depositPercentFromTenant, depositRequiredCents } from "@/server/catalog/pricing";
import {
  WP_KNOWN_CATALOG_DISCREPANCIES,
  WP_QUOTE_DRAFT_SOURCE,
  applyWpStaffQuoteEdits,
  buildWpStaffQuoteDraft,
} from "@/server/event-planner/wp-parity/quote-draft";
import {
  WP_KNOWN_PRICE_DISCREPANCY_TREATMENTS,
  WP_UNMAPPED_COMPONENT_TREATMENTS,
  treatmentForWpKey,
} from "@/server/event-planner/wp-parity/component-classification";
import { buildPluginDefaultsPricingExport } from "@/server/event-planner/wp-parity/pricing-export";
import { reconcileWpExportAgainstMagicCrmCatalog } from "@/server/event-planner/wp-parity/reconcile-catalog";
import { lineItemsFromPayload } from "@/server/services/pending-booking-service";
import type { WpIntakeAnswers } from "@/lib/event-planner/wp-intake-contract";
import { calculatePrivateWpRecommendation } from "@/server/event-planner/wp-parity/from-intake";
import type { EventPlanPayload } from "@/types/event-planner";
import { readFileSync } from "node:fs";
import path from "node:path";

function saladDiscrepancyPayload(): EventPlanPayload {
  return {
    version: 1,
    guestCount: 12,
    durationMinutes: 120,
    eventDate: "2099-07-15",
    startTime: "14:00",
    activities: [{ name: "Bowling", durationMinutes: 60, priceCents: 0 }],
    spaces: [],
    dining: { label: null, priceCents: 0 },
    lineItems: [
      {
        productId: "",
        slug: "salad-pan",
        name: "Salad pan",
        quantity: 2,
        unitPriceCents: 2499,
        totalCents: 4998,
        kind: "WP_LINE",
      },
      {
        productId: "",
        slug: "wp-tax-fb",
        name: "Food & beverage tax (7%)",
        quantity: 1,
        unitPriceCents: 350,
        totalCents: 350,
        kind: "TAX",
      },
    ],
    wpQuoteDraft: {
      source: WP_QUOTE_DRAFT_SOURCE,
      pricingSource: "approved_plugin_baseline",
      rulesVersion: "test",
      pricingRevision: "test",
      calculatedAt: "2099-01-01T00:00:00.000Z",
      planName: "Salad discrepancy",
      planDate: "2099-07-15",
      originalSubtotalCents: 4998,
      originalTaxCents: 350,
      originalTotalCents: 5348,
      subtotalCents: 4998,
      taxCents: 350,
      totalCents: 5348,
      warnings: [],
      catalogPriceDiscrepancies: [
        {
          wpKey: "food.salad",
          productSlug: "salad-pan",
          wpCents: 2499,
          magicCatalogCents: 1999,
          note: "WP wins",
        },
      ],
      selectedAttractions: ["bowling"],
      exclusiveRooms: [],
      pricingOnlyRoomAdjustments: [],
      unpriced: false,
      hardReview: false,
    },
    employeeApprovedQuote: {
      marker: "employee_approved_wordpress_quote",
      approvedAt: "2099-01-02T00:00:00.000Z",
      availabilityConfirmed: true,
      availabilityNote: "ok",
    },
  } as unknown as EventPlanPayload;
}

describe("Phase 9B financial lifecycle", () => {
  it("documents known WP vs catalog discrepancies without inventing merges", () => {
    expect(WP_KNOWN_CATALOG_DISCREPANCIES).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ wpKey: "food.salad", wpCents: 2499, magicCatalogCents: 1999 }),
        expect.objectContaining({
          wpKey: "rooms.lower_extra",
          wpCents: 7500,
          magicCatalogCents: 5000,
        }),
      ]),
    );
    expect(WP_KNOWN_PRICE_DISCREPANCY_TREATMENTS["food.salad"]?.wpCents).toBe(2499);
    expect(WP_KNOWN_PRICE_DISCREPANCY_TREATMENTS["rooms.lower_extra"]?.classification).toBe(
      "pricing_only_adjustment",
    );
  });

  it("classifies every currently unmapped WP key", () => {
    const catalogPath = path.join(
      process.cwd(),
      "scripts/data/generations-booking/booking-catalog.json",
    );
    const products = (
      JSON.parse(readFileSync(catalogPath, "utf8")) as {
        products: Parameters<typeof reconcileWpExportAgainstMagicCrmCatalog>[0]["products"];
      }
    ).products;
    const report = reconcileWpExportAgainstMagicCrmCatalog({
      export: buildPluginDefaultsPricingExport(),
      products,
    });
    for (const key of report.unmappedWpKeys) {
      expect(WP_UNMAPPED_COMPONENT_TREATMENTS[key] ?? treatmentForWpKey(key)).toBeTruthy();
    }
    expect(report.summary.differentCount).toBe(2);
  });

  it("preserves WP salad cents through booking lines and deposit when catalog differs", () => {
    const payload = saladDiscrepancyPayload();
    const check = assertApprovedQuoteAmountsConsistent({
      estimatedTotalCents: 5348,
      payload,
      onlyForEmployeeApprovedQuote: true,
    });
    expect(check.ok).toBe(true);
    if (!check.ok) {
      throw new Error(check.error);
    }
    const items = lineItemsFromPayload(payload);
    expect(items.find((row) => row.name === "Salad pan")?.unitPriceCents).toBe(2499);
    expect(items.reduce((sum, row) => sum + row.totalCents, 0)).toBe(5348);
    // Catalog 1999 must not appear on booking lines.
    expect(items.every((row) => row.unitPriceCents !== 1999)).toBe(true);
    expect(depositRequiredCents(check.totalCents, depositPercentFromTenant(50))).toBe(2674);
  });

  it("keeps staff-edited WP unit prices (no catalog fallback) and recomputes totals", () => {
    const payload = saladDiscrepancyPayload();
    delete (payload as { employeeApprovedQuote?: unknown }).employeeApprovedQuote;
    const edited = applyWpStaffQuoteEdits({
      payload,
      guestCount: 12,
      eventDate: "2099-07-15",
      startTime: "14:00",
      durationMinutes: 120,
      lineItems: [
        {
          slug: "salad-pan",
          name: "Salad pan",
          quantity: 2,
          unitPriceCents: 2600,
          kind: "WP_LINE",
        },
        {
          slug: "wp-tax-fb",
          name: "Food & beverage tax (7%)",
          quantity: 1,
          unitPriceCents: 364,
          kind: "TAX",
        },
      ],
      editedByUserProfileId: "user_test",
      editReason: "Owner-approved salad adjustment",
    });
    expect(edited.ok).toBe(true);
    if (!edited.ok) {
      throw new Error(edited.error);
    }
    expect(edited.estimatedTotalCents).toBe(2 * 2600 + 364);
    expect(edited.payload.lineItems?.[0]?.unitPriceCents).toBe(2600);
    const check = assertApprovedQuoteAmountsConsistent({
      estimatedTotalCents: edited.estimatedTotalCents,
      payload: edited.payload,
      onlyForEmployeeApprovedQuote: true,
    });
    expect(check.ok).toBe(true);
  });

  it("builds a WP staff draft whose total matches the private calculation (not MagiCRM catalog)", () => {
    const answers: WpIntakeAnswers = {
      firstName: "Ada",
      lastName: "Lovelace",
      company: "Analytical Engines",
      phone: "5745550100",
      email: "ada@example.com",
      eventType: "Birthday",
      dates: ["2099-08-15"],
      time: "14:00",
      adults: 10,
      children: 0,
      duration: "2 hours",
      otherHours: null,
      minutes: 120,
      attractions: {
        bowling: "yes",
        axe: "no",
        laser: "no",
        golf: "no",
        climbing: "no",
        arcade: "no",
      },
      food: "no",
      privateRoom: "no",
      craft: "no",
      hasBudget: "no",
      budgetCents: null,
      description: "Birthday",
      comments: null,
      referral: "Friend",
    };
    const privateCalc = calculatePrivateWpRecommendation(answers, { bowling_hours: 1 });
    expect(privateCalc.status).toBe("ready");
    if (privateCalc.status !== "ready" || !privateCalc.snapshot || privateCalc.snapshot.valid !== true) {
      throw new Error(`expected ready private calc, got ${privateCalc.status}: ${privateCalc.errorMessage}`);
    }
    const draft = buildWpStaffQuoteDraft({
      organizationId: "org_test",
      snapshot: privateCalc.snapshot,
      magicCatalogCentsBySlug: {
        "salad-pan": 1999,
        "lower-event-room": 5000,
      },
    });
    expect(draft.ok).toBe(true);
    if (!draft.ok) {
      throw new Error(draft.error);
    }
    const planTotal = privateCalc.snapshot.dates[0]?.recommendation.total_cents;
    expect(draft.draft.estimatedTotalCents).toBe(planTotal);
    expect(draft.provenance.pricingSource).toBe("plugin_defaults");
  });
});
