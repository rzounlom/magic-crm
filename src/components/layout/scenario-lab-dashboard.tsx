import Link from "next/link";
import { randomUUID } from "node:crypto";

import { Badge } from "@/components/ui/badge";
import { SecurityActionForm } from "@/components/layout/security-action-form";
import { createScenarioLabInquiryRunAction } from "@/server/actions/scenario-lab";
import type { ScenarioLabDashboardView } from "@/server/scenario-lab/load-scenario-lab-page";
import { EVENT_TYPE_OPTIONS } from "@/types/event-planner";

function formatWhen(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function ScenarioLabDashboard({ view }: { view: ScenarioLabDashboardView }) {
  const idempotencyKey = randomUUID();
  const inquiryTemplate = view.templates.find((template) => template.available);

  return (
    <main className="mx-auto flex min-h-full max-w-5xl flex-col gap-10 px-4 py-8 sm:px-6 sm:py-12">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="page-title text-3xl font-semibold tracking-tight sm:text-4xl">{view.heading}</h1>
          <Badge tone="info">{view.environmentBadge}</Badge>
        </div>
        <p className="text-muted-foreground max-w-2xl text-base">
          Stage realistic inquiries through the real MagicCRM intake pathway in this isolated TEST
          environment.
        </p>
      </header>

      <section aria-labelledby="lab-env" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <h2 id="lab-env" className="sr-only">
          Environment
        </h2>
        <div className="flex flex-col gap-1">
          <p className="text-muted-foreground text-sm">Verification</p>
          <Badge tone="success">{view.environmentVerificationStatus}</Badge>
        </div>
        <div className="flex flex-col gap-1">
          <p className="text-muted-foreground text-sm">Database identity</p>
          <p className="font-medium">{view.databaseIdentityLabel}</p>
        </div>
        <div className="flex flex-col gap-1">
          <p className="text-muted-foreground text-sm">Operator</p>
          <p className="font-medium">{view.authorizedUser}</p>
        </div>
        <div className="flex flex-col gap-1">
          <p className="text-muted-foreground text-sm">Trusted organization</p>
          <p className="font-medium">{view.trustedOrganization}</p>
        </div>
      </section>

      {!view.venueReady ? (
        <section
          aria-labelledby="lab-venue-setup"
          className="rounded-[var(--radius-card)] border border-warning/40 bg-warning/10 px-4 py-4"
        >
          <h2 id="lab-venue-setup" className="text-lg font-medium">
            Venue setup required
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Inquiry staging uses the real public planner. Complete these TEST venue requirements
            before creating a run:
          </p>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
            {view.venueRequirements.map((requirement) => (
              <li key={requirement}>{requirement}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="lab-templates" className="flex flex-col gap-4">
        <h2 id="lab-templates" className="text-xl font-semibold">
          Scenario templates
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          {view.templates.map((template) => (
            <li
              key={template.key}
              className="rounded-[var(--radius-card)] border border-border bg-surface px-4 py-4"
            >
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-medium">{template.name}</h3>
                <Badge tone={template.available ? "success" : "neutral"}>{template.statusLabel}</Badge>
              </div>
              <p className="text-muted-foreground mt-2 text-sm">{template.description}</p>
            </li>
          ))}
        </ul>

        {inquiryTemplate && view.venueReady ? (
          <div className="rounded-[var(--radius-card)] border border-border bg-surface px-4 py-5">
            <h3 className="font-medium">Start: {inquiryTemplate.name}</h3>
            <p className="text-muted-foreground mt-1 text-sm">
              Creates a run with synthetic customer details, then opens the real public inquiry form.
            </p>
            <SecurityActionForm
              className="mt-4 flex flex-col gap-4"
              action={createScenarioLabInquiryRunAction}
              notice={{
                successTitle: "Scenario run ready",
                successDescription: "Open the run to continue into public intake.",
                errorTitle: "Could not create run",
              }}
            >
              <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-muted-foreground">Event type</span>
                  <select
                    name="eventType"
                    defaultValue="Birthday Party"
                    className="min-h-11 rounded-[var(--radius-control)] border border-border bg-surface px-3"
                  >
                    {EVENT_TYPE_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-muted-foreground">Party size</span>
                  <input
                    type="number"
                    name="guestCount"
                    min={1}
                    max={200}
                    defaultValue={12}
                    className="min-h-11 rounded-[var(--radius-control)] border border-border bg-surface px-3"
                  />
                </label>
              </div>
              <button
                type="submit"
                className="inline-flex min-h-11 w-full items-center justify-center rounded-[var(--radius-control)] bg-primary px-5 text-sm font-semibold text-primary-foreground sm:w-auto"
              >
                Create inquiry scenario run
              </button>
            </SecurityActionForm>
          </div>
        ) : null}
      </section>

      <section aria-labelledby="lab-runs" className="flex flex-col gap-4">
        <h2 id="lab-runs" className="text-xl font-semibold">
          Recent scenario runs
        </h2>
        {view.recentRuns.length === 0 ? (
          <p className="text-muted-foreground text-sm">No scenario runs yet.</p>
        ) : (
          <ul className="divide-y divide-border rounded-[var(--radius-card)] border border-border">
            {view.recentRuns.map((run) => (
              <li key={run.id}>
                <Link
                  href={`/scenario-lab/runs/${run.id}`}
                  className="flex flex-col gap-1 px-4 py-3 transition-colors hover:bg-muted/40 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-medium">{run.templateName}</p>
                    <p className="text-muted-foreground text-sm">{formatWhen(run.createdAt)}</p>
                  </div>
                  <Badge tone="neutral">{run.statusLabel}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
