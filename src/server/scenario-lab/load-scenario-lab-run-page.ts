import "server-only";

import { notFound } from "next/navigation";

import { db } from "@/lib/db";
import { isScenarioLabError } from "@/server/scenario-lab/errors";
import { loadScenarioLabAccessOrNotFound } from "@/server/scenario-lab/load-scenario-lab-access";
import { getScenarioLabRunDetail } from "@/server/scenario-lab/run-service";

export async function loadScenarioLabRunPage(runId: string) {
  const access = await loadScenarioLabAccessOrNotFound();
  try {
    const detail = await getScenarioLabRunDetail(access.request, db, runId);
    return {
      environmentBadge: "TEST" as const,
      databaseIdentityLabel: access.environment.databaseLabel,
      authorizedUser: access.userDisplayName,
      trustedOrganization: access.organizationName,
      detail,
    };
  } catch (error) {
    if (isScenarioLabError(error) && error.code === "RUN_NOT_FOUND") {
      notFound();
    }
    if (isScenarioLabError(error)) {
      notFound();
    }
    throw error;
  }
}
