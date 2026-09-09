import Link from "next/link";

import { formatMoneyFromCents } from "@/lib/event-planner/money";
import { formatEventLocalDateTime } from "@/lib/inquiries/tenant-datetime";
import { employeeDisplayName } from "@/lib/inquiries/workflow-stage";
import { BOOKING_LIST_FILTERS, BOOKING_STATUS_LABELS, type BookingListFilter, type BookingStatus } from "@/types/booking";

type BookingListRow = {
  id: string;
  bookingNumber: string;
  status: string;
  eventDate: Date;
  startTime: string;
  endTime: string;
  guestCount: number;
  eventType: string | null;
  totalCents: number;
  currency: string;
  customerGroupName: string | null;
  customerFirstName: string | null;
  customerLastName: string | null;
  confirmedBy: {
    firstName: string | null;
    lastName: string | null;
    displayName: string | null;
    email: string | null;
  } | null;
  reservations: Array<{
    resource: { name: string; resourceType: { name: string } };
  }>;
};

const FILTER_LABELS: Record<BookingListFilter, string> = {
  [BOOKING_LIST_FILTERS.UPCOMING]: "Upcoming",
  [BOOKING_LIST_FILTERS.TODAY]: "Today",
  [BOOKING_LIST_FILTERS.WEEK]: "This Week",
  [BOOKING_LIST_FILTERS.PAST]: "Past",
};

export function bookingResourceSummary(
  reservations: Array<{ resource: { name: string; resourceType: { name: string } } }>,
): string {
  const names = [...new Set(reservations.map((row) => row.resource.resourceType.name))];
  if (names.length === 0) {
    return "No resources";
  }
  return names.join(", ");
}

export function BookingList({
  bookings,
  filter,
  search,
}: {
  bookings: BookingListRow[];
  filter: string;
  search: string;
}) {
  const activeFilter = (Object.values(BOOKING_LIST_FILTERS) as string[]).includes(filter)
    ? (filter as BookingListFilter)
    : BOOKING_LIST_FILTERS.UPCOMING;

  return (
    <div className="mt-8">
      <form className="flex flex-wrap items-end gap-3" action="/app/bookings">
        <label className="text-sm">
          <span className="text-foreground/70">Search</span>
          <input
            name="search"
            defaultValue={search}
            placeholder="Booking number or customer"
            className="mt-1 w-56 rounded-md border border-border bg-background px-3 py-2"
          />
        </label>
        <button type="submit" className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground">
          Search
        </button>
      </form>
      <nav className="mt-4 flex flex-wrap gap-2" aria-label="Booking filters">
        {(Object.values(BOOKING_LIST_FILTERS) as BookingListFilter[]).map((value) => {
          const href = `/app/bookings?filter=${value}${search ? `&search=${encodeURIComponent(search)}` : ""}`;
          return (
            <Link
              key={value}
              href={href}
              className={`rounded-md px-3 py-1.5 text-sm ${
                value === activeFilter ? "bg-primary text-primary-foreground" : "border border-border"
              }`}
            >
              {FILTER_LABELS[value]}
            </Link>
          );
        })}
      </nav>
      {bookings.length === 0 ? (
        <p className="mt-8 text-sm text-foreground/70">No confirmed bookings in this view.</p>
      ) : (
        <ul className="mt-6 space-y-3">
          {bookings.map((booking) => {
            const name =
              booking.customerGroupName ||
              [booking.customerFirstName, booking.customerLastName].filter(Boolean).join(" ") ||
              "Booking";
            const status =
              booking.status in BOOKING_STATUS_LABELS
                ? BOOKING_STATUS_LABELS[booking.status as BookingStatus]
                : booking.status;
            return (
              <li key={booking.id}>
                <Link
                  href={`/app/bookings/${booking.id}`}
                  className="block rounded-md border border-border px-4 py-4 hover:bg-muted/60"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-foreground">{booking.bookingNumber}</p>
                      <p className="mt-1 text-sm text-foreground/70">{name}</p>
                    </div>
                    <span className="text-xs font-medium tracking-wide text-foreground/60">{status}</span>
                  </div>
                  <p className="mt-3 text-sm text-foreground/80">
                    {formatEventLocalDateTime({ date: booking.eventDate, time: booking.startTime })}
                    {` · ${booking.guestCount} guests`}
                    {booking.eventType ? ` · ${booking.eventType}` : ""}
                  </p>
                  <p className="mt-2 text-sm text-foreground/70">
                    {formatMoneyFromCents(booking.totalCents, booking.currency)}
                    {` · ${bookingResourceSummary(booking.reservations)}`}
                  </p>
                  <p className="mt-2 text-xs text-foreground/55">
                    Confirmed by {employeeDisplayName(booking.confirmedBy)}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
