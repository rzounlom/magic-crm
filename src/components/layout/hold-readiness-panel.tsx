import Link from "next/link";

import {
  AuthorizePlaceHoldHoursExceptionForm,
  RevokePlaceHoldHoursExceptionForm,
} from "@/components/layout/hold-hours-exception-form";
import { SecurityActionForm } from "@/components/layout/security-action-form";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import { formatEventLocalDate, formatEventLocalTime } from "@/lib/inquiries/tenant-datetime";
import { placeInquiryHoldAction } from "@/server/actions/resource-schedule";
import type { HoldReadinessResult } from "@/types/hold-readiness";
import { HOLD_READINESS_STATES } from "@/types/hold-readiness";

function statusTone(state: HoldReadinessResult["state"]): string {
  switch (state) {
    case HOLD_READINESS_STATES.ALREADY_HELD:
    case HOLD_READINESS_STATES.READY_WITH_EXCEPTION:
    case HOLD_READINESS_STATES.NEEDS_FINAL_VALIDATION:
      return "border-primary/25 bg-primary/5";
    case HOLD_READINESS_STATES.BLOCKED_RESOURCE_CONFLICT:
    case HOLD_READINESS_STATES.BLOCKED_INVALID_LOCAL_TIME:
    case HOLD_READINESS_STATES.ALREADY_BOOKED:
      return "border-destructive/30 bg-destructive/5";
    case HOLD_READINESS_STATES.BLOCKED_HOURS_UNCONFIGURED:
    case HOLD_READINESS_STATES.BLOCKED_HOURS_UNVERIFIED:
    case HOLD_READINESS_STATES.BLOCKED_OUTSIDE_HOURS:
      return "border-warning/40 bg-warning/10";
    default:
      return "border-border bg-surface";
  }
}

