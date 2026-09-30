"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import { SecurityActionForm } from "@/components/layout/security-action-form";
import { ScheduleCreateEventDialog } from "@/components/layout/schedule-create-event-dialog";
import type { ScheduleBookingCompletion } from "@/components/layout/schedule-booking-session";
import { EmptyState } from "@/components/ui/empty-state";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import { formatEventLocalTime, formatOrganizationTimestamp } from "@/lib/inquiries/tenant-datetime";
import {
  SCHEDULE_FOCUS_ALL,
  SCHEDULE_FOCUS_BOOKED,
  SCHEDULE_FOCUS_HOLDS,
  blockPlacement,
  inquiryIdFromBuilderRedirect,
  occupancyCount,
  occupancySummary,
  scheduleDisplayName,
  schedulePath,
} from "@/lib/resources/schedule-board";
import { releaseHoldAction } from "@/server/actions/resource-schedule";
import { minutesToClock } from "@/server/resources/time-window";
import { RESOURCE_RESERVATION_STATUSES } from "@/types/resource-schedule";

const SLOT_WIDTH = 72;
const CONTROL = "cursor-pointer disabled:cursor-not-allowed";

export type ScheduleBoardResource = {
  id: string;
  name: string;
  resourceTypeId: string;
};

export type ScheduleBoardReservation = {
  id: string;
  resourceId: string;
  status: string;
  startMinute: number;
  endMinute: number;
  inquiryId: string | null;
  bookingId: string | null;
  expiresAt: string | null;
  inquiry: {
    id: string;
    customerGroupName: string | null;
    customerFirstName: string | null;
    customerLastName: string | null;
    eventType: string | null;
    guestCount: number | null;
    customerNotes: string | null;
    selectedEventPlanId: string | null;
  } | null;
  booking: {
    id: string;
    bookingNumber: string;
    customerGroupName: string | null;
    customerFirstName: string | null;
    customerLastName: string | null;
    guestCount: number | null;
    selectedEventPlanId: string | null;
  } | null;
};

type Group = {
  id: string;
  name: string;
  resources: ScheduleBoardResource[];
};

type CreateContext = {
  startMinute: number | null;
  resource: ScheduleBoardResource | null;
};

