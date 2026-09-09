import { notFound } from "next/navigation";

import { BookingDetail } from "@/components/layout/booking-detail";
import { SecurityStatusPanel } from "@/components/layout/security-status-panel";
import { db } from "@/lib/db";
import { isAuthorizationError, isBookingError, isTenantContextError } from "@/server/errors";
import { getRequestContext } from "@/server/get-request-context";
import { getBookingDetail } from "@/server/services/booking-service";
import { getCurrentTenantTimezone } from "@/server/services/inquiry-service";

type View =
  | { kind: "status"; title: string; body: string }
  | { kind: "missing" }
  | {
      kind: "ready";
      booking: NonNullable<Awaited<ReturnType<typeof getBookingDetail>>>;
      timeZone: string;
    };

async function loadView(bookingId: string): Promise<View> {
  try {
    const ctx = await getRequestContext();
    const [booking, timeZone] = await Promise.all([
      getBookingDetail(ctx, db, bookingId),
      getCurrentTenantTimezone(ctx, db),
    ]);
    if (!booking) {
      return { kind: "missing" };
    }
    return { kind: "ready", booking, timeZone };
  } catch (error) {
    if (isAuthorizationError(error) || isTenantContextError(error) || isBookingError(error)) {
      return { kind: "status", title: "Booking", body: error.userMessage };
    }
    throw error;
  }
}

export default async function BookingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const view = await loadView(id);
  if (view.kind === "status") {
    return <SecurityStatusPanel title={view.title} body={view.body} />;
  }
  if (view.kind === "missing") {
    notFound();
  }

  return <BookingDetail booking={view.booking} timeZone={view.timeZone} />;
}