export function HoldReadinessPanel({
  readiness,
  canHold = false,
}: {
  readiness: HoldReadinessResult;
  canHold?: boolean;
}) {
  const dateLabel = formatEventLocalDate(readiness.eventDate) ?? readiness.eventDate ?? "Not set";
  const startLabel = formatEventLocalTime(readiness.startTime) ?? readiness.startTime ?? "—";
  const endLabel = formatEventLocalTime(readiness.endTime) ?? readiness.endTime ?? "—";
  const eventSummary = `${dateLabel} ${startLabel}–${endLabel} at ${readiness.locationName ?? "location"} (${readiness.timeZone})`;
  const overridableHours = readiness.blockers.some((row) => row.overridableWithHoursException);
  const nonOverridable = readiness.blockers.filter((row) => !row.overridableWithHoursException);
  const showPlaceHold =
    canHold &&
    readiness.holdAttemptAllowed &&
    readiness.state !== HOLD_READINESS_STATES.ALREADY_HELD &&
    readiness.state !== HOLD_READINESS_STATES.ALREADY_BOOKED;
  const hoursExceptionId =
    readiness.activeException?.status === "ACTIVE" ? readiness.activeException.id : null;

  return (
    <section
      id="hold-readiness"
      className={`mt-4 rounded-2xl border px-4 py-4 shadow-sm ${statusTone(readiness.state)}`}
    >
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base font-semibold">Proposal HOLD readiness</h2>
          <p className="mt-1 text-sm font-medium">{readiness.headline}</p>
          <p className="mt-1 text-sm text-foreground/70">{readiness.detail}</p>
        </div>
      </div>

      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-foreground/55">Requested event</dt>
          <dd className="font-medium">
            {dateLabel} · {startLabel}–{endLabel}
          </dd>
        </div>
        <div>
          <dt className="text-foreground/55">Location / time zone</dt>
          <dd className="font-medium">
            {readiness.locationName ?? "No location"} · {readiness.timeZone}
          </dd>
        </div>
        <div>
          <dt className="text-foreground/55">Operating hours</dt>
          <dd className="font-medium">{readiness.operatingHoursStatus ?? "Not evaluated"}</dd>
        </div>
        <div>
          <dt className="text-foreground/55">HOLD state</dt>
          <dd className="font-medium">
            {readiness.activeHold
              ? readiness.activeHold.expired
                ? "Expired"
                : `Active (${readiness.activeHold.resourceCount} resources)`
              : "No active HOLD"}
          </dd>
        </div>
      </dl>

      {readiness.activeHold && !readiness.activeHold.expired ? (
        <div className="mt-3 rounded-md border border-border bg-background/70 px-3 py-2 text-sm">
          <p className="font-medium">Active HOLD resources</p>
          <ul className="mt-1 list-disc pl-5 text-foreground/80">
            {readiness.activeHold.resourceLabels.map((label) => (
              <li key={label}>{label}</li>
            ))}
          </ul>
          {readiness.activeHold.expiresAt ? (
            <p className="mt-2 text-foreground/70">
              Expires {new Date(readiness.activeHold.expiresAt).toLocaleString()} (24-hour proposal HOLD
              policy)
            </p>
          ) : null}
        </div>
      ) : null}

      {readiness.resourceAssignments.length > 0 ? (
        <div className="mt-4">
          <h3 className="text-sm font-semibold">Plan resource assignments</h3>
          <ul className="mt-2 space-y-1 text-sm text-foreground/80">
            {readiness.resourceAssignments.map((row) => (
              <li key={`${row.resourceTypeName}-${row.windowLabel ?? "event"}`}>
                {row.resourceTypeName}
                {row.quantity != null ? ` · ${row.quantity}` : ""}
                {row.windowLabel ? ` · ${row.windowLabel}` : ""}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {readiness.blockers.length > 0 ? (
        <div className="mt-4">
          <h3 className="text-sm font-semibold">Blocking reasons</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-foreground/80">
            {readiness.blockers.map((blocker) => (
              <li key={`${blocker.code}:${blocker.message}`}>
                {blocker.message}
                {blocker.overridableWithHoursException ? (
                  <span className="text-foreground/55"> (hours exception may apply)</span>
                ) : (
                  <span className="text-foreground/55"> (not overridable by hours exception)</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {overridableHours || readiness.activeException ? (
        <div className="mt-4 rounded-xl border border-border bg-background/70 px-3 py-3">
          <h3 className="text-sm font-semibold">Authorized HOLD hours exception</h3>
          <p className="mt-1 text-sm text-foreground/70">
            Exceptions are one-time, event-scoped, and audited. They never bypass resource conflicts,
            capacity limits, invalid local times, or tenant isolation.
          </p>
          <p className="mt-2 text-sm">
            <span className="text-foreground/55">Exact window: </span>
            <span className="font-medium">{eventSummary}</span>
          </p>

          {readiness.activeException ? (
            <div className="mt-3 space-y-1 text-sm">
              <p>
                Status: <span className="font-medium">{readiness.activeException.status}</span>
              </p>
              <p>
                Expires:{" "}
                <span className="font-medium">
                  {new Date(readiness.activeException.expiresAt).toLocaleString()}
                </span>
              </p>
              <p className="text-foreground/70">Reason: {readiness.activeException.reason}</p>
              {readiness.activeException.status === "ACTIVE" && readiness.canRevokeHoursException ? (
                <RevokePlaceHoldHoursExceptionForm
                  inquiryId={readiness.inquiryId}
                  exceptionId={readiness.activeException.id}
                />
              ) : null}
            </div>
          ) : null}

          {readiness.canAuthorizeHoursException ? (
            <AuthorizePlaceHoldHoursExceptionForm
              inquiryId={readiness.inquiryId}
              eventSummary={eventSummary}
            />
          ) : null}

          {!readiness.canAuthorizeHoursException && !readiness.activeException && overridableHours ? (
            <p className="mt-2 text-xs text-foreground/55">
              You need permission to confirm events before authorizing a HOLD hours exception.
            </p>
          ) : null}
        </div>
      ) : null}

      {showPlaceHold ? (
        <SecurityActionForm
          action={placeInquiryHoldAction}
          className="mt-4"
          notice={{
            successTitle: "Resources held",
            errorTitle: "Unable to place resource hold",
          }}
          confirm={{
            title: "Place a 24-hour proposal HOLD?",
            description:
              "This reserves exact rooms and lanes for this plan. Availability is rechecked when the HOLD is placed. A second active HOLD for the same inquiry is not allowed.",
            confirmLabel: "Place HOLD",
            confirmPendingLabel: "Placing…",
          }}
        >
          <input type="hidden" name="inquiryId" value={readiness.inquiryId} />
          {hoursExceptionId ? (
            <input type="hidden" name="hoursExceptionId" value={hoursExceptionId} />
          ) : null}
          <PendingSubmitButton
            pendingLabel="Placing…"
            className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Place HOLD
          </PendingSubmitButton>
        </SecurityActionForm>
      ) : null}

      {nonOverridable.some((row) => row.code === "RESOURCE_CONFLICT") ? (
        <p className="mt-3 text-sm">
          <Link href="/app/schedule" className="text-primary">
            Open Master Schedule
          </Link>{" "}
          to review occupancy.
        </p>
      ) : null}
    </section>
  );
}
