import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { SecurityActionForm } from "@/components/layout/security-action-form";
import { openScenarioLabPublicIntakeAction } from "@/server/actions/scenario-lab";
import {
  SCENARIO_LAB_TIMELINE_KINDS,
  type ScenarioLabTimelineEntry,
} from "@/server/scenario-lab/constants";
import type { ScenarioLabRunDetail } from "@/server/scenario-lab/run-service";

function formatWhen(iso: string | null): string {
  if (!iso) {
    return "—";
  }
  try {
    return new Intl.DateTimeFormat("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function timelineTone(kind: ScenarioLabTimelineEntry["kind"]): "info" | "success" | "neutral" | "warning" {
  switch (kind) {
    case SCENARIO_LAB_TIMELINE_KINDS.OBSERVED_STATE:
      return "success";
    case SCENARIO_LAB_TIMELINE_KINDS.OPERATOR_ACTION:
      return "info";
    case SCENARIO_LAB_TIMELINE_KINDS.EXPECTED_FUTURE:
      return "warning";
    default:
      return "neutral";
  }
}

function timelineKindLabel(kind: ScenarioLabTimelineEntry["kind"]): string {
  switch (kind) {
    case SCENARIO_LAB_TIMELINE_KINDS.OBSERVED_STATE:
      return "Observed";
    case SCENARIO_LAB_TIMELINE_KINDS.OPERATOR_ACTION:
      return "Operator";
    case SCENARIO_LAB_TIMELINE_KINDS.EXPECTED_FUTURE:
      return "Expected";
    case SCENARIO_LAB_TIMELINE_KINDS.NOT_YET_PERFORMED:
      return "Not yet";
    default:
      return kind;
  }
}

export function ScenarioLabRunDetailView({
  environmentBadge,
  databaseIdentityLabel,
  authorizedUser,
  trustedOrganization,
  detail,
}: {
  environmentBadge: string;
  databaseIdentityLabel: string;
  authorizedUser: string;
  trustedOrganization: string;
  detail: ScenarioLabRunDetail;
}) {
  const canOpenIntake =
    detail.status === "ready" || detail.status === "running";

  return (
    <main className="mx-auto flex min-h-full max-w-4xl flex-col gap-8 px-4 py-8 sm:px-6 sm:py-12">
      <div>
        <Link href="/scenario-lab" className="text-sm font-medium text-primary underline-offset-2 hover:underline">
          ← Scenario Lab
        </Link>
      </div>

      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="page-title text-3xl font-semibold tracking-tight">{detail.templateName}</h1>
          <Badge tone="info">{environmentBadge}</Badge>
          <Badge tone="neutral">{detail.statusLabel}</Badge>
        </div>
        <p className="text-muted-foreground text-sm">
          Operator {authorizedUser} · {trustedOrganization} · {databaseIdentityLabel}
        </p>
      </header>

      <section aria-labelledby="run-meta" className="grid gap-4 sm:grid-cols-2">
        <h2 id="run-meta" className="sr-only">
          Run metadata
        </h2>
        <div>
          <p className="text-muted-foreground text-sm">Created</p>
          <p className="font-medium">{formatWhen(detail.createdAt)}</p>
        </div>
        <div>
          <p className="text-muted-foreground text-sm">Updated</p>
          <p className="font-medium">{formatWhen(detail.updatedAt)}</p>
        </div>
        <div>
          <p className="text-muted-foreground text-sm">Operator</p>
          <p className="font-medium">{detail.operatorDisplayName}</p>
        </div>
        <div>
          <p className="text-muted-foreground text-sm">Public intake opened</p>
          <p className="font-medium">{formatWhen(detail.publicIntakeOpenedAt)}</p>
        </div>
      </section>

      {detail.fixture ? (
        <section aria-labelledby="synthetic-customer" className="flex flex-col gap-3">
          <h2 id="synthetic-customer" className="text-lg font-semibold">
            Synthetic customer & event
          </h2>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Name</dt>
              <dd className="font-medium">
                {detail.fixture.firstName} {detail.fixture.lastName}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Email</dt>
              <dd className="font-medium">{detail.fixture.email}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Phone</dt>
              <dd className="font-medium">{detail.fixture.phone}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Group</dt>
              <dd className="font-medium">{detail.fixture.customerGroupName}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Event</dt>
              <dd className="font-medium">
                {detail.fixture.eventType} · {detail.fixture.guestCount} guests · {detail.fixture.eventDate}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Location</dt>
              <dd className="font-medium">{detail.fixture.locationName}</dd>
            </div>
          </dl>
        </section>
      ) : null}

      <section aria-labelledby="linked-inquiry" className="flex flex-col gap-3">
        <h2 id="linked-inquiry" className="text-lg font-semibold">
          Linked inquiry
        </h2>
        {detail.inquiry ? (
          <div className="rounded-[var(--radius-card)] border border-border px-4 py-4">
            <p className="font-medium">{detail.inquiry.customerName}</p>
            <p className="text-muted-foreground text-sm">{detail.inquiry.customerEmail}</p>
            <p className="mt-2 text-sm">
              Status: <Badge tone="info">{detail.inquiry.status}</Badge>
            </p>
            <p className="text-muted-foreground mt-1 text-sm">
              Linked at {formatWhen(detail.inquiryLinkedAt)}
            </p>
            <Link
              href={detail.inquiry.staffPath}
              className="mt-3 inline-flex text-sm font-semibold text-primary underline-offset-2 hover:underline"
            >
              Open staff inquiry workspace
            </Link>
          </div>
        ) : detail.awaitingInquirySubmission ? (
          <p className="text-muted-foreground text-sm">Awaiting inquiry submission.</p>
        ) : (
          <p className="text-muted-foreground text-sm">
            {detail.failureMessage ?? "No inquiry linked."}
          </p>
        )}
      </section>

      {canOpenIntake ? (
        <section aria-labelledby="open-intake" className="flex flex-col gap-3">
          <h2 id="open-intake" className="text-lg font-semibold">
            Public intake
          </h2>
          <p className="text-muted-foreground text-sm">
            Opens the real `/inquire` form with synthetic details prefilled. Submit there to create
            the inquiry through the production pathway.
          </p>
          <SecurityActionForm
            action={openScenarioLabPublicIntakeAction}
            notice={{
              successTitle: "Opening intake",
              successDescription: "Continue on the public inquiry form.",
              errorTitle: "Unable to open intake",
            }}
          >
            <input type="hidden" name="runId" value={detail.id} />
            <button
              type="submit"
              className="inline-flex min-h-11 items-center justify-center rounded-[var(--radius-control)] bg-primary px-5 text-sm font-semibold text-primary-foreground"
            >
              Open public inquiry form
            </button>
          </SecurityActionForm>
        </section>
      ) : null}

      <section aria-labelledby="timeline" className="flex flex-col gap-3">
        <h2 id="timeline" className="text-lg font-semibold">
          Scenario timeline
        </h2>
        <ul className="flex flex-col gap-3">
          {detail.timeline.map((entry) => (
            <li
              key={entry.id}
              className="rounded-[var(--radius-card)] border border-border px-4 py-3"
            >
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={timelineTone(entry.kind)}>{timelineKindLabel(entry.kind)}</Badge>
                <span className="text-muted-foreground text-xs">{formatWhen(entry.at)}</span>
              </div>
              <p className="mt-2 text-sm font-medium">{entry.message}</p>
            </li>
          ))}
        </ul>
        <p className="text-muted-foreground text-xs">
          Timeline distinguishes observed database state, operator actions, and expected future steps.
          Fixture creation alone is never marked as Passed.
        </p>
      </section>
    </main>
  );
}
