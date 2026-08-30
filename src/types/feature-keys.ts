export const FEATURE_KEYS = [
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
] as const;

export type FeatureKey = (typeof FEATURE_KEYS)[number];

export function isFeatureKey(value: string): value is FeatureKey {
  return (FEATURE_KEYS as readonly string[]).includes(value);
}
