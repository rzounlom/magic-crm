import "server-only";

import { cache } from "react";

import { db } from "@/lib/db";
import type { EmployeeNavItemId } from "@/lib/ui/employee-navigation";
import { EMPLOYEE_NAV_ITEMS } from "@/lib/ui/employee-navigation";
import { isAuthorizationError, isInquiryError, isTenantContextError } from "@/server/errors";
import { getRequestContext } from "@/server/get-request-context";
import { hasPermission } from "@/server/policies/require-permission";
import { createLocationRepository } from "@/server/repositories/location-repository";
import { createOrganizationRepository } from "@/server/repositories/organization-repository";
import { hasScenarioLabAccess } from "@/server/scenario-lab/load-scenario-lab-access";
import { getCurrentTenantPublicInquiryPath } from "@/server/services/inquiry-service";

export type EmployeeShellChrome = {
  visibleNavIds: EmployeeNavItemId[];
  publicInquiryHref: string | null;
  organizationName: string | null;
  locationName: string | null;
};

/**
 * Trusted shell chrome: permissions + org/location from request context only.
 * Organization switch clears prior tenant via full navigation to /app (Clerk).
 * Cached per request so shell + Overview can share one resolution.
 */
export const loadEmployeeShellChrome = cache(async (): Promise<EmployeeShellChrome> => {
  const visibleNavIds: EmployeeNavItemId[] = ["overview"];
  let publicInquiryHref: string | null = null;
  let organizationName: string | null = null;
  let locationName: string | null = null;

  try {
    const ctx = await getRequestContext();
    const organization = await createOrganizationRepository(db).findById(ctx);
    organizationName = organization?.name ?? null;

    if (ctx.locationId) {
      const location = await createLocationRepository(db).findById(ctx, ctx.locationId);
      locationName = location?.name ?? null;
    }

    const permissionChecks = EMPLOYEE_NAV_ITEMS.flatMap((item) => {
      // Overview is always visible; Scenario Lab uses the composite LAB1-A gate below.
      if (item.id === "overview" || item.id === "scenarioLab" || !item.permission) {
        return [];
      }
      const permission = item.permission;
      return [
        hasPermission(ctx, permission, db).then((allowed) => (allowed ? item.id : null)),
      ];
    });

    const [permissionResults, inquiryPathResult, scenarioLabAllowed] = await Promise.all([
      Promise.all(permissionChecks),
      getCurrentTenantPublicInquiryPath(ctx, db)
        .then((href) => ({ ok: true as const, href }))
        .catch((error: unknown) => {
          if (isAuthorizationError(error) || isTenantContextError(error) || isInquiryError(error)) {
            return { ok: false as const, href: null };
          }
          throw error;
        }),
      hasScenarioLabAccess(),
    ]);

    for (const id of permissionResults) {
      if (id) {
        visibleNavIds.push(id);
      }
    }
    if (scenarioLabAllowed) {
      visibleNavIds.push("scenarioLab");
    }
    publicInquiryHref = inquiryPathResult.href;
  } catch (error) {
    if (!(isAuthorizationError(error) || isTenantContextError(error))) {
      throw error;
    }
  }

  return {
    visibleNavIds,
    publicInquiryHref,
    organizationName,
    locationName,
  };
});
