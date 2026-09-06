import { notFound } from "next/navigation";

import { PublicInquiryForm } from "@/components/layout/public-inquiry-form";
import { PublicInquiryView } from "@/components/layout/public-inquiry-view";
import { db } from "@/lib/db";
import { customerFacingOrganizationName } from "@/lib/inquiries/organization-display-name";
import { isInquiryError } from "@/server/errors";
import { resolvePublicInquiryOrganization } from "@/server/services/inquiry-service";

async function loadPublicInquiryOrganization(organizationSlug: string) {
  try {
    return await resolvePublicInquiryOrganization(db, organizationSlug);
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
  const organization = await loadPublicInquiryOrganization(organizationSlug);
  if (!organization) {
    notFound();
  }

  const organizationName = customerFacingOrganizationName(organization.name);

  return (
    <PublicInquiryView organizationName={organizationName}>
      <PublicInquiryForm
        organizationSlug={organization.slug}
        organizationName={organizationName}
      />
    </PublicInquiryView>
  );
}
