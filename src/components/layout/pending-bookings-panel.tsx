import Link from "next/link";

import { formatEstimatedDepositLine, formatMoneyFromCents } from "@/lib/event-planner/money";
import { formatEventLocalDateTime } from "@/lib/inquiries/tenant-datetime";

type PendingBookingRow = {
  id: string;
  inquiryId: string;
  bookingNumber: string;
  eventDate: Date;
  startTime: string;
  endTime: string;
  guestCount: number;
  totalCents: number;
  depositRequiredCents: number;
  currency: string;
  customerGroupName: string | null;
  customerFirstName: string | null;
  customerLastName: string | null;
  selectedEventPlanId: string | null;
  availabilityConflictAt: Date | null;
  paymentConfirmedExternallyAt: Date | null;
  planTitle?: string | null;
};

export function PendingBookingsPanel({
  bookings,
}: {
  bookings: PendingBookingRow[];
}) {
  return (
    <section className="mt-8 rounded-2xl border border-border bg-surface px-4 py-4 shadow-sm">
      <h2 className="text-lg font-semibold">Pending bookings</h2>
      <p className="mt-1 text-sm text-foreground/70">
        These are unpaid booking requests. They are visible here for operations but do not occupy lanes,
        bays, or rooms.
      </p>
      {bookings.length === 0 ? (
        <p className="mt-3 text-sm text-foreground/60">No pending booking requests for this day.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {bookings.map((booking) => {
            const name =
              booking.customerGroupName ||
              [booking.customerFirstName, booking.customerLastName].filter(Boolean).join(" ") ||
              "Pending booking";
            return (
              <li key={booking.id} className="rounded-md border border-dashed border-border px-3 py-3 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{name}</p>
                    <p className="mt-1 text-foreground/70">
                      {formatEventLocalDateTime({ date: booking.eventDate, time: booking.startTime })}
                      {` · ${booking.guestCount} guests`}
                    </p>
                    {booking.planTitle ? <p className="mt-1 text-foreground/70">{booking.planTitle}</p> : null}
                    <p className="mt-1 text-foreground/70">
                      {formatMoneyFromCents(booking.totalCents, booking.currency)}
                      {booking.depositRequiredCents > 0
                        ? ` · ${formatEstimatedDepositLine(booking.depositRequiredCents, null, booking.currency)}`
                        : ""}
                    </p>
                  </div>
                  <span className="text-xs font-medium tracking-wide text-foreground/60">
                    {booking.paymentConfirmedExternallyAt && booking.availabilityConflictAt
                      ? "Payment received — availability conflict"
                      : "Pending payment"}
                  </span>
                </div>
                <p className="mt-2 text-xs text-foreground/55">{booking.bookingNumber}</p>
                <div className="mt-2 flex flex-wrap gap-3">
                  <Link href={`/app/bookings/${booking.id}`} className="text-primary">
                    Open booking
                  </Link>
                  <Link href={`/app/inquiries/${booking.inquiryId}`} className="text-primary">
                    Open inquiry
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
