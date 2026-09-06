import { PublicInquiryLink } from "@/components/layout/public-inquiry-link";
import { db } from "@/lib/db";
import { isAuthorizationError, isInquiryError, isTenantContextError } from "@/server/errors";
import { getRequestContext } from "@/server/get-request-context";
import { getCurrentTenantPublicInquiryPath } from "@/server/services/inquiry-service";

export async function PublicInquiryNavLink() {
  let href: string;
  try {
    const ctx = await getRequestContext();
    href = await getCurrentTenantPublicInquiryPath(ctx, db);
  } catch (error) {
    if (isAuthorizationError(error) || isTenantContextError(error) || isInquiryError(error)) {
      return null;
    }
    throw error;
  }

  return <PublicInquiryLink href={href} />;
}
