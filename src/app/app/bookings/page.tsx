import { BookingList } from "@/components/layout/booking-list";
import { SecurityStatusPanel } from "@/components/layout/security-status-panel";
import { db } from "@/lib/db";
import { BOOKING_LIST_FILTERS } from "@/types/booking";
import { isAuthorizationError, isBookingError, isTenantContextError } from "@/server/errors";
import { getRequestContext } from "@/server/get-request-context";
import { listBookings } from "@/server/services/booking-service";

type View =
  | { kind: "status"; title: string; body: string }
  | {
      kind: "ready";
      bookings: Awaited<ReturnType<typeof listBookings>>;
      filter: string;
      search: string;
    };

async function loadView(search: { filter?: string; search?: string }): Promise<View> {
  try {
    const ctx = await getRequestContext();
    const filter = search.filter?.trim() || BOOKING_LIST_FILTERS.UPCOMING;
    const query = search.search?.trim() || "";
    const bookings = await listBookings(ctx, db, { filter, search: query });
    return { kind: "ready", bookings, filter, search: query };
  } catch (error) {
    if (isAuthorizationError(error) || isTenantContextError(error) || isBookingError(error)) {
      return { kind: "status", title: "Bookings", body: error.userMessage };
    }
    throw error;
  }
}

export default async function BookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; search?: string }>;
}) {
  const search = await searchParams;
  const view = await loadView(search);
  if (view.kind === "status") {
    return <SecurityStatusPanel title={view.title} body={view.body} />;
  }

  return (
    <section className="max-w-4xl">
      <p className="text-sm font-semibold tracking-[0.18em] text-primary uppercase">Operations</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground">Bookings</h1>
      <p className="mt-4 max-w-xl text-sm text-foreground/70">
        Confirmed events. Resource occupancy is BOOKED on the Master Schedule. Payment collection is not part of
        this list.
      </p>
      <BookingList bookings={view.bookings} filter={view.filter} search={view.search} />
    </section>
  );
}