export function MasterScheduleBoard({
  date,
  focus,
  locationId,
  groups,
  reservations,
  slotMinutes,
  startMinute,
  endMinute,
  canCreate,
  canRelease,
  timeZone,
  bookingCatalog = null,
  review = null,
  builderInquiryId = null,
}: {
  date: string;
  focus: string;
  locationId: string | null;
  groups: Group[];
  reservations: ScheduleBoardReservation[];
  slotMinutes: number;
  startMinute: number;
  endMinute: number;
  canCreate: boolean;
  canRelease: boolean;
  timeZone: string;
  bookingCatalog?: {
    locations: Array<{ id: string; name: string }>;
    attractions: Array<{ id: string; name: string }>;
    defaultLocationId: string | null;
  } | null;
  review?: ReactNode;
  builderInquiryId?: string | null;
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const [detail, setDetail] = useState<ScheduleBoardReservation | null>(null);
  const [createContext, setCreateContext] = useState<CreateContext | null>(null);
  const [outcome, setOutcome] = useState<{ kind: ScheduleBookingCompletion } | null>(null);
  const slots: number[] = [];
  for (let minute = startMinute; minute < endMinute; minute += slotMinutes) {
    slots.push(minute);
  }
  const timelineWidth = slots.length * SLOT_WIDTH;
  const visibleGroups =
    focus === SCHEDULE_FOCUS_ALL || focus === SCHEDULE_FOCUS_HOLDS || focus === SCHEDULE_FOCUS_BOOKED
      ? groups
      : groups.filter((group) => group.id === focus);
  const visibleReservations = reservations.filter((row) => {
    if (focus === SCHEDULE_FOCUS_HOLDS) {
      return row.status === RESOURCE_RESERVATION_STATUSES.HOLD;
    }
    if (focus === SCHEDULE_FOCUS_BOOKED) {
      return row.status === RESOURCE_RESERVATION_STATUSES.BOOKED;
    }
    if (focus !== SCHEDULE_FOCUS_ALL) {
      const group = groups.find((item) => item.id === focus);
      return group?.resources.some((resource) => resource.id === row.resourceId) ?? false;
    }
    return true;
  });

  const bookingOpen = canCreate && (createContext !== null || review != null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }
    if (detail) {
      if (!dialog.open) {
        dialog.showModal();
      }
    } else if (dialog.open) {
      dialog.close();
    }
  }, [detail]);

  function closeDialog() {
    setDetail(null);
  }

  const finishCreate = useCallback(() => {
    setCreateContext(null);
    setOutcome(null);
    if (review != null || builderInquiryId) {
      router.replace(schedulePath({ date, focus }), { scroll: false });
    }
    const opener = openerRef.current;
    openerRef.current = null;
    opener?.focus();
  }, [builderInquiryId, date, focus, review, router]);

  const handleCreated = useCallback(
    (href: string) => {
      const inquiryId = inquiryIdFromBuilderRedirect(href);
      if (!inquiryId) {
        return "stay" as const;
      }
      router.replace(schedulePath({ date, focus, builder: inquiryId }), { scroll: false });
      return "stay" as const;
    },
    [date, focus, router],
  );

  const handleComplete = useCallback((kind: ScheduleBookingCompletion) => {
    setOutcome({ kind });
  }, []);

  function setFocus(next: string) {
    const params = new URLSearchParams({ date });
    if (next !== SCHEDULE_FOCUS_ALL) {
      params.set("focus", next);
    }
    router.push(`/app/schedule?${params.toString()}`);
  }

  function openCreate(context: CreateContext) {
    if (!canCreate || !bookingCatalog) {
      return;
    }
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setDetail(null);
    setOutcome(null);
    setCreateContext(context);
  }

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center gap-2">
        <FilterButton pressed={focus === SCHEDULE_FOCUS_ALL} onClick={() => setFocus(SCHEDULE_FOCUS_ALL)}>
          All resources
        </FilterButton>
        {groups.map((group) => (
          <FilterButton key={group.id} pressed={focus === group.id} onClick={() => setFocus(group.id)}>
            {group.name}
          </FilterButton>
        ))}
        <FilterButton pressed={focus === SCHEDULE_FOCUS_HOLDS} onClick={() => setFocus(SCHEDULE_FOCUS_HOLDS)}>
          Holds
        </FilterButton>
        <FilterButton pressed={focus === SCHEDULE_FOCUS_BOOKED} onClick={() => setFocus(SCHEDULE_FOCUS_BOOKED)}>
          Booked
        </FilterButton>
        {canCreate ? (
          <button
            type="button"
            className={`${CONTROL} ml-auto rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground`}
            onClick={() => openCreate({ startMinute: null, resource: null })}
          >
            + Create Event
          </button>
        ) : null}
      </div>
      <ul className="mt-4 flex flex-wrap gap-2">
        {groups.map((group) => {
          const count = occupancyCount(
            group.resources.map((resource) => resource.id),
            reservations.filter((row) => group.resources.some((resource) => resource.id === row.resourceId)).map((row) => row.resourceId),
          );
          return (
            <li key={group.id} className="rounded-full bg-surface px-3 py-1.5 text-xs font-medium text-foreground/80 shadow-sm">
              {occupancySummary(group.name, count.occupied, count.total)}
            </li>
          );
        })}
      </ul>
      {visibleReservations.length === 0 ? (
        <EmptyState title="No scheduled events for this day." />
      ) : null}

      <div className="public-scroll mt-4 hidden max-w-full overflow-x-auto md:block">
        <div style={{ minWidth: timelineWidth + 176 }}>
          <div className="flex">
            <div className="sticky left-0 z-20 w-44 shrink-0 bg-background" />
            <div className="relative h-8" style={{ width: timelineWidth }}>
              {slots.map((slot) => (
                <span
                  key={slot}
                  className="absolute top-1 text-[11px] text-foreground/60"
                  style={{ left: ((slot - startMinute) / slotMinutes) * SLOT_WIDTH }}
                >
                  {formatEventLocalTime(minutesToClock(slot))}
                </span>
              ))}
            </div>
          </div>
          {visibleGroups.map((group) => (
            <div key={group.id}>
              <p className="sticky left-0 mt-3 bg-background py-1 text-xs font-semibold tracking-wide text-foreground/70 uppercase">
                {group.name}
              </p>
              {group.resources.map((resource, index) => (
                <div
                  key={resource.id}
                  className={`flex border-t border-border/60 ${index % 2 === 1 ? "bg-muted/50" : "bg-surface"}`}
                >
                  <div
                    className={`sticky left-0 z-20 flex w-44 shrink-0 items-center pr-3 text-sm ${
                      index % 2 === 1 ? "bg-muted" : "bg-surface"
                    }`}
                  >
                    {resource.name}
                  </div>
                  <div className="relative h-12" style={{ width: timelineWidth }}>
                    {slots.map((slot) =>
                      canCreate ? (
                        <button
                          key={slot}
                          type="button"
                          aria-label={`Start an event at ${formatEventLocalTime(minutesToClock(slot))} on ${resource.name}`}
                          className={`${CONTROL} absolute inset-y-1 rounded-md hover:bg-primary/10`}
                          style={{ left: ((slot - startMinute) / slotMinutes) * SLOT_WIDTH, width: SLOT_WIDTH }}
                          onClick={() =>
                            openCreate({
                              startMinute: slot,
                              resource,
                            })
                          }
                        />
                      ) : (
                        <span
                          key={slot}
                          className="absolute inset-y-1"
                          style={{ left: ((slot - startMinute) / slotMinutes) * SLOT_WIDTH, width: SLOT_WIDTH }}
                        />
                      ),
                    )}
                    {visibleReservations
                      .filter((row) => row.resourceId === resource.id)
                      .map((row) => {
                        const place = blockPlacement({
                          startMinute: row.startMinute,
                          endMinute: row.endMinute,
                          dayStart: startMinute,
                          dayEnd: endMinute,
                          slotMinutes,
                          slotWidth: SLOT_WIDTH,
                        });
                        if (!place) {
                          return null;
                        }
                        const hold = row.status === RESOURCE_RESERVATION_STATUSES.HOLD;
                        return (
                          <button
                            key={row.id}
                            type="button"
                            className={`${CONTROL} absolute inset-y-1 z-10 overflow-hidden rounded-md border px-2 text-left text-xs ${
                              hold
                                ? "border-warning bg-warning/25 text-foreground"
                                : "border-primary/60 bg-primary/15 text-foreground"
                            }`}
                            style={{ left: place.left, width: Math.max(place.width - 4, 28) }}
                            onClick={() => {
                              setCreateContext(null);
                              setDetail(row);
                            }}
                          >
                            <span className="block truncate font-medium">{hold ? "Hold" : "Booked"}</span>
                            <span className="block truncate">{scheduleDisplayName(row.booking ?? row.inquiry)}</span>
                          </button>
                        );
                      })}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      <ul className="mt-4 space-y-2 md:hidden">
        {visibleReservations.map((row) => {
          const resource = groups.flatMap((group) => group.resources).find((item) => item.id === row.resourceId);
          const hold = row.status === RESOURCE_RESERVATION_STATUSES.HOLD;
          return (
            <li key={row.id}>
              <button
                type="button"
                className={`${CONTROL} w-full rounded-2xl border px-3 py-3 text-left text-sm shadow-sm ${
                  hold ? "border-warning bg-warning/20" : "border-primary/40 bg-primary/10"
                }`}
                onClick={() => {
                  setCreateContext(null);
                  setDetail(row);
                }}
              >
                <span className="font-medium">{hold ? "Hold" : "Booked"}</span>
                <span className="mt-1 block">{scheduleDisplayName(row.booking ?? row.inquiry)}</span>
                <span className="mt-1 block text-foreground/70">
                  {formatEventLocalTime(minutesToClock(row.startMinute))}–{formatEventLocalTime(minutesToClock(row.endMinute))}
                  {resource ? ` · ${resource.name}` : ""}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <dialog
        ref={dialogRef}
        className="w-[min(32rem,calc(100%-2rem))] rounded-lg border border-border bg-background p-0 text-foreground backdrop:bg-foreground/40"
        onClose={closeDialog}
      >
        <div className="p-5">
          {detail ? (
            <ReservationDetail
              reservation={detail}
              resourceName={
                groups.flatMap((group) => group.resources).find((resource) => resource.id === detail.resourceId)?.name ??
                "Resource"
              }
              timeZone={timeZone}
              canRelease={canRelease}
              onClose={closeDialog}
            />
          ) : null}
        </div>
      </dialog>
      {canCreate && bookingCatalog ? (
        <ScheduleCreateEventDialog
          open={bookingOpen}
          date={date}
          locationId={locationId}
          launch={
            createContext
              ? { startMinute: createContext.startMinute, resourceName: createContext.resource?.name ?? null }
              : null
          }
          locations={bookingCatalog.locations}
          attractions={bookingCatalog.attractions}
          defaultLocationId={bookingCatalog.defaultLocationId}
          review={review}
          outcome={outcome}
          inquiryId={builderInquiryId}
          onClose={finishCreate}
          onCreated={handleCreated}
          onComplete={handleComplete}
        />
      ) : null}
    </div>
  );
}

function FilterButton({
  pressed,
  onClick,
  children,
}: {
  pressed: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      className={`${CONTROL} rounded-full px-3 py-1.5 text-sm font-semibold ${
        pressed ? "bg-primary text-primary-foreground" : "bg-surface text-foreground shadow-sm"
      }`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function ReservationDetail({
  reservation,
  resourceName,
  timeZone,
  canRelease,
  onClose,
}: {
  reservation: ScheduleBoardReservation;
  resourceName: string;
  timeZone: string;
  canRelease: boolean;
  onClose: () => void;
}) {
  const hold = reservation.status === RESOURCE_RESERVATION_STATUSES.HOLD;
  const party = reservation.booking ?? reservation.inquiry;
  const guestCount = reservation.booking?.guestCount ?? reservation.inquiry?.guestCount;
  const bookingHref = reservation.booking?.id ? `/app/bookings/${reservation.booking.id}` : null;
  return (
    <div>
      <p className="text-xs font-semibold tracking-wide text-foreground/60 uppercase">{hold ? "Hold" : "Booked"}</p>
      <h2 className="mt-1 text-lg font-semibold">{scheduleDisplayName(party)}</h2>
      <dl className="mt-4 space-y-2 text-sm">
        <div>
          <dt className="text-foreground/60">Resource</dt>
          <dd>{resourceName}</dd>
        </div>
        <div>
          <dt className="text-foreground/60">Time</dt>
          <dd>
            {formatEventLocalTime(minutesToClock(reservation.startMinute))}–
            {formatEventLocalTime(minutesToClock(reservation.endMinute))}
          </dd>
        </div>
        {reservation.inquiry?.eventType ? (
          <div>
            <dt className="text-foreground/60">Event</dt>
            <dd>{reservation.inquiry.eventType}</dd>
          </div>
        ) : null}
        {guestCount ? (
          <div>
            <dt className="text-foreground/60">Guests</dt>
            <dd>{guestCount}</dd>
          </div>
        ) : null}
        {hold && reservation.expiresAt ? (
          <div>
            <dt className="text-foreground/60">Hold expires</dt>
            <dd>{formatOrganizationTimestamp(new Date(reservation.expiresAt), timeZone)}</dd>
          </div>
        ) : null}
        {reservation.booking?.bookingNumber ? (
          <div>
            <dt className="text-foreground/60">Booking</dt>
            <dd>{reservation.booking.bookingNumber}</dd>
          </div>
        ) : null}
        {reservation.inquiry?.customerNotes ? (
          <div>
            <dt className="text-foreground/60">Notes</dt>
            <dd>{reservation.inquiry.customerNotes}</dd>
          </div>
        ) : null}
      </dl>
      <div className="mt-5 flex flex-wrap gap-3 text-sm">
        {reservation.inquiryId ? (
          <Link href={`/app/inquiries/${reservation.inquiryId}`} className={`${CONTROL} font-medium text-primary`}>
            Open inquiry
          </Link>
        ) : null}
        {bookingHref ? (
          <Link href={bookingHref} className={`${CONTROL} font-medium text-primary`}>
            Open booking
          </Link>
        ) : null}
        <button type="button" className={`${CONTROL} text-foreground/70`} onClick={onClose}>
          Close
        </button>
      </div>
      {canRelease && hold ? (
        <SecurityActionForm
          action={releaseHoldAction}
          className="mt-4"
          notice={{ successTitle: "Hold released", errorTitle: "Unable to release hold" }}
          confirm={{
            title: "Release this hold?",
            description: "The resource will become available immediately.",
            confirmLabel: "Release hold",
          }}
        >
          <input type="hidden" name="reservationId" value={reservation.id} />
          {reservation.inquiryId ? <input type="hidden" name="inquiryId" value={reservation.inquiryId} /> : null}
          <PendingSubmitButton pendingLabel="Releasing…" className={`${CONTROL} text-sm font-medium text-primary`}>
            Expire hold now
          </PendingSubmitButton>
        </SecurityActionForm>
      ) : null}
    </div>
  );
}
