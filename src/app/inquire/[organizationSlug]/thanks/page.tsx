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
    organizationName = customerFacingOrganizationName(organization.name);
  } catch (error) {
    if (isInquiryError(error)) {
      notFound();
    }
    throw error;
  }

  return (
    <PublicCustomerShell organizationName={organizationName}>
      <section className={`${PUBLIC_CONTENT_CLASS} py-10 sm:py-14`}>
        <p className="page-eyebrow">{organizationName}</p>
        <h1 className="page-title mt-2 text-[1.75rem] sm:text-[length:var(--text-display)]">
          Thank you, we’re on it!
        </h1>
        <p className="page-description mt-3 max-w-2xl">
          Thank you for considering {organizationName} for your upcoming event. We’re glad you reached out
          and look forward to helping you bring it together.
        </p>
        <h2 className="mt-8 text-lg font-semibold text-foreground">What happens next?</h2>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground sm:text-base">
          Our Events Team will personally review your inquiry and put together options that fit your group
          and what you have in mind. We’ll be in touch soon with our recommendations. This inquiry does not
          reserve a date or confirm pricing.
        </p>
        <p className="mt-8">
          <Link
            href={`/inquire/${organizationSlug}`}
            className="text-sm font-medium text-foreground underline underline-offset-4"
          >
            Submit another request
          </Link>
        </p>
      </section>
    </PublicCustomerShell>
  );
}
