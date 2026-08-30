import type { FeatureKey } from "@/types/feature-keys";

/**
 * Commercial module access is separate from employee permission.
 *
 * Entitlement: does this organization own the module?
 * Permission: may this employee use or manage it?
 *
 * This phase defines the typed boundary only. There is no runtime checker,
 * entitlement table, billing integration, or pricing-plan mapping.
 *
 * Future server entry points should call requireEntitlement(ctx, featureKey)
 * and fail closed when no active entitlement exists.
 */
export type OrganizationEntitlementReader = {
  hasEntitlement(organizationId: string, featureKey: FeatureKey): Promise<boolean>;
};
