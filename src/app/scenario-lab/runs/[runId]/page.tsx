import { ScenarioLabRunDetailView } from "@/components/layout/scenario-lab-run-detail";
import { loadScenarioLabRunPage } from "@/server/scenario-lab/load-scenario-lab-run-page";

export const dynamic = "force-dynamic";

export default async function ScenarioLabRunPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const { runId } = await params;
  const view = await loadScenarioLabRunPage(runId);
  return (
    <ScenarioLabRunDetailView
      environmentBadge={view.environmentBadge}
      databaseIdentityLabel={view.databaseIdentityLabel}
      authorizedUser={view.authorizedUser}
      trustedOrganization={view.trustedOrganization}
      detail={view.detail}
    />
  );
}
