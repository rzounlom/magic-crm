import { notFound } from "next/navigation";

import { PublicCustomerShell } from "@/components/layout/public-customer-shell";
import { PublicIntakeWizard } from "@/components/layout/public-intake-wizard";
import { PublicInquiryView } from "@/components/layout/public-inquiry-view";
import { db } from "@/lib/db";
import type { PlannerAnswers } from "@/lib/event-planner/intake-contract";
import { customerFacingOrganizationName } from "@/lib/inquiries/organization-display-name";
import { isInquiryError } from "@/server/errors";
import { loadPublicIntakePrefillForLabToken } from "@/server/scenario-lab/run-service";
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
  searchParams,
}: {
  params: Promise<{ organizationSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { organizationSlug } = await params;
  const query = await searchParams;
  const catalog = await loadPublicPlanner(organizationSlug);
  if (!catalog) {
    notFound();
  }

  const organizationName = customerFacingOrganizationName(catalog.organization.name);
  const labTokenRaw = query.lab;
  const labToken = typeof labTokenRaw === "string" ? labTokenRaw : undefined;
  const labPrefill = labToken
    ? await loadPublicIntakePrefillForLabToken(db, organizationSlug, labToken)
    : null;

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
          initialAnswers={labPrefill?.answers as Partial<PlannerAnswers> | undefined}
          scenarioLabCorrelationToken={labPrefill?.correlationToken}
        />
      </PublicInquiryView>
    </PublicCustomerShell>
  );
}
