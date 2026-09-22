import Link from "next/link";

import { SecurityActionForm } from "@/components/layout/security-action-form";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import { formatEventLocalTime, formatOrganizationTimestamp } from "@/lib/inquiries/tenant-datetime";
import { reservationCoversSlot, reservationStartsInSlot } from "@/lib/resources/schedule-cells";
import { minutesToClock } from "@/server/resources/time-window";
import { releaseHoldAction } from "@/server/actions/resource-schedule";
import { scheduleDisplayName } from "@/server/services/resource-schedule-service";
import { RESOURCE_RESERVATION_STATUSES } from "@/types/resource-schedule";

type ScheduleReservation = {
  id: string;
  resourceId: string;
  status: string;
  startMinute: number;
  endMinute: number;
  inquiryId: string | null;
  expiresAt?: Date | null;
  bookingId?: string | null;
  inquiry: {
    id: string;
    customerGroupName: string | null;
    customerFirstName: string | null;
    customerLastName: string | null;
  } | null;
  booking?: {
    id: string;
    bookingNumber: string;
    customerGroupName: string | null;
    customerFirstName: string | null;
    customerLastName: string | null;
  } | null;
};

export function MasterScheduleGrid({
  date,
  resources,
  reservations,
  slotMinutes,
  startMinute,
  endMinute,
  canHold,
  canRelease,
  timeZone,
  prefillResourceId,
  prefillStart,
}: {
  date: string;
  resourceTypeId: string;
  resources: Array<{ id: string; name: string }>;
  reservations: ScheduleReservation[];
  slotMinutes: number;
  startMinute: number;
  endMinute: number;
  canHold: boolean;
  canRelease: boolean;
  timeZone: string;
  prefillResourceId?: string;
  prefillStart?: string;
}) {
  void date;
  void canHold;
  void prefillResourceId;
  void prefillStart;
  const slots: number[] = [];
  for (let minute = startMinute; minute < endMinute; minute += slotMinutes) {
    slots.push(minute);
  }

  function covering(resourceId: string, slotStart: number) {
    return reservations.find(
      (row) =>
        row.resourceId === resourceId &&
        reservationCoversSlot({
          startMinute: row.startMinute,
          endMinute: row.endMinute,
          slotStart,
          slotMinutes,
        }),
    );
  }

  return (
    <div className="mt-6 overflow-x-auto">
      <table className="min-w-full border-collapse text-xs">
        <thead>
          <tr>
            <th className="sticky left-0 bg-background px-2 py-2 text-left font-medium">Time</th>
            {resources.map((resource) => (
              <th key={resource.id} className="min-w-[7.5rem] px-2 py-2 text-left font-medium">
                {resource.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {slots.map((slot) => (
            <tr key={slot} className="border-t border-border">
              <th className="sticky left-0 bg-background px-2 py-2 text-left font-normal text-foreground/70">
                {formatEventLocalTime(minutesToClock(slot))}
              </th>
              {resources.map((resource) => {
                const reservation = covering(resource.id, slot);
                if (!reservation) {
                  return (
                    <td key={resource.id} className="px-1 py-1">
                      <span className="block rounded-sm bg-muted/70 px-2 py-2 text-foreground/70">Available</span>
                    </td>
                  );
                }
                const isStart = reservationStartsInSlot({
                  startMinute: reservation.startMinute,
                  slotStart: slot,
                  slotMinutes,
                });
                const isHold = reservation.status === RESOURCE_RESERVATION_STATUSES.HOLD;
                const label = scheduleDisplayName(reservation.booking ?? reservation.inquiry);
                const range = `${formatEventLocalTime(minutesToClock(reservation.startMinute))}–${formatEventLocalTime(minutesToClock(reservation.endMinute))}`;
                const bookingHref = reservation.booking?.id
                  ? `/app/bookings/${reservation.booking.id}`
                  : reservation.bookingId
                    ? `/app/bookings/${reservation.bookingId}`
                    : null;
                return (
                  <td key={resource.id} className="px-1 py-1">
                    <div
                      className={`rounded-sm px-2 py-2 ${isHold ? "bg-warning/20 text-foreground" : "bg-primary/15 text-foreground"}`}
                    >
                      {isStart ? (
                        <>
                          <p className="font-medium">{isHold ? "Legacy Hold" : "Confirmed"}</p>
                          <p>{label}</p>
                          {reservation.booking?.bookingNumber ? (
                            <p className="text-foreground/60">{reservation.booking.bookingNumber}</p>
                          ) : null}
                          <p className="text-foreground/60">{range}</p>
                          {isHold && reservation.expiresAt ? (
                            <p className="text-foreground/60">
                              Held until {formatOrganizationTimestamp(reservation.expiresAt, timeZone)}
                            </p>
                          ) : null}
                          {bookingHref ? (
                            <Link href={bookingHref} className="text-primary">
                              Open booking
                            </Link>
                          ) : reservation.inquiryId ? (
                            <Link href={`/app/inquiries/${reservation.inquiryId}`} className="text-primary">
                              Open inquiry
                            </Link>
                          ) : null}
                          {bookingHref && reservation.inquiryId ? (
                            <Link href={`/app/inquiries/${reservation.inquiryId}`} className="ml-2 text-primary">
                              Original inquiry
                            </Link>
                          ) : null}
                          {canRelease && isHold ? (
                            <SecurityActionForm
                              action={releaseHoldAction}
                              className="mt-1"
                              notice={{ successTitle: "Hold released", errorTitle: "Unable to release hold" }}
                              confirm={{
                                title: "Release this hold?",
                                description: "The resource will become available immediately.",
                                confirmLabel: "Release hold",
                              }}
                            >
                              <input type="hidden" name="reservationId" value={reservation.id} />
                              {reservation.inquiryId ? (
                                <input type="hidden" name="inquiryId" value={reservation.inquiryId} />
                              ) : null}
                              <PendingSubmitButton
                                pendingLabel="Releasing…"
                                className="text-xs font-medium text-primary"
                              >
                                Release
                              </PendingSubmitButton>
                            </SecurityActionForm>
                          ) : null}
                        </>
                      ) : (
                        <span className="text-foreground/50">Continues</span>
                      )}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
