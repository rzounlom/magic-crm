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

    for (const item of EMPLOYEE_NAV_ITEMS) {
      if (item.id === "overview" || !item.permission) {
        continue;
      }
      if (await hasPermission(ctx, item.permission, db)) {
        visibleNavIds.push(item.id);
      }
    }

    try {
      publicInquiryHref = await getCurrentTenantPublicInquiryPath(ctx, db);
    } catch (error) {
      if (!(isAuthorizationError(error) || isTenantContextError(error) || isInquiryError(error))) {
        throw error;
      }
    }
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
