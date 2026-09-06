import Link from "next/link";

import { db } from "@/lib/db";
import { isAuthorizationError, isTenantContextError } from "@/server/errors";
import { getRequestContext } from "@/server/get-request-context";
import { hasPermission } from "@/server/policies/require-permission";
import { PERMISSIONS } from "@/types/permissions";

export async function InquiryNavLink() {
  try {
    const ctx = await getRequestContext();
    if (!(await hasPermission(ctx, PERMISSIONS.CRM_INQUIRIES_VIEW, db))) {
      return null;
    }
  } catch (error) {
    if (isAuthorizationError(error) || isTenantContextError(error)) {
      return null;
    }
    throw error;
  }

  return (
    <Link href="/app/inquiries" className="text-sm text-primary">
      Inquiries
    </Link>
  );
}
