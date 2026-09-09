import Link from "next/link";

import { formatMoneyFromCents } from "@/lib/event-planner/money";
import { formatEventDuration } from "@/lib/event-planner/labels";
import { readEventPlanPayload } from "@/lib/event-planner/payload";
import { formatEventLocalDateTime, formatEventLocalTime, formatOrganizationTimestamp } from "@/lib/inquiries/tenant-datetime";
import { employeeDisplayName } from "@/lib/inquiries/workflow-stage";
import { minutesToClock } from "@/server/resources/time-window";
import { BOOKING_STATUS_LABELS, type BookingStatus } from "@/types/booking";
import { RESOURCE_RESERVATION_STATUSES } from "@/types/resource-schedule";

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
  currency: string;
  customerGroupName: string | null;
  customerFirstName: string | null;
  customerLastName: string | null;
  customerEmail: string;
  customerPhone: string | null;
  customerNotes: string | null;
  internalNotes: string | null;
  confirmedAt: Date;
  payload: unknown;
  confirmedBy: {
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
}: {
  booking: BookingDetailRecord;
  timeZone: string;
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
        {status} · Confirmed {formatOrganizationTimestamp(booking.confirmedAt, timeZone)} by{" "}
        {employeeDisplayName(booking.confirmedBy)}
      </p>
      <p className="mt-2 text-sm text-foreground/60">This record is read-only after confirmation.</p>

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
          <dd className="mt-1">{formatOrganizationTimestamp(booking.confirmedAt, timeZone)}</dd>
        </div>
      </dl>

      <h2 className="mt-10 text-lg font-semibold">Event Plan</h2>
      <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-foreground/60">Activities</dt>
          <dd className="mt-1">
            {payload.activities.length > 0
              ? payload.activities
                  .map((row) => (row.quantity > 1 ? `${row.name} × ${row.quantity}` : row.name))
                  .join(", ")
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
          <dt className="text-foreground/60">Schedule / rotations</dt>
          <dd className="mt-1 whitespace-pre-wrap">
            {payload.schedule.length > 0
              ? payload.schedule.join("\n")
              : payload.rotations && payload.rotations.length > 0
                ? payload.rotations
                    .map(
                      (row) =>
                        `${row.startTime}–${row.endTime}: ${row.assignments.map((item) => item.activityName).join(", ")}`,
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
      <p className="mt-2 text-xs text-foreground/55">No deposit or payment has been recorded.</p>

      <h2 className="mt-10 text-lg font-semibold">Resources</h2>
      {booking.reservations.length === 0 ? (
        <p className="mt-4 text-sm text-foreground/70">No finite resources are attached to this booking.</p>
      ) : (
        <ul className="mt-4 space-y-2 text-sm">
          {booking.reservations.map((row) => (
            <li key={row.id}>
              {row.resource.resourceType.name}: {row.resource.name} ·{" "}
              {formatEventLocalTime(minutesToClock(row.startMinute))}–
              {formatEventLocalTime(minutesToClock(row.endMinute))} ·{" "}
              {row.status === RESOURCE_RESERVATION_STATUSES.BOOKED ? "BOOKED" : row.status}
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
