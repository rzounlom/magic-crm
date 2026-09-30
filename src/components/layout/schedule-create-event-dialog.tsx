"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";

import { EmployeeBookingBuilder, type EmployeeBookingScheduleHint } from "@/components/layout/employee-manual-booking-form";
import { ScheduleBookingRecordLinks } from "@/components/layout/schedule-booking-record-links";
import {
  ScheduleBookingSessionProvider,
  type ScheduleBookingCompletion,
} from "@/components/layout/schedule-booking-session";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { bookingCompletionCopy, scheduleStartHint } from "@/lib/resources/schedule-board";
import { minutesToClock } from "@/server/resources/time-window";

const CONTROL =
  "cursor-pointer rounded-md px-3 py-2 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed";

export type ScheduleCreateLaunch = {
  startMinute: number | null;
  resourceName: string | null;
};

export function ScheduleCreateEventDialog({
  open,
  date,
  locationId,
  launch,
  locations,
  attractions,
  defaultLocationId,
  review,
  outcome,
  inquiryId,
  bookingId,
  onClose,
  onCreated,
  onComplete,
}: {
  open: boolean;
  date: string;
  locationId: string | null;
  launch: ScheduleCreateLaunch | null;
  locations: Array<{ id: string; name: string }>;
  attractions: Array<{ id: string; name: string }>;
  defaultLocationId: string | null;
  review?: ReactNode;
  outcome: { kind: ScheduleBookingCompletion } | null;
  inquiryId?: string | null;
  bookingId?: string | null;
  onClose: () => void;
  onCreated: (href: string) => "stay" | void;
  onComplete: (kind: ScheduleBookingCompletion, message: string) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const dirtyRef = useRef(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const titleId = useId();
  const descriptionId = useId();
  const showingReview = review != null;
  const slotStart = launch?.startMinute == null ? null : minutesToClock(launch.startMinute);
  const slotHint = launch?.resourceName ? scheduleStartHint(launch.resourceName, slotStart) : null;
  const hint: EmployeeBookingScheduleHint = launch?.resourceName
    ? {
        date,
        startTime: slotStart ?? undefined,
        locationId: locationId ?? undefined,
      }
    : {
        date,
        locationId: locationId ?? undefined,
        chooseStartTime: true,
      };
  const subtitle = showingReview
    ? "Review the plan, save a pending booking, or confirm payment. You stay on this schedule."
    : (slotHint ??
      "Date and location come from this schedule. Choose a start time and the customer details. Nothing is reserved yet.");

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }
    if (open) {
      if (!dialog.open) {
        dialog.showModal();
      }
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
    if (dialog.open) {
      dialog.close();
    }
    document.body.style.overflow = "";
    dirtyRef.current = false;
    return undefined;
  }, [open]);

  function requestClose() {
    if (!showingReview && dirtyRef.current) {
      setDiscardOpen(true);
      return;
    }
    setDiscardOpen(false);
    onClose();
  }

  if (!open) {
    return null;
  }

  return (
    <>
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        data-create-event-dialog
        className="fixed inset-0 m-0 h-dvh max-h-dvh w-full max-w-none rounded-none border-0 bg-background p-0 text-foreground backdrop:bg-foreground/40 md:inset-auto md:top-1/2 md:left-1/2 md:h-auto md:max-h-[calc(100dvh-2rem)] md:w-[min(68rem,calc(100vw-2rem))] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-lg md:border md:border-border md:shadow-lg"
        onCancel={(event) => {
          event.preventDefault();
          requestClose();
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            requestClose();
          }
        }}
      >
        <div className="flex h-dvh max-h-dvh flex-col md:h-auto md:max-h-[calc(100dvh-2rem)]">
          <header className="shrink-0 border-b border-border px-4 py-4 md:px-6 md:py-5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h2 id={titleId} className="text-2xl font-semibold tracking-tight">
                  Create Event
                </h2>
                <p
                  id={descriptionId}
                  data-schedule-hint={slotHint ? true : undefined}
                  className="mt-2 max-w-2xl text-sm text-foreground/70"
                >
                  {subtitle}
                </p>
              </div>
              <button type="button" className={`${CONTROL} border border-border`} onClick={requestClose}>
                {outcome ? "Done" : "Close"}
              </button>
            </div>
            {outcome ? (
              <p role="status" className="mt-3 rounded-md bg-muted px-3 py-2 text-sm text-foreground/80">
                {bookingCompletionCopy(outcome.kind)}
              </p>
            ) : null}
            <div className="mt-3">
              <ScheduleBookingRecordLinks inquiryId={inquiryId} bookingId={bookingId} />
            </div>
          </header>
          <div
            className="public-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 md:px-6 md:py-5"
            onInput={() => {
              dirtyRef.current = true;
            }}
          >
            <ScheduleBookingSessionProvider onComplete={onComplete}>
              {showingReview ? (
                review
              ) : (
                <EmployeeBookingBuilder
                  locations={locations}
                  attractions={attractions}
                  defaultLocationId={defaultLocationId}
                  scheduleHint={hint}
                  layout="schedule"
                  onCreated={onCreated}
                />
              )}
            </ScheduleBookingSessionProvider>
          </div>
        </div>
      </dialog>
      <ConfirmDialog
        open={discardOpen}
        title="Discard this event?"
        description="Closing now discards the details you entered. No booking is created."
        confirmLabel="Discard"
        onCancel={() => setDiscardOpen(false)}
        onConfirm={() => {
          dirtyRef.current = false;
          setDiscardOpen(false);
          onClose();
        }}
      />
    </>
  );
}
