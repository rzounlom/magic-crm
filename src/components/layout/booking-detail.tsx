import Link from "next/link";

import { SecurityActionForm } from "@/components/layout/security-action-form";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import { formatEstimatedDepositLine, formatMoneyFromCents } from "@/lib/event-planner/money";
import { formatActivityLine } from "@/lib/event-planner/activity-display";
import { formatEventDuration } from "@/lib/event-planner/labels";
import { readEventPlanPayload } from "@/lib/event-planner/payload";
import { isSampleItinerarySegment } from "@/server/catalog/scheduling-behavior";
import {
  formatAllocatedSummary,
  formatAllocatedWindow,
  groupAllocatedResources,
} from "@/lib/bookings/allocated-resources";
import { formatEventLocalDateTime, formatEventLocalTime, formatItineraryLine, formatOrganizationTimestamp } from "@/lib/inquiries/tenant-datetime";
import { employeeDisplayName } from "@/lib/inquiries/workflow-stage";
import { cancelConfirmedBookingConfirm, cancelPendingBookingConfirm } from "@/lib/ui/destructive-confirm";
import { cancelBookingAction } from "@/server/actions/bookings";
import {
  BOOKING_STATUS_LABELS,
  isCancellableBooking,
  isCancelledBooking,
  isConfirmedBooking,
  isPendingPaymentBooking,
  type BookingStatus,
} from "@/types/booking";

type BookingDetailRecord = {
  id: string;
  bookingNumber: string;
  status: string;
  eventDate: Date;
  startTime: string;
  endTime: string;
  guestCount: number;
  eventType: string | null;
  eventGoal: string | null;
  diningLabel: string | null;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  depositRequiredCents?: number | null;
  currency: string;
  customerGroupName: string | null;
  customerFirstName: string | null;
  customerLastName: string | null;
  customerEmail: string;
  customerPhone: string | null;
  customerNotes: string | null;
  internalNotes: string | null;
  confirmedAt: Date | null;
  cancelledAt?: Date | null;
  payload: unknown;
  confirmedBy: {
    firstName: string | null;
    lastName: string | null;
    displayName: string | null;
    email: string | null;
  } | null;
  cancelledBy?: {
    firstName: string | null;
    lastName: string | null;
    displayName: string | null;
    email: string | null;
  } | null;
  lineItems: Array<{
    id: string;
    kind: string;
    name: string;
    quantity: number;
    unitPriceCents: number;
    totalCents: number;
    startTime: string | null;
    endTime: string | null;
  }>;
  reservations: Array<{
    id: string;
    status: string;
    startMinute: number;
    endMinute: number;
    releasedAt?: Date | null;
    resource: { name: string; resourceType: { name: string } };
  }>;
  inquiry: {
    id: string;
    selectedEventPlanId: string | null;
    agentWorkingPlanId: string | null;
    customerSelectedAt: Date | null;
  } | null;
};

