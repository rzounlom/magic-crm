import { ScenarioLabDashboard } from "@/components/layout/scenario-lab-dashboard";
import { loadScenarioLabDashboardPage } from "@/server/scenario-lab/load-scenario-lab-page";

export const dynamic = "force-dynamic";

export default async function ScenarioLabPage() {
  const view = await loadScenarioLabDashboardPage();
  return <ScenarioLabDashboard view={view} />;
}
