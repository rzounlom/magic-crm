import Link from "next/link";

import {
  BookingReadinessCard,
  readinessToneFromState,
} from "@/components/layout/booking-readiness-card";
import {
  AuthorizeHoursExceptionForm,
  RevokeHoursExceptionForm,
} from "@/components/layout/confirmation-hours-exception-form";
import { HoursExceptionSection } from "@/components/layout/hours-exception-section";
import { formatEventLocalDate, formatEventLocalTime } from "@/lib/inquiries/tenant-datetime";
import { BOOKING_STATUS_LABELS } from "@/types/booking";
import type { ConfirmationReadinessResult } from "@/types/confirmation-readiness";

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
    <BookingReadinessCard
      id="confirmation-readiness"
      purpose="CONFIRM_BOOKING"
      title="Confirmation readiness"
      headline={readiness.headline}
      detail={readiness.detail}
      tone={readinessToneFromState("confirm", readiness.state)}
      eventDateLabel={dateLabel}
      eventTimeLabel={`${startLabel}–${endLabel}`}
      locationLabel={`${readiness.locationName ?? "No location"} · ${readiness.timeZone}`}
      operatingHoursStatus={readiness.operatingHoursStatus ?? "Not evaluated"}
      blockers={readiness.blockers}
      metaRows={[{ label: "Booking status", value: bookingStatusLabel }]}
      headerAside={
        readiness.bookingHref && readiness.bookingNumber ? (
          <Link href={readiness.bookingHref} className="text-primary">
            Open {readiness.bookingNumber}
          </Link>
        ) : null
      }
    >
      {overridableHours || readiness.activeException ? (
        <HoursExceptionSection
          title="Authorized confirmation hours exception"
          purposeNote="Exceptions are one-time, event-scoped, and audited. A CONFIRM_BOOKING exception never authorizes HOLD placement. They never bypass resource conflicts, capacity limits, invalid local times, or tenant isolation."
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
            <p className="mt-2 text-xs text-muted-foreground">
              You need permission to confirm events before authorizing an hours exception.
            </p>
          ) : null}
        </HoursExceptionSection>
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
