import Link from "next/link";

import {
  BookingReadinessCard,
  readinessToneFromState,
} from "@/components/layout/booking-readiness-card";
import {
  AuthorizePlaceHoldHoursExceptionForm,
  RevokePlaceHoldHoursExceptionForm,
} from "@/components/layout/hold-hours-exception-form";
import { HoursExceptionSection } from "@/components/layout/hours-exception-section";
import { SecurityActionForm } from "@/components/layout/security-action-form";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import { buttonClassName } from "@/components/ui/button";
import { formatEventLocalDate, formatEventLocalTime } from "@/lib/inquiries/tenant-datetime";
import { placeInquiryHoldAction } from "@/server/actions/resource-schedule";
import type { HoldReadinessResult } from "@/types/hold-readiness";
import { HOLD_READINESS_STATES } from "@/types/hold-readiness";

export function HoldReadinessPanel({
  readiness,
  canHold = false,
  inquiryAssigned = true,
}: {
  readiness: HoldReadinessResult;
  canHold?: boolean;
  /** When false, clarify that HOLD remains allowed without claiming (server rule). */
  inquiryAssigned?: boolean;
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
    <BookingReadinessCard
      id="hold-readiness"
      purpose="PLACE_HOLD"
      title="Proposal HOLD readiness"
      headline={readiness.headline}
      detail={readiness.detail}
      tone={readinessToneFromState("hold", readiness.state)}
      eventDateLabel={dateLabel}
      eventTimeLabel={`${startLabel}–${endLabel}`}
      locationLabel={`${readiness.locationName ?? "No location"} · ${readiness.timeZone}`}
      operatingHoursStatus={readiness.operatingHoursStatus ?? "Not evaluated"}
      blockers={readiness.blockers}
      metaRows={[
        {
          label: "HOLD state",
          value: readiness.activeHold
            ? readiness.activeHold.expired
              ? "Expired"
              : `Active (${readiness.activeHold.resourceCount} resources)`
            : "No active HOLD",
        },
      ]}
    >
      {readiness.activeHold && !readiness.activeHold.expired ? (
        <div className="mt-3 rounded-[var(--radius-control)] border border-border bg-background/70 px-3 py-2 text-sm">
          <p className="font-medium">Active HOLD resources</p>
          <ul className="mt-1 list-disc pl-5 text-foreground/80">
            {readiness.activeHold.resourceLabels.map((label) => (
              <li key={label}>{label}</li>
            ))}
          </ul>
          {readiness.activeHold.expiresAt ? (
            <p className="mt-2 text-muted-foreground">
              Expires {new Date(readiness.activeHold.expiresAt).toLocaleString()} (24-hour proposal HOLD
              policy)
            </p>
          ) : null}
        </div>
      ) : null}

      {readiness.activeHold?.expired ? (
        <p className="mt-3 rounded-[var(--radius-control)] border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
          The previous HOLD has expired. Place a new HOLD if you need a temporary reservation, or confirm
          when confirmation readiness allows it.
        </p>
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

      {overridableHours || readiness.activeException ? (
        <HoursExceptionSection
          title="Authorized HOLD hours exception"
          purposeNote="Exceptions are one-time, event-scoped, and audited. A PLACE_HOLD exception never authorizes confirmation. They never bypass resource conflicts, capacity limits, invalid local times, or tenant isolation."
          eventSummary={eventSummary}
          defaultOpen={Boolean(readiness.activeException)}
        >
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
              <p className="text-muted-foreground">Reason: {readiness.activeException.reason}</p>
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
            <p className="mt-2 text-xs text-muted-foreground">
              You need permission to confirm events before authorizing a HOLD hours exception.
            </p>
          ) : null}
        </HoursExceptionSection>
      ) : null}

      {showPlaceHold && !inquiryAssigned ? (
        <p className="mt-3 rounded-[var(--radius-control)] border border-border bg-muted/30 px-3 py-2 text-sm text-foreground/80">
          This inquiry is unassigned. Proposal HOLD does not require claiming — Start Working is still required
          before confirmation.
        </p>
      ) : null}

      {showPlaceHold ? (
        <div className="mt-4" data-primary-hold-action>
          <SecurityActionForm
            action={placeInquiryHoldAction}
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
              className={buttonClassName({ variant: "primary", size: "md", className: "w-full" })}
            >
              Place HOLD
            </PendingSubmitButton>
          </SecurityActionForm>
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
    </BookingReadinessCard>
  );
}
