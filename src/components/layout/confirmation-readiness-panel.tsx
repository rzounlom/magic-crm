import Link from "next/link";

import {
  AuthorizeHoursExceptionForm,
  RevokeHoursExceptionForm,
} from "@/components/layout/confirmation-hours-exception-form";
import { formatEventLocalDate, formatEventLocalTime } from "@/lib/inquiries/tenant-datetime";
import { BOOKING_STATUS_LABELS } from "@/types/booking";
import type { ConfirmationReadinessResult } from "@/types/confirmation-readiness";
import { CONFIRMATION_READINESS_STATES } from "@/types/confirmation-readiness";

function statusTone(state: ConfirmationReadinessResult["state"]): string {
  switch (state) {
    case CONFIRMATION_READINESS_STATES.ALREADY_CONFIRMED:
    case CONFIRMATION_READINESS_STATES.READY_WITH_EXCEPTION:
    case CONFIRMATION_READINESS_STATES.NEEDS_FINAL_VALIDATION:
      return "border-primary/25 bg-primary/5";
    case CONFIRMATION_READINESS_STATES.BLOCKED_RESOURCE_CONFLICT:
    case CONFIRMATION_READINESS_STATES.BLOCKED_INVALID_LOCAL_TIME:
      return "border-destructive/30 bg-destructive/5";
    case CONFIRMATION_READINESS_STATES.BLOCKED_HOURS_UNCONFIGURED:
    case CONFIRMATION_READINESS_STATES.BLOCKED_HOURS_UNVERIFIED:
    case CONFIRMATION_READINESS_STATES.BLOCKED_OUTSIDE_HOURS:
      return "border-warning/40 bg-warning/10";
    default:
      return "border-border bg-surface";
  }
}

export function ConfirmationReadinessPanel({
  readiness,
}: {
  readiness: ConfirmationReadinessResult;
}) {
  const dateLabel = formatEventLocalDate(readiness.eventDate) ?? readiness.eventDate ?? "Not set";
  const startLabel = formatEventLocalTime(readiness.startTime) ?? readiness.startTime ?? "—";
  const endLabel = formatEventLocalTime(readiness.endTime) ?? readiness.endTime ?? "—";
  const bookingStatusLabel = readiness.bookingStatus
    ? (BOOKING_STATUS_LABELS[readiness.bookingStatus as keyof typeof BOOKING_STATUS_LABELS] ??
      readiness.bookingStatus)
    : "No booking row yet";
  const eventSummary = `${dateLabel} ${startLabel}–${endLabel} at ${readiness.locationName ?? "location"} (${readiness.timeZone})`;
  const overridableHours = readiness.blockers.some((row) => row.overridableWithHoursException);
  const nonOverridable = readiness.blockers.filter((row) => !row.overridableWithHoursException);

  return (
    <section
      id="confirmation-readiness"
      className={`mt-4 rounded-2xl border px-4 py-4 shadow-sm ${statusTone(readiness.state)}`}
    >
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base font-semibold">Confirmation readiness</h2>
          <p className="mt-1 text-sm font-medium">{readiness.headline}</p>
          <p className="mt-1 text-sm text-foreground/70">{readiness.detail}</p>
        </div>
        {readiness.bookingHref && readiness.bookingNumber ? (
          <p className="shrink-0 text-sm">
            <Link href={readiness.bookingHref} className="text-primary">
              Open {readiness.bookingNumber}
            </Link>
          </p>
        ) : null}
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
          <dt className="text-foreground/55">Booking status</dt>
          <dd className="font-medium">{bookingStatusLabel}</dd>
        </div>
        <div>
          <dt className="text-foreground/55">Operating hours</dt>
          <dd className="font-medium">{readiness.operatingHoursStatus ?? "Not evaluated"}</dd>
        </div>
      </dl>

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
          <h3 className="text-sm font-semibold">Authorized hours exception</h3>
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
                <RevokeHoursExceptionForm
                  inquiryId={readiness.inquiryId}
                  exceptionId={readiness.activeException.id}
                />
              ) : null}
            </div>
          ) : null}

          {readiness.canAuthorizeHoursException ? (
            <AuthorizeHoursExceptionForm inquiryId={readiness.inquiryId} eventSummary={eventSummary} />
          ) : null}

          {!readiness.canAuthorizeHoursException && !readiness.activeException && overridableHours ? (
            <p className="mt-2 text-xs text-foreground/55">
              You need permission to confirm events before authorizing an hours exception.
            </p>
          ) : null}
        </div>
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
