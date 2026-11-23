import { BookingList } from "@/components/layout/booking-list";
import { PageHeader } from "@/components/ui/page-header";
import { SecurityStatusPanel } from "@/components/layout/security-status-panel";
import { db } from "@/lib/db";
import { BOOKING_LIST_FILTERS } from "@/types/booking";
import { isAuthorizationError, isBookingError, isTenantContextError } from "@/server/errors";
import { getRequestContext } from "@/server/get-request-context";
import { hasPermission } from "@/server/policies/require-permission";
import { listBookings } from "@/server/services/booking-service";
import { PERMISSIONS } from "@/types/permissions";

type View =
  | { kind: "status"; title: string; body: string }
  | {
      kind: "ready";
      bookings: Awaited<ReturnType<typeof listBookings>>;
      filter: string;
      search: string;
      canCreate: boolean;
    };

async function loadView(search: { filter?: string; search?: string }): Promise<View> {
  try {
    const ctx = await getRequestContext();
    const filter = search.filter?.trim() || BOOKING_LIST_FILTERS.UPCOMING;
    const query = search.search?.trim() || "";
    const [bookings, canCreate] = await Promise.all([
      listBookings(ctx, db, { filter, search: query }),
      hasPermission(ctx, PERMISSIONS.EVENTS_CREATE, db),
    ]);
    return { kind: "ready", bookings, filter, search: query, canCreate };
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
      <PageHeader
        eyebrow="Operations"
        title="Bookings"
        description="Find upcoming events by customer, date, and status. Confirmed bookings occupy the Master Schedule; pending confirmation does not. MagicCRM does not collect payment here."
      />
      <BookingList
        bookings={view.bookings}
        filter={view.filter}
        search={view.search}
        canCreate={view.canCreate}
      />
    </section>
  );
}
