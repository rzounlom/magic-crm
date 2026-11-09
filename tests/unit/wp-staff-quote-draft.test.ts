import { describe, expect, it } from "vitest";

import {
  WP_KNOWN_CATALOG_DISCREPANCIES,
  WP_QUOTE_DRAFT_SOURCE,
  buildWpStaffQuoteDraft,
  readWpQuoteDraftProvenance,
  recommendWpParity,
  sampleWpInquiry,
  snapshotWpParityResult,
} from "@/server/event-planner/wp-parity";

describe("buildWpStaffQuoteDraft", () => {
  it("converts a private WP snapshot into an EventPlan draft with integer-cent totals", () => {
    const inquiry = sampleWpInquiry();
    inquiry.attractions = {
      bowling: "yes",
      axe: "no",
      laser: "no",
      golf: "no",
      climbing: "no",
      arcade: "no",
    };
    inquiry.adults = 6;
    const result = recommendWpParity(inquiry, { bowling_hours: 1 });
    expect(result.valid).toBe(true);
    if (!result.valid) {
      return;
    }
    const snapshot = snapshotWpParityResult(result, {
      pricingSource: "approved_plugin_baseline",
      pricingRevision: "2026-11-02",
      calculatedAt: "2026-11-09T12:00:00.000Z",
    });
    expect(snapshot.valid).toBe(true);
    if (!snapshot.valid) {
      return;
    }

    const built = buildWpStaffQuoteDraft({
      organizationId: "org_test",
      locationId: "loc_test",
      snapshot,
      magicCatalogCentsBySlug: {
        "salad-pan": 1999,
        "lower-event-room": 5000,
      },
    });

    expect(built.ok).toBe(true);
    if (!built.ok) {
      return;
    }

    const plan = snapshot.dates[0]!.recommendation;
    expect(built.draft.estimatedTotalCents).toBe(plan.total_cents);
    expect(Number.isInteger(built.draft.estimatedTotalCents)).toBe(true);
    expect(built.draft.availabilityValidated).toBe(false);
    expect(built.draft.payload.catalogBacked).toBe(false);
    expect(built.draft.payload.lineItems?.length).toBeGreaterThan(0);
    expect(
      built.draft.payload.lineItems?.reduce((sum, row) => sum + row.totalCents, 0),
    ).toBe(plan.subtotal_cents + plan.tax_cents);
    expect(built.provenance.source).toBe(WP_QUOTE_DRAFT_SOURCE);
    expect(built.provenance.pricingSource).toBe("approved_plugin_baseline");
    expect(built.provenance.totalCents).toBe(plan.total_cents);
    expect(built.draft.payload.wpQuoteDraft?.source).toBe(WP_QUOTE_DRAFT_SOURCE);
    expect(readWpQuoteDraftProvenance(built.draft.payload)?.totalCents).toBe(plan.total_cents);
  });

  it("documents known MagiCRM catalog discrepancies without substituting MagiCRM prices", () => {
    const inquiry = sampleWpInquiry();
    inquiry.attractions = {
      bowling: "yes",
      axe: "no",
      laser: "no",
      golf: "no",
      climbing: "no",
      arcade: "no",
    };
    inquiry.food = "yes";
    inquiry.private_room = "yes";
    inquiry.adults = 10;
    const result = recommendWpParity(inquiry, { bowling_hours: 1 });
    expect(result.valid).toBe(true);
    if (!result.valid) {
      return;
    }
    const snapshot = snapshotWpParityResult(result, {
      pricingSource: "approved_plugin_baseline",
    });
    expect(snapshot.valid).toBe(true);
    if (!snapshot.valid) {
      return;
    }

    const built = buildWpStaffQuoteDraft({
      organizationId: "org_test",
      snapshot,
      magicCatalogCentsBySlug: new Map([
        ["salad-pan", 1999],
        ["lower-event-room", 5000],
      ]),
    });
    expect(built.ok).toBe(true);
    if (!built.ok) {
      return;
    }

    expect(built.draft.estimatedTotalCents).toBe(snapshot.dates[0]!.recommendation.total_cents);
    for (const known of WP_KNOWN_CATALOG_DISCREPANCIES) {
      const row = built.provenance.catalogPriceDiscrepancies.find((entry) => entry.wpKey === known.wpKey);
      expect(row).toMatchObject({
        wpKey: known.wpKey,
        productSlug: known.productSlug,
        wpCents: known.wpCents,
        magicCatalogCents: known.magicCatalogCents,
      });
      expect(row!.wpCents).not.toBe(row!.magicCatalogCents);
    }

    const saladLine = built.draft.payload.lineItems?.find((row) => /salad/i.test(row.name));
    if (saladLine) {
      expect(saladLine.unitPriceCents).toBe(2499);
      expect(saladLine.unitPriceCents).not.toBe(1999);
    }
  });

  it("rejects snapshots with no recommendation day", () => {
    const built = buildWpStaffQuoteDraft({
      organizationId: "org_test",
      snapshot: {
        snapshot_version: 1,
        valid: true,
        rules_version: "2026-11-02",
        pricing_revision: "2026-11-02",
        pricing_source: "approved_plugin_baseline",
        organization_id: null,
        calculated_at: "2026-11-09T12:00:00.000Z",
        status: "ok",
        inquiry: {
          event_type: "Corporate or Team Event",
          dates: ["2026-11-06"],
          time: "13:00",
          adults: 6,
          children: 0,
          guests: 6,
          minutes: 180,
          budget_cents: null,
          food: "no",
          private_room: "no",
          craft: "no",
          attractions: {
            bowling: "yes",
            axe: "no",
            laser: "no",
            golf: "no",
            climbing: "no",
            arcade: "no",
          },
        },
        dates: [],
      },
    });
    expect(built.ok).toBe(false);
  });
});
