import { Badge } from "@/components/ui/badge";
import { loadScenarioLabFoundationPage } from "@/server/scenario-lab/load-scenario-lab-page";

export const dynamic = "force-dynamic";

export default async function ScenarioLabFoundationPage() {
  const view = await loadScenarioLabFoundationPage();

  return (
    <main className="mx-auto flex min-h-full max-w-3xl flex-col gap-8 px-6 py-12">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="page-title text-3xl font-semibold tracking-tight">{view.heading}</h1>
          <Badge tone="info">{view.environmentBadge}</Badge>
        </div>
        <p className="text-muted-foreground max-w-2xl text-base">{view.stagingMessage}</p>
      </header>

      <section aria-labelledby="scenario-lab-environment" className="flex flex-col gap-4">
        <h2 id="scenario-lab-environment" className="text-lg font-medium">
          Environment verification
        </h2>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <dt className="text-muted-foreground">Status</dt>
            <dd>
              <Badge tone="success">{view.environmentVerificationStatus}</Badge>
            </dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="text-muted-foreground">Database identity</dt>
            <dd className="font-medium">{view.databaseIdentityLabel}</dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="text-muted-foreground">Authorized user</dt>
            <dd className="font-medium">{view.authorizedUser}</dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="text-muted-foreground">Trusted organization</dt>
            <dd className="font-medium">{view.trustedOrganization}</dd>
          </div>
        </dl>
      </section>
    </main>
  );
}
