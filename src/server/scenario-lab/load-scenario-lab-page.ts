import "server-only";

import { db } from "@/lib/db";
import { loadScenarioLabAccessOrNotFound } from "@/server/scenario-lab/load-scenario-lab-access";
import {
  assessTrustedVenueReadiness,
  listScenarioLabRuns,
  listScenarioLabTemplateViews,
} from "@/server/scenario-lab/run-service";

export type ScenarioLabDashboardView = {
  heading: string;
  environmentBadge: string;
  authorizedUser: string;
  trustedOrganization: string;
  databaseIdentityLabel: string;
  environmentVerificationStatus: "verified";
  venueReady: boolean;
  venueRequirements: string[];
  templates: Array<{
    key: string;
    name: string;
    description: string;
    available: boolean;
    statusLabel: string;
  }>;
  recentRuns: Array<{
    id: string;
    templateName: string;
    statusLabel: string;
    createdAt: string;
  }>;
};

export async function loadScenarioLabDashboardPage(): Promise<ScenarioLabDashboardView> {
  const access = await loadScenarioLabAccessOrNotFound();
  const [venue, recentRuns] = await Promise.all([
    assessTrustedVenueReadiness(db, access.request.organizationId),
    listScenarioLabRuns(access.request, db, 15),
  ]);

  return {
    heading: "MagicCRM Scenario Lab",
    environmentBadge: "TEST",
    authorizedUser: access.userDisplayName,
    trustedOrganization: access.organizationName,
    databaseIdentityLabel: access.environment.databaseLabel,
    environmentVerificationStatus: "verified",
    venueReady: venue.ready,
    venueRequirements: venue.requirements,
    templates: listScenarioLabTemplateViews(),
    recentRuns: recentRuns.map((run) => ({
      id: run.id,
      templateName: run.templateName,
      statusLabel: run.statusLabel,
      createdAt: run.createdAt,
    })),
  };
}
