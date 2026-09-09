import Link from "next/link";

import { SecurityActionForm } from "@/components/layout/security-action-form";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import { formatEventLocalTime } from "@/lib/inquiries/tenant-datetime";
import { minutesToClock } from "@/server/resources/time-window";
import { placeManualHoldAction, releaseHoldAction } from "@/server/actions/resource-schedule";
import { scheduleDisplayName } from "@/server/services/resource-schedule-service";
import { RESOURCE_RESERVATION_STATUSES } from "@/types/resource-schedule";

type ScheduleReservation = {
  id: string;
  resourceId: string;
  status: string;
  startMinute: number;
  endMinute: number;
  inquiryId: string | null;
  inquiry: {
    id: string;
    customerGroupName: string | null;
    customerFirstName: string | null;
    customerLastName: string | null;
  } | null;
};

export function MasterScheduleGrid({
  date,
  resourceTypeId,
  resources,
  reservations,
  slotMinutes,
  startMinute,
  endMinute,
  canHold,
  canRelease,
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
  prefillResourceId?: string;
  prefillStart?: string;
}) {
  const slots: number[] = [];
  for (let minute = startMinute; minute < endMinute; minute += slotMinutes) {
    slots.push(minute);
  }

  function covering(resourceId: string, slotStart: number) {
    return reservations.find(
      (row) =>
        row.resourceId === resourceId &&
        row.startMinute < slotStart + slotMinutes &&
        slotStart < row.endMinute,
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
                  const href = `/app/schedule?date=${date}&type=${resourceTypeId}&resource=${resource.id}&start=${minutesToClock(slot)}`;
                  return (
                    <td key={resource.id} className="px-1 py-1">
                      {canHold ? (
                        <Link href={href} className="block rounded-sm bg-muted/70 px-2 py-2 text-foreground/70 hover:bg-muted">
                          Available
                        </Link>
                      ) : (
                        <span className="block rounded-sm bg-muted/70 px-2 py-2 text-foreground/70">Available</span>
                      )}
                    </td>
                  );
                }
                const isStart = reservation.startMinute >= slot && reservation.startMinute < slot + slotMinutes;
                const isHold = reservation.status === RESOURCE_RESERVATION_STATUSES.HOLD;
                const label = scheduleDisplayName(reservation.inquiry);
                const range = `${formatEventLocalTime(minutesToClock(reservation.startMinute))}–${formatEventLocalTime(minutesToClock(reservation.endMinute))}`;
                return (
                  <td key={resource.id} className="px-1 py-1">
                    <div
                      className={`rounded-sm px-2 py-2 ${isHold ? "bg-warning/20 text-foreground" : "bg-primary/15 text-foreground"}`}
                    >
                      {isStart ? (
                        <>
                          <p className="font-medium">{isHold ? "HOLD" : "BOOKED"}</p>
                          <p>{label}</p>
                          <p className="text-foreground/60">{range}</p>
                          {reservation.inquiryId ? (
                            <Link href={`/app/inquiries/${reservation.inquiryId}`} className="text-primary">
                              Open inquiry
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
                        <span className="text-foreground/50">{isHold ? "HOLD" : "BOOKED"}</span>
                      )}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {canHold && resources.length > 0 ? (
        <SecurityActionForm
          action={placeManualHoldAction}
          className="mt-8 max-w-lg space-y-3 rounded-md border border-border px-4 py-4"
          notice={{ successTitle: "Hold placed", errorTitle: "Unable to place hold" }}
        >
          <p className="text-sm font-medium">Place a temporary HOLD</p>
          <input type="hidden" name="date" value={date} />
          <label className="block text-sm">
            <span className="text-foreground/70">Resource</span>
            <select
              name="resourceId"
              defaultValue={prefillResourceId ?? resources[0]?.id}
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"
            >
              {resources.map((resource) => (
                <option key={resource.id} value={resource.id}>
                  {resource.name}
                </option>
              ))}
            </select>
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="text-foreground/70">Start</span>
              <input
                name="startTime"
                type="time"
                required
                defaultValue={prefillStart ?? "16:00"}
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              <span className="text-foreground/70">End</span>
              <input
                name="endTime"
                type="time"
                required
                defaultValue="17:00"
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"
              />
            </label>
          </div>
          <label className="block text-sm">
            <span className="text-foreground/70">Inquiry ID (optional)</span>
            <input name="inquiryId" className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2" />
          </label>
          <label className="block text-sm">
            <span className="text-foreground/70">Reason</span>
            <input name="reason" defaultValue="Staff hold" className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2" />
          </label>
          <label className="block text-sm">
            <span className="text-foreground/70">Hold hours</span>
            <input
              name="holdHours"
              type="number"
              min={1}
              defaultValue={24}
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"
            />
          </label>
          <PendingSubmitButton
            pendingLabel="Holding…"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Place hold
          </PendingSubmitButton>
        </SecurityActionForm>
      ) : null}
    </div>
  );
}
