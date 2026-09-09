import { notFound } from "next/navigation";

import { PublicInquiryForm } from "@/components/layout/public-inquiry-form";
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
      <PublicInquiryForm
        organizationSlug={catalog.organization.slug}
        organizationName={organizationName}
        attractions={catalog.attractions.map((item) => ({ id: item.id, name: item.name }))}
        diningOptions={catalog.diningItems.map((item) => ({ id: item.id, name: item.name }))}
      />
    </PublicInquiryView>
  );
}
