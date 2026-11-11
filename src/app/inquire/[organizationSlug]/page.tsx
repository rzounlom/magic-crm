import { notFound } from "next/navigation";

import { PublicCustomerShell } from "@/components/layout/public-customer-shell";
import { PublicEventInquiryForm } from "@/components/layout/public-event-inquiry-form";
import { PublicIntakeWizard } from "@/components/layout/public-intake-wizard";
import { PublicInquiryView } from "@/components/layout/public-inquiry-view";
import { PUBLIC_CONTENT_CLASS } from "@/components/layout/public-content";
import { db } from "@/lib/db";
import { customerFacingOrganizationName } from "@/lib/inquiries/organization-display-name";
import { isInquiryError } from "@/server/errors";
import { listPublicPlannerCatalog } from "@/server/services/event-plan-service";

export const dynamic = "force-dynamic";

async function loadPublicPlanner(organizationSlug: string) {
  try {
    return await listPublicPlannerCatalog(db, organizationSlug);
  } catch (error) {
    if (isInquiryError(error)) {
      return null;
    }
    throw error;
  }
}

export default async function PublicInquirePage({
  params,
  searchParams,
}: {
  params: Promise<{ organizationSlug: string }>;
  searchParams: Promise<{ legacy?: string }>;
}) {
  const { organizationSlug } = await params;
  const { legacy } = await searchParams;
  const catalog = await loadPublicPlanner(organizationSlug);
  if (!catalog) {
    notFound();
  }

  const organizationName = customerFacingOrganizationName(catalog.organization);
  const useLegacyWizard = legacy === "1";

  if (useLegacyWizard) {
    return (
      <PublicCustomerShell contained organizationName={organizationName}>
        <PublicInquiryView organizationName={organizationName}>
          <PublicIntakeWizard
            organizationSlug={catalog.organization.slug}
            attractions={catalog.attractions.map((item) => ({
              id: item.id,
              name: item.name,
              description: item.shortDescription,
            }))}
            attractionRequiredGuestMixes={catalog.attractionRequiredGuestMixes}
          />
        </PublicInquiryView>
      </PublicCustomerShell>
    );
  }

  return (
    <PublicCustomerShell organizationName={organizationName}>
      <div className="relative isolate flex-1 overflow-x-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(1200px_600px_at_50%_-10%,rgb(0_91_181/0.12),transparent_60%),linear-gradient(180deg,rgb(245_247_251)_0%,rgb(232_238_245)_100%)]"
        />
        <section className={`${PUBLIC_CONTENT_CLASS} py-8 sm:py-12`}>
          <div className="mx-auto w-full max-w-[52.5rem]">
            <header className="text-center sm:text-left">
              <p className="text-[length:var(--text-label)] font-semibold tracking-[0.08em] text-primary uppercase">
                {organizationName}
              </p>
              <h1 className="page-title mt-2 text-[1.875rem] sm:text-[2.125rem]">Plan your event</h1>
              <p className="mx-auto mt-3 max-w-2xl text-sm text-muted-foreground sm:mx-0 sm:text-[length:var(--text-body)]">
                Tell us what you have in mind. Our Events Team will follow up with recommendations.
                Fields marked * are required. Submitting does not reserve a date or confirm pricing.
              </p>
            </header>
            <div className="mt-8 sm:mt-10">
              <PublicEventInquiryForm organizationSlug={catalog.organization.slug} />
            </div>
          </div>
        </section>
      </div>
    </PublicCustomerShell>
  );
}
