import type { Prisma } from "@/generated/prisma/client";

import { resolveOrganizationTimeZone } from "@/lib/inquiries/tenant-datetime";
import { BOOKING_STATUSES } from "@/types/booking";
import { INQUIRY_LIST_VIEWS, type InquiryListView } from "@/types/inquiry";

/** Confirmed commercial events. Cancelled and pending-payment bookings are not historical completions. */
export const HISTORICAL_BOOKING_STATUSES = [
  BOOKING_STATUSES.CONFIRMED,
  BOOKING_STATUSES.COMPLETED,
] as const;

export function tenantCalendarDate(timeZone: string | null | undefined, now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: resolveOrganizationTimeZone(timeZone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/**
 * A confirmed or completed booking is historical when its authoritative UTC end
 * is at or before server now. Legacy rows without `endsAt` fall back to the
 * event calendar date being strictly before today in the organization timezone.
 * Same-day legacy rows stay in the active queue. Cancelled and pending bookings
 * are never historical completions.
 */
export function bookingEventHasEnded(input: {
  status: string;
  endsAt?: Date | null;
  eventDate?: Date | string | null;
  timeZone?: string | null;
  now?: Date;
}): boolean {
  if (
    input.status !== BOOKING_STATUSES.CONFIRMED &&
    input.status !== BOOKING_STATUSES.COMPLETED
  ) {
    return false;
  }
  const now = input.now ?? new Date();
  if (input.endsAt) {
    return input.endsAt.getTime() <= now.getTime();
  }
  const stamp = calendarStamp(input.eventDate);
  if (!stamp) {
    return false;
  }
  return stamp < tenantCalendarDate(input.timeZone, now);
}

export function historicalConfirmedBookingWhere(
  now: Date,
  timeZone: string | null | undefined,
): Prisma.BookingWhereInput {
  const todayStart = new Date(`${tenantCalendarDate(timeZone, now)}T00:00:00.000Z`);
  return {
    status: { in: [...HISTORICAL_BOOKING_STATUSES] },
    OR: [{ endsAt: { lte: now } }, { endsAt: null, eventDate: { lt: todayStart } }],
  };
}

export function inquiryListWhere(input: {
  organizationId: string;
  view: InquiryListView;
  now?: Date;
  timeZone?: string | null;
}): Prisma.InquiryWhereInput {
  const now = input.now ?? new Date();
  const historical = historicalConfirmedBookingWhere(now, input.timeZone);
  if (input.view === INQUIRY_LIST_VIEWS.ARCHIVED) {
    return {
      organizationId: input.organizationId,
      OR: [{ archivedAt: { not: null } }, { bookings: { some: historical } }],
    };
  }
  return {
    organizationId: input.organizationId,
    archivedAt: null,
    NOT: { bookings: { some: historical } },
  };
}

function calendarStamp(value: Date | string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  if (typeof value === "string") {
    return value.slice(0, 10);
  }
  return value.toISOString().slice(0, 10);
}
