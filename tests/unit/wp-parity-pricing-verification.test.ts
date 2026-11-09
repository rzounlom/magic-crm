import { describe, expect, it } from "vitest";

import { READY_FOR_HUMAN_REASONS } from "@/lib/inquiries/ready-for-human-reason";
import {
  WP_PLUGIN_DEFAULT_ESTIMATE_LABEL,
  isUnverifiedWpPrivatePricing,
  isWpPrivatePricingVerifiedForCustomerQuote,
  shouldSuppressCustomerPlanNotificationForWpIntake,
} from "@/server/event-planner/wp-parity/pricing-verification";

describe("WP pricing verification guard", () => {
  it("exposes the staff estimate label", () => {
    expect(WP_PLUGIN_DEFAULT_ESTIMATE_LABEL).toBe(
      "ESTIMATE — Plugin-default pricing. Verify before sending to customer.",
    );
  });

  it("only treats tenant_live ready calculations as customer-quote verified", () => {
    expect(
      isWpPrivatePricingVerifiedForCustomerQuote({
        status: "ready",
        pricingSource: "tenant_live",
      }),
    ).toBe(true);
    expect(
      isWpPrivatePricingVerifiedForCustomerQuote({
        status: "ready",
        pricingSource: "plugin_defaults",
      }),
    ).toBe(false);
    expect(
      isWpPrivatePricingVerifiedForCustomerQuote({
        status: "ready",
        pricingSource: "approved_plugin_baseline",
      }),
    ).toBe(false);
    expect(
      isWpPrivatePricingVerifiedForCustomerQuote({
        status: "incomplete",
        pricingSource: "incomplete",
      }),
    ).toBe(false);
    expect(isUnverifiedWpPrivatePricing({ status: "ready", pricingSource: "plugin_defaults" })).toBe(
      true,
    );
  });

  it("suppresses customer plan emails for WP public intakes with unverified pricing", () => {
    expect(
      shouldSuppressCustomerPlanNotificationForWpIntake({
        humanHandoffReason: READY_FOR_HUMAN_REASONS.PUBLIC_EVENT_REQUEST,
        planNotificationRequested: true,
        privateCalculation: { status: "ready", pricingSource: "plugin_defaults" },
      }),
    ).toEqual({ suppress: true, reason: "unverified_wp_plugin_default_pricing" });

    expect(
      shouldSuppressCustomerPlanNotificationForWpIntake({
        humanHandoffReason: READY_FOR_HUMAN_REASONS.PUBLIC_EVENT_REQUEST,
        planNotificationRequested: true,
        privateCalculation: { status: "ready", pricingSource: "approved_plugin_baseline" },
      }),
    ).toEqual({ suppress: true, reason: "unverified_wp_plugin_default_pricing" });

    expect(
      shouldSuppressCustomerPlanNotificationForWpIntake({
        humanHandoffReason: READY_FOR_HUMAN_REASONS.PUBLIC_EVENT_REQUEST,
        planNotificationRequested: true,
        privateCalculation: { status: "ready", pricingSource: "tenant_live" },
      }),
    ).toEqual({ suppress: false, reason: null });

    expect(
      shouldSuppressCustomerPlanNotificationForWpIntake({
        humanHandoffReason: READY_FOR_HUMAN_REASONS.PUBLIC_EVENT_REQUEST,
        planNotificationRequested: false,
        privateCalculation: { status: "ready", pricingSource: "plugin_defaults" },
      }),
    ).toEqual({ suppress: false, reason: null });
  });
});
