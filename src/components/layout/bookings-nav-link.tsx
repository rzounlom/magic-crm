import Link from "next/link";

import { db } from "@/lib/db";
import { isAuthorizationError, isTenantContextError } from "@/server/errors";
import { getRequestContext } from "@/server/get-request-context";
import { hasPermission } from "@/server/policies/require-permission";
import { PERMISSIONS } from "@/types/permissions";

export async function BookingsNavLink() {
  try {
    const ctx = await getRequestContext();
    if (!(await hasPermission(ctx, PERMISSIONS.EVENTS_VIEW, db))) {
      return null;
    }
  } catch (error) {
    if (isAuthorizationError(error) || isTenantContextError(error)) {
      return null;
    }
    throw error;
  }

  return (
    <Link href="/app/bookings" className="text-sm text-primary">
      Bookings
    </Link>
  );
}
