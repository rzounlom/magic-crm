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
import {
  formatEventLocalDate,
  formatEventLocalDateTime,
  formatEventLocalTime,
  formatItineraryLine,
  formatOrganizationTimestamp,
} from "@/lib/inquiries/tenant-datetime";
import { employeeDisplayName } from "@/lib/inquiries/workflow-stage";
import { cancelConfirmedBookingConfirm, cancelPendingBookingConfirm } from "@/lib/ui/destructive-confirm";
import { buttonClassName } from "@/components/ui/button";
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
  const scheduleHref = `/app/schedule?date=${booking.eventDate.toISOString().slice(0, 10)}&start=${booking.startTime}`;
  const statusClass = isCancelledBooking(booking.status)
    ? "status-badge status-badge-neutral"
    : isConfirmedBooking(booking.status)
      ? "status-badge status-badge-success"
      : isPendingPaymentBooking(booking.status)
        ? "status-badge status-badge-warning"
        : "status-badge status-badge-neutral";

  return (
    <section className="w-full max-w-6xl" data-booking-detail>
      <Link href="/app/bookings" className="text-sm font-medium text-primary underline underline-offset-2">
        Back to bookings
      </Link>

      <header className="mt-4 rounded-[var(--radius-card)] border border-border bg-surface px-5 py-5 shadow-[var(--shadow-card)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="page-eyebrow">Booking</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <h1 className="page-title">{booking.bookingNumber}</h1>
              <span className={statusClass}>{status}</span>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              {formatEventLocalDate(booking.eventDate) ?? formatEventLocalDateTime({ date: booking.eventDate, time: booking.startTime })}
              {" · "}
              {formatEventLocalTime(booking.startTime)}–{formatEventLocalTime(booking.endTime)}
              {" · "}
              {booking.guestCount} guests
              {" · "}
              {formatMoneyFromCents(booking.totalCents, booking.currency)}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              {isCancelledBooking(booking.status)
                ? "Cancelled. Released resources are free on the Master Schedule. Historical information is kept."
                : isConfirmedBooking(booking.status)
                  ? "Confirmed record — read-only except permission-gated cancel. MagicCRM does not collect payment here."
                  : isPendingPaymentBooking(booking.status)
                    ? "Pending booking does not occupy inventory until confirmed. MagicCRM does not collect payment."
                    : "This booking cannot be edited from this page."}
            </p>
            {booking.confirmedAt ? (
              <p className="mt-1 text-xs text-muted-foreground">
                Confirmed {formatOrganizationTimestamp(booking.confirmedAt, timeZone)} by{" "}
                {employeeDisplayName(booking.confirmedBy)}
              </p>
            ) : null}
            {booking.cancelledAt ? (
              <p className="mt-1 text-xs text-muted-foreground">
                Cancelled {formatOrganizationTimestamp(booking.cancelledAt, timeZone)} by{" "}
                {employeeDisplayName(booking.cancelledBy ?? null)}
              </p>
            ) : null}
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-56">
            <Link
              href={scheduleHref}
              className={buttonClassName({ variant: "secondary", size: "md", className: "w-full text-center" })}
            >
              View on Schedule
            </Link>
            {booking.inquiry ? (
              <Link
                href={`/app/inquiries/${booking.inquiry.id}`}
                className={buttonClassName({ variant: "ghost", size: "md", className: "w-full text-center" })}
              >
                Open inquiry
              </Link>
            ) : null}
            {canCancel && isCancellableBooking(booking.status) ? (
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
                  className={buttonClassName({
                    variant: "destructive",
                    size: "md",
                    className: "w-full",
                  })}
                >
                  Cancel Booking
                </PendingSubmitButton>
              </SecurityActionForm>
            ) : null}
            {!isCancellableBooking(booking.status) && !isCancelledBooking(booking.status) ? (
              <p className="text-xs text-muted-foreground">This booking cannot be cancelled.</p>
            ) : null}
          </div>
        </div>
      </header>

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1.4fr)_minmax(16rem,1fr)]">
        <div className="space-y-8">
          <section>
            <h2 className="text-lg font-semibold">Customer</h2>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">Group</dt>
                <dd className="mt-0.5">{groupName}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Contact</dt>
                <dd className="mt-0.5">{contact}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-muted-foreground">Email</dt>
                <dd className="mt-0.5">{booking.customerEmail}</dd>
              </div>
            </dl>
          </section>

          <section>
            <h2 className="text-lg font-semibold">Event plan</h2>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <div className="sm:col-span-2">
                <dt className="text-muted-foreground">Activities</dt>
                <dd className="mt-0.5">
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
                <dt className="text-muted-foreground">Dining</dt>
                <dd className="mt-0.5">{booking.diningLabel || payload.dining.label || "—"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Room / space</dt>
                <dd className="mt-0.5">{payload.spaces.map((row) => row.name).join(", ") || "—"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Duration</dt>
                <dd className="mt-0.5">{formatEventDuration(payload.durationMinutes)}</dd>
              </div>
              {booking.eventType ? (
                <div>
                  <dt className="text-muted-foreground">Event type</dt>
                  <dd className="mt-0.5">{booking.eventType}</dd>
                </div>
              ) : null}
              <div className="sm:col-span-2">
                <dt className="text-muted-foreground">Sample itinerary</dt>
                <dd className="mt-0.5 whitespace-pre-wrap">
                  {payload.itinerary && payload.itinerary.filter(isSampleItinerarySegment).length > 0
                    ? payload.itinerary
                        .filter(isSampleItinerarySegment)
                        .map((segment) =>
                          formatItineraryLine(`${segment.startTime}–${segment.endTime} ${segment.label}`),
                        )
                        .join("\n")
                    : payload.schedule.length > 0
                      ? payload.schedule.map(formatItineraryLine).join("\n")
                      : "—"}
                </dd>
              </div>
            </dl>
          </section>

          <section>
            <h2 className="text-lg font-semibold">Notes</h2>
            <div className="mt-4 space-y-4 text-sm">
              <div>
                <p className="text-muted-foreground">Customer notes</p>
                <p className="mt-1 whitespace-pre-wrap">{booking.customerNotes || "None"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Staff / internal notes</p>
                <p className="mt-1 whitespace-pre-wrap">{booking.internalNotes || "None"}</p>
              </div>
            </div>
          </section>
        </div>

        <aside className="space-y-8">
          <section className="rounded-[var(--radius-card)] border border-border bg-surface px-4 py-4">
            <h2 className="text-lg font-semibold">Pricing</h2>
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
              <p className="mt-4 text-sm text-muted-foreground">
                No line items stored. Total is taken from the working plan.
              </p>
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
              <p className="mt-2 text-xs text-muted-foreground">
                {formatEstimatedDepositLine(
                  booking.depositRequiredCents,
                  readEventPlanPayload(booking.payload).depositPreviewPercent,
                  booking.currency,
                )}
              </p>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">No deposit or payment has been recorded.</p>
            )}
          </section>

          <section className="rounded-[var(--radius-card)] border border-border bg-surface px-4 py-4">
            <h2 className="text-lg font-semibold">Resources</h2>
            {booking.reservations.length === 0 ? (
              <p className="mt-4 text-sm text-muted-foreground">No finite resources are attached.</p>
            ) : (
              <ul className="mt-4 space-y-3 text-sm">
                {groupAllocatedResources(booking.reservations).map((group) => (
                  <li key={group.key}>
                    <p className="font-medium">{group.resourceTypeName}</p>
                    <p className="text-muted-foreground">{formatAllocatedWindow(group)}</p>
                    <p className="text-muted-foreground">
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
          </section>

          <section className="text-sm text-muted-foreground">
            <h2 className="text-lg font-semibold text-foreground">Source</h2>
            <ul className="mt-3 space-y-1">
              {booking.inquiry ? (
                <li>
                  Originating inquiry remains linked for sales history.
                </li>
              ) : null}
              <li>Customer-selected plan is historical context only.</li>
              <li>Booking matches the agent working plan at confirmation.</li>
            </ul>
          </section>
        </aside>
      </div>
    </section>
  );
}
