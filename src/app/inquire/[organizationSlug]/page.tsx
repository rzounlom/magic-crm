import { notFound } from "next/navigation";

import { PublicIntakeWizard } from "@/components/layout/public-intake-wizard";
import { PublicInquiryView } from "@/components/layout/public-inquiry-view";
import { db } from "@/lib/db";
import { customerFacingOrganizationName } from "@/lib/inquiries/organization-display-name";
import { isInquiryError } from "@/server/errors";
import { listPublicPlannerCatalog } from "@/server/services/event-plan-service";

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
}: {
  params: Promise<{ organizationSlug: string }>;
}) {
  const { organizationSlug } = await params;
  const catalog = await loadPublicPlanner(organizationSlug);
  if (!catalog) {
    notFound();
  }

  const organizationName = customerFacingOrganizationName(catalog.organization.name);

  return (
    <PublicInquiryView organizationName={organizationName}>
      <PublicIntakeWizard
        organizationSlug={catalog.organization.slug}
        attractions={catalog.attractions.map((item) => ({
          id: item.id,
          name: item.name,
          description: item.shortDescription,
        }))}
      />
    </PublicInquiryView>
  );
}