export function BookingDetail({
  booking,
  timeZone,
  canCancel = false,
}: {
  booking: BookingDetailRecord;
  timeZone: string;
  canCancel?: boolean;
}) {
  const payload = readEventPlanPayload(booking.payload);
  const groupName =
    booking.customerGroupName ||
    [booking.customerFirstName, booking.customerLastName].filter(Boolean).join(" ") ||
    booking.customerEmail;
  const contact = [booking.customerFirstName, booking.customerLastName].filter(Boolean).join(" ") || "—";
  const status =
    booking.status in BOOKING_STATUS_LABELS
      ? BOOKING_STATUS_LABELS[booking.status as BookingStatus]
      : booking.status;

  return (
    <section className="w-full max-w-4xl">
      <Link href="/app/bookings" className="text-sm text-primary">
        Back to bookings
      </Link>
      <p className="mt-3 text-sm font-semibold tracking-[0.18em] text-primary uppercase">Booking Summary</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">{booking.bookingNumber}</h1>
      <p className="mt-2 text-sm text-foreground/70">
        {status}
        {booking.confirmedAt
          ? ` · Confirmed ${formatOrganizationTimestamp(booking.confirmedAt, timeZone)} by ${employeeDisplayName(booking.confirmedBy)}`
          : isCancelledBooking(booking.status)
            ? ""
            : " · Not confirmed yet"}
        {booking.cancelledAt
          ? ` · Cancelled ${formatOrganizationTimestamp(booking.cancelledAt, timeZone)} by ${employeeDisplayName(booking.cancelledBy ?? null)}`
          : ""}
      </p>
      <p className="mt-2 text-sm text-foreground/60">
        {isCancelledBooking(booking.status)
          ? "This booking is cancelled. Released resources are free on the Master Schedule. Historical information is kept."
          : isConfirmedBooking(booking.status)
            ? "This record is read-only after confirmation."
            : isPendingPaymentBooking(booking.status)
              ? "This pending booking does not occupy inventory until it is confirmed."
              : "This booking cannot be edited from this page."}
      </p>
      {canCancel && isCancellableBooking(booking.status) ? (
        <div className="mt-4">
          <SecurityActionForm
            action={cancelBookingAction}
            notice={{ successTitle: "Booking cancelled", errorTitle: "Unable to cancel booking" }}
            confirm={
              isConfirmedBooking(booking.status)
                ? cancelConfirmedBookingConfirm()
                : cancelPendingBookingConfirm()
            }
          >
            <input type="hidden" name="bookingId" value={booking.id} />
            <PendingSubmitButton
              pendingLabel="Cancelling…"
              className="rounded-md border border-destructive/40 px-4 py-2 text-sm font-medium text-destructive"
            >
              Cancel Booking
            </PendingSubmitButton>
          </SecurityActionForm>
        </div>
      ) : null}
      {!isCancellableBooking(booking.status) && !isCancelledBooking(booking.status) ? (
        <p className="mt-4 text-sm text-foreground/60">This booking cannot be cancelled.</p>
      ) : null}

      <dl className="mt-8 grid gap-4 border-t border-border pt-6 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-foreground/60">Customer / group</dt>
          <dd className="mt-1">{groupName}</dd>
        </div>
        <div>
          <dt className="text-foreground/60">Contact</dt>
          <dd className="mt-1">{contact}</dd>
        </div>
        <div>
          <dt className="text-foreground/60">Email</dt>
          <dd className="mt-1">{booking.customerEmail}</dd>
        </div>
        <div>
          <dt className="text-foreground/60">Status</dt>
          <dd className="mt-1">{status}</dd>
        </div>
        <div>
          <dt className="text-foreground/60">Confirmed date</dt>
          <dd className="mt-1">{formatEventLocalDateTime({ date: booking.eventDate, time: booking.startTime })}</dd>
        </div>
        <div>
          <dt className="text-foreground/60">Confirmed time</dt>
          <dd className="mt-1">
            {formatEventLocalTime(booking.startTime)}–{formatEventLocalTime(booking.endTime)}
          </dd>
        </div>
        <div>
          <dt className="text-foreground/60">Guest count</dt>
          <dd className="mt-1">{booking.guestCount}</dd>
        </div>
        <div>
          <dt className="text-foreground/60">Confirmed by</dt>
          <dd className="mt-1">{employeeDisplayName(booking.confirmedBy)}</dd>
        </div>
        <div>
          <dt className="text-foreground/60">Confirmed timestamp</dt>
          <dd className="mt-1">
            {booking.confirmedAt ? formatOrganizationTimestamp(booking.confirmedAt, timeZone) : "—"}
          </dd>
        </div>
      </dl>

      <h2 className="mt-10 text-lg font-semibold">Event Plan</h2>
      <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-foreground/60">Activities</dt>
          <dd className="mt-1">
            {payload.activities.length > 0
              ? payload.activities
                  .map((row) =>
                    formatActivityLine(row, {
                      guestCount: payload.guestCount,
                      itinerary: payload.itinerary,
                    }),
                  )
                  .join("; ")
              : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-foreground/60">Dining</dt>
          <dd className="mt-1">{booking.diningLabel || payload.dining.label || "—"}</dd>
        </div>
        <div>
          <dt className="text-foreground/60">Room / space</dt>
          <dd className="mt-1">{payload.spaces.map((row) => row.name).join(", ") || "—"}</dd>
        </div>
        <div>
          <dt className="text-foreground/60">Event duration</dt>
          <dd className="mt-1">{formatEventDuration(payload.durationMinutes)}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-foreground/60">Sample Itinerary</dt>
          <dd className="mt-1 whitespace-pre-wrap">
            {payload.itinerary && payload.itinerary.filter(isSampleItinerarySegment).length > 0
              ? payload.itinerary
                  .filter(isSampleItinerarySegment)
                  .map((segment) => formatItineraryLine(`${segment.startTime}–${segment.endTime} ${segment.label}`))
                  .join("\n")
              : payload.schedule.length > 0
                ? payload.schedule.map(formatItineraryLine).join("\n")
                : payload.rotations && payload.rotations.length > 0
                  ? payload.rotations
                      .map(
                        (row) =>
                          `${formatItineraryLine(`${row.startTime}–${row.endTime} ${row.assignments.map((item) => item.activityName).join(", ")}`)}`,
                      )
                      .join("\n")
                  : "—"}
          </dd>
        </div>
        {booking.eventGoal ? (
          <div>
            <dt className="text-foreground/60">Event goal</dt>
            <dd className="mt-1">{booking.eventGoal}</dd>
          </div>
        ) : null}
        {booking.eventType ? (
          <div>
            <dt className="text-foreground/60">Event type</dt>
            <dd className="mt-1">{booking.eventType}</dd>
          </div>
        ) : null}
      </dl>

      <h2 className="mt-10 text-lg font-semibold">Pricing</h2>
      {booking.lineItems.length > 0 ? (
        <ul className="mt-4 space-y-2 text-sm">
          {booking.lineItems.map((item) => (
            <li key={item.id} className="flex flex-wrap justify-between gap-2">
              <span>
                {item.name}
                {item.quantity > 1 ? ` × ${item.quantity}` : ""}
              </span>
              <span>{formatMoneyFromCents(item.totalCents, booking.currency)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-foreground/70">No line items were stored. Total is taken from the working plan.</p>
      )}
      <dl className="mt-4 space-y-1 text-sm">
        <div className="flex justify-between gap-4">
          <dt>Subtotal</dt>
          <dd>{formatMoneyFromCents(booking.subtotalCents, booking.currency)}</dd>
        </div>
        {booking.taxCents > 0 ? (
          <div className="flex justify-between gap-4">
            <dt>Taxes / fees</dt>
            <dd>{formatMoneyFromCents(booking.taxCents, booking.currency)}</dd>
          </div>
        ) : null}
        <div className="flex justify-between gap-4 font-medium">
          <dt>Total</dt>
          <dd>{formatMoneyFromCents(booking.totalCents, booking.currency)}</dd>
        </div>
      </dl>
      {booking.depositRequiredCents != null && booking.depositRequiredCents > 0 ? (
        <p className="mt-2 text-xs text-foreground/55">
          {formatEstimatedDepositLine(
            booking.depositRequiredCents,
            readEventPlanPayload(booking.payload).depositPreviewPercent,
            booking.currency,
          )}
        </p>
      ) : (
        <p className="mt-2 text-xs text-foreground/55">No deposit or payment has been recorded.</p>
      )}

      <h2 className="mt-10 text-lg font-semibold">Resources</h2>
      {booking.reservations.length === 0 ? (
        <p className="mt-4 text-sm text-foreground/70">No finite resources are attached to this booking.</p>
      ) : (
        <ul className="mt-4 space-y-3 text-sm">
          {groupAllocatedResources(booking.reservations).map((group) => (
            <li key={group.key}>
              <p className="font-medium">{group.resourceTypeName}</p>
              <p className="text-foreground/70">{formatAllocatedWindow(group)}</p>
              <p className="text-foreground/70">
                {group.released
                  ? `${group.allocatedQuantity} released`
                  : `${group.allocatedQuantity} booked`}
                {group.activeQuantity != null ? ` · ${formatAllocatedSummary(group)}` : ""}
              </p>
              <ul className="mt-1 list-disc pl-5">
                {group.names.map((name) => (
                  <li key={name}>{name}</li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}

      <h2 className="mt-10 text-lg font-semibold">Notes</h2>
      <div className="mt-4 space-y-4 text-sm">
        <div>
          <p className="text-foreground/60">Customer notes</p>
          <p className="mt-1 whitespace-pre-wrap">{booking.customerNotes || "None"}</p>
        </div>
        <div>
          <p className="text-foreground/60">Staff / internal notes</p>
          <p className="mt-1 whitespace-pre-wrap">{booking.internalNotes || "None"}</p>
        </div>
      </div>

      <h2 className="mt-10 text-lg font-semibold">Source</h2>
      <ul className="mt-4 space-y-1 text-sm">
        {booking.inquiry ? (
          <li>
            Originating inquiry:{" "}
            <Link href={`/app/inquiries/${booking.inquiry.id}`} className="text-primary">
              Open sales record
            </Link>
          </li>
        ) : null}
        <li>
          Customer-selected plan remains historical
          {booking.inquiry?.selectedEventPlanId ? ` (${booking.inquiry.selectedEventPlanId})` : ""}.
        </li>
        <li>
          Booking matches the Current Agent Version at confirmation
          {booking.inquiry?.agentWorkingPlanId ? ` (${booking.inquiry.agentWorkingPlanId})` : ""}.
        </li>
      </ul>
    </section>
  );
}
