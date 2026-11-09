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

  const organizationName = customerFacingOrganizationName(catalog.organization.name);
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
      <section className={`${PUBLIC_CONTENT_CLASS} py-8 sm:py-10`}>
        <header className="max-w-3xl">
          <p className="page-eyebrow">{organizationName}</p>
          <h1 className="page-title mt-2 text-[1.75rem] sm:text-[length:var(--text-display)]">
            Plan your event
          </h1>
          <p className="page-description mt-3">
            Tell us what you have in mind. Our Events Team will follow up with recommendations. Fields marked *
            are required. Submitting does not reserve a date or confirm pricing.
          </p>
        </header>
        <div className="relative mt-8 max-w-3xl">
          <PublicEventInquiryForm organizationSlug={catalog.organization.slug} />
        </div>
      </section>
    </PublicCustomerShell>
  );
}
