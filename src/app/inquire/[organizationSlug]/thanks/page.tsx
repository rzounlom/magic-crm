import Link from "next/link";
import { notFound } from "next/navigation";

import { PublicCustomerShell } from "@/components/layout/public-customer-shell";
import { PUBLIC_CONTENT_CLASS } from "@/components/layout/public-content";
import { db } from "@/lib/db";
import { customerFacingOrganizationName } from "@/lib/inquiries/organization-display-name";
import { isInquiryError } from "@/server/errors";
import { resolvePublicInquiryOrganization } from "@/server/services/inquiry-service";

export const dynamic = "force-dynamic";

export default async function PublicInquireThanksPage({
  params,
}: {
  params: Promise<{ organizationSlug: string }>;
}) {
  const { organizationSlug } = await params;
  let organizationName: string;
  try {
    const organization = await resolvePublicInquiryOrganization(db, organizationSlug);
    organizationName = customerFacingOrganizationName(organization);
  } catch (error) {
    if (isInquiryError(error)) {
      notFound();
    }
    throw error;
  }

  return (
    <PublicCustomerShell organizationName={organizationName}>
      <div className="relative isolate flex-1 overflow-x-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(1200px_600px_at_50%_-10%,rgb(0_91_181/0.12),transparent_60%),linear-gradient(180deg,rgb(245_247_251)_0%,rgb(232_238_245)_100%)]"
        />
        <section className={`${PUBLIC_CONTENT_CLASS} py-10 sm:py-14`}>
          <div className="mx-auto w-full max-w-[52.5rem] rounded-[var(--radius-card)] border border-border/80 bg-surface p-6 shadow-[var(--shadow-card)] sm:p-8">
            <p className="text-[length:var(--text-label)] font-semibold tracking-[0.08em] text-primary uppercase">
              {organizationName}
            </p>
            <h1 className="page-title mt-2 text-[1.875rem] sm:text-[2.125rem]">Thank you, we’re on it!</h1>
            <p className="mt-3 text-sm text-muted-foreground sm:text-[length:var(--text-body)]">
              Thank you for considering {organizationName} for your upcoming event. We’re glad you reached
              out and look forward to helping you bring it together.
            </p>
            <h2 className="mt-8 text-lg font-semibold text-foreground">What happens next?</h2>
            <p className="mt-2 text-sm text-muted-foreground sm:text-base">
              Our Events Team will personally review your inquiry and put together options that fit your
              group and what you have in mind. We’ll be in touch soon with our recommendations. This inquiry
              does not reserve a date or confirm pricing.
            </p>
            <p className="mt-8">
              <Link
                href={`/inquire/${organizationSlug}`}
                className="text-sm font-semibold text-primary underline-offset-4 hover:underline"
              >
                Submit another request
              </Link>
            </p>
          </div>
        </section>
      </div>
    </PublicCustomerShell>
  );
}
