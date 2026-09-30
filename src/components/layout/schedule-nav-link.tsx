import { ModuleNavLink } from "@/components/ui/module-nav-link";

import { db } from "@/lib/db";
import { isAuthorizationError, isTenantContextError } from "@/server/errors";
import { getRequestContext } from "@/server/get-request-context";
import { hasPermission } from "@/server/policies/require-permission";
import { PERMISSIONS } from "@/types/permissions";

export async function ScheduleNavLink() {
  try {
    const ctx = await getRequestContext();
    if (!(await hasPermission(ctx, PERMISSIONS.CALENDAR_VIEW, db))) {
      return null;
    }
  } catch (error) {
    if (isAuthorizationError(error) || isTenantContextError(error)) {
      return null;
    }
    throw error;
  }

  return (
    <ModuleNavLink href="/app/schedule">Schedule</ModuleNavLink>
  );
}
