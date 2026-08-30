import { describe, expect, it } from "vitest";

import { FEATURE_KEYS, isFeatureKey, type FeatureKey } from "@/types/feature-keys";

const EXPECTED_KEYS = [
  "CORE_CRM",
  "EVENT_BOOKING",
  "ONLINE_BOOKING",
  "POS",
  "OPERATIONS",
  "COMMUNICATIONS",
  "AI_SALES_AGENT",
  "ADVANCED_ANALYTICS",
  "MULTI_LOCATION",
  "SSO",
] as const satisfies readonly FeatureKey[];

describe("FEATURE_KEYS", () => {
  it("exposes the stable commercial module identifiers", () => {
    expect(FEATURE_KEYS).toEqual(EXPECTED_KEYS);
  });

  it("does not encode pricing-plan names", () => {
    const planNames = ["STARTER", "PRO", "PREMIUM", "ENTERPRISE"];
    expect(FEATURE_KEYS.some((key) => planNames.includes(key))).toBe(false);
  });

  it("narrows unknown strings through isFeatureKey", () => {
    expect(isFeatureKey("AI_SALES_AGENT")).toBe(true);
    expect(isFeatureKey("PREMIUM")).toBe(false);
  });
});
