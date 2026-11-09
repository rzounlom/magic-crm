import { describe, expect, it } from "vitest";

import {
  WP_CUSTOMER_QUOTE_DELIVERY_CODES,
  WP_QUOTE_DRAFT_SOURCE,
  applyWpStaffQuoteEdits,
  buildWpStaffQuoteDraft,
  readEmployeeApprovedQuoteMarker,
  recommendWpParity,
  resolveWpCustomerQuoteDeliveryPolicy,
  sampleWpInquiry,
  snapshotWpParityResult,
  toCustomerFacingWpQuotePayload,
} from "@/server/event-planner/wp-parity";

describe("resolveWpCustomerQuoteDeliveryPolicy", () => {
  it("allows delivery only for tenant_live ready pricing", () => {
    expect(
      resolveWpCustomerQuoteDeliveryPolicy({
        status: "ready",
        pricingSource: "tenant_live",
      }),
    ).toMatchObject({
      canPreview: true,
      canApprove: true,
      canDeliver: true,
      code: WP_CUSTOMER_QUOTE_DELIVERY_CODES.TENANT_LIVE_VERIFIED,
    });
  });

  it("allows approve/preview but blocks delivery for approved_plugin_baseline", () => {
    const policy = resolveWpCustomerQuoteDeliveryPolicy({
      status: "ready",
      pricingSource: "approved_plugin_baseline",
    });
    expect(policy.canPreview).toBe(true);
    expect(policy.canApprove).toBe(true);
    expect(policy.canDeliver).toBe(false);
    expect(policy.code).toBe(
      WP_CUSTOMER_QUOTE_DELIVERY_CODES.APPROVED_BASELINE_PENDING_OPERATIONAL_VERIFICATION,
    );
  });

  it("blocks approve/deliver for plugin_defaults", () => {
    const policy = resolveWpCustomerQuoteDeliveryPolicy({
      status: "ready",
      pricingSource: "plugin_defaults",
    });
    expect(policy.canApprove).toBe(false);
    expect(policy.canDeliver).toBe(false);
  });
});

describe("WP staff quote edits and customer payload", () => {
  function buildDraft() {
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
      throw new Error("expected valid recommendation");
    }
    const snapshot = snapshotWpParityResult(result, {
      pricingSource: "approved_plugin_baseline",
    });
    expect(snapshot.valid).toBe(true);
    if (!snapshot.valid) {
      throw new Error("expected valid snapshot");
    }
    const built = buildWpStaffQuoteDraft({
      organizationId: "org_test",
      snapshot,
    });
    expect(built.ok).toBe(true);
    if (!built.ok) {
      throw new Error(built.error);
    }
    return built;
  }

  it("applies explicit staff edits without catalog substitution and clears WP parity claim", () => {
    const built = buildDraft();
    const originalTotal = built.draft.estimatedTotalCents;
    const lineItems = (built.draft.payload.lineItems ?? []).map((row) => ({
      slug: row.slug,
      name: row.name,
      quantity: row.quantity,
      unitPriceCents: row.unitPriceCents,
      kind: row.kind,
    }));
    expect(lineItems.length).toBeGreaterThan(0);
    lineItems[0] = {
      ...lineItems[0]!,
      unitPriceCents: lineItems[0]!.unitPriceCents + 100,
    };

    const edited = applyWpStaffQuoteEdits({
      payload: built.draft.payload,
      guestCount: built.draft.guestCount,
      eventDate: built.draft.payload.eventDate,
      startTime: built.draft.payload.startTime,
      durationMinutes: built.draft.durationMinutes,
      lineItems,
      editedByUserProfileId: "user_1",
      editReason: "Customer requested an add-on",
    });
    expect(edited.ok).toBe(true);
    if (!edited.ok) {
      return;
    }
    expect(edited.estimatedTotalCents).toBe(originalTotal + 100 * lineItems[0]!.quantity);
    expect(edited.payload.wpQuoteDraft?.source).toBe(WP_QUOTE_DRAFT_SOURCE);
    expect(edited.payload.wpQuoteDraft?.staffEdit?.wordpressParityExact).toBe(false);
    expect(edited.payload.wpQuoteDraft?.originalTotalCents).toBe(originalTotal);
    expect(edited.payload.wpQuoteDraft?.totalCents).toBe(edited.estimatedTotalCents);
  });

  it("strips staff-only metadata from customer-facing payload", () => {
    const built = buildDraft();
    const customer = toCustomerFacingWpQuotePayload({
      workingPayload: built.draft.payload,
      approvedAt: "2026-11-09T18:00:00.000Z",
      availabilityConfirmed: false,
      availabilityNote: "Final availability will be confirmed by our event team.",
    });
    expect(customer.wpQuoteDraft).toBeUndefined();
    expect(customer.lineItems?.length).toBe(built.draft.payload.lineItems?.length);
    expect(readEmployeeApprovedQuoteMarker(customer)?.marker).toBe(
      "employee_approved_wordpress_quote",
    );
    expect(customer.customerAvailabilityNote).toContain("Final availability will be confirmed");
    const serialized = JSON.stringify(customer);
    expect(serialized).not.toContain("catalogPriceDiscrepancies");
    expect(serialized).not.toContain("approved_plugin_baseline");
  });
});
