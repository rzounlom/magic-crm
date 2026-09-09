import { notFound } from "next/navigation";

import { PublicEventPlanView } from "@/components/layout/public-event-plan-view";
import { db } from "@/lib/db";
import { customerFacingOrganizationName } from "@/lib/inquiries/organization-display-name";
import { isInquiryError } from "@/server/errors";
import { getPublicEventPlanByToken } from "@/server/services/event-plan-service";

async function loadPublicEventPlan(token: string) {
  try {
    return await getPublicEventPlanByToken(db, token);
  } catch (error) {
    if (isInquiryError(error)) {
      return null;
    }
    throw error;
  }
}

export default async function PublicEventPlanPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const view = await loadPublicEventPlan(token);
  if (!view) {
    notFound();
  }

  return (
    <PublicEventPlanView
      organizationName={customerFacingOrganizationName(view.organizationName)}
      currency={view.currency}
      inquiry={view.inquiry}
      plans={view.plans}
      token={token}
      booking={view.booking}
    />
  );
}
