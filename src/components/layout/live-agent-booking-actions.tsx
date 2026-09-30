import Link from "next/link";

import { ScheduleBookingActionForm } from "@/components/layout/schedule-booking-session";
import { SecurityActionForm } from "@/components/layout/security-action-form";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import {
  liveAgentBookingGuide,
  liveAgentBookingSteps,
} from "@/lib/inquiries/live-agent-next-step";
import { confirmBookingAction, cancelBookingAction } from "@/server/actions/bookings";
import { savePendingBookingAction, startWorkingInquiryAction } from "@/server/actions/live-agent";
import {
  cancelConfirmedBookingConfirm,
  cancelPendingBookingConfirm,
} from "@/lib/ui/destructive-confirm";

const PRIMARY_BUTTON =
  "w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground";
const MUTED_BUTTON =
  "w-full cursor-not-allowed rounded-md border border-border bg-muted px-4 py-2 text-sm font-medium text-foreground/45";

function DisabledStatusButton({ children }: { children: string }) {
  return (
    <button type="button" disabled aria-disabled="true" className={MUTED_BUTTON}>
      {children}
    </button>
  );
}

export function LiveAgentBookingActions({
  inquiryId,
  expectedUpdatedAt,
  booked,
  bookingHref,
  bookingNumber,
  canManage,
  canHold,
  canConfirm,
  assigned,
  needsHold,
  hasHold,
  canPlaceHold,
  needsInventory,
  confirmBlockers,
  resourcesHref = "/app/admin/resources",
  pendingPayment = false,
  paymentConflict = false,
  availabilityChecked = false,
  cancelled = false,
  canCancel = false,
}: {
  inquiryId: string;
  expectedUpdatedAt: string;
  booked: boolean;
  bookingHref?: string | null;
  bookingNumber?: string | null;
  canManage: boolean;
  canHold: boolean;
  canConfirm: boolean;
  assigned: boolean;
  needsHold: boolean;
  hasHold: boolean;
  canPlaceHold: boolean;
  needsInventory: boolean;
  confirmBlockers: string[];
  resourcesHref?: string;
  pendingPayment?: boolean;
  paymentConflict?: boolean;
  availabilityChecked?: boolean;
  cancelled?: boolean;
  canCancel?: boolean;
}) {
  void canHold;
  void needsHold;
  void hasHold;
  void canPlaceHold;
  const guide = liveAgentBookingGuide({
    booked,
    assigned,
    needsInventory,
    confirmBlockers,
    pendingPayment,
    paymentConflict,
    availabilityChecked,
    hasHold: false,
    cancelled,
  });
  const steps = liveAgentBookingSteps();
  const canSubmitConfirm = canConfirm && !booked && !cancelled && confirmBlockers.length === 0 && assigned && !needsInventory;
  const showStartWorking = canManage && !booked && !cancelled && !assigned;
  const showSetupInventory = canManage && !booked && !cancelled && assigned && needsInventory;
  const showWorkingActions = !booked && !cancelled;
  const showCancel = canCancel && (pendingPayment || booked);

  return (
    <section
      id="confirm-booking"
      className="sticky top-0 z-20 mt-6 rounded-md border border-primary/40 bg-background px-4 py-4 shadow-sm"
    >
      {showWorkingActions ? (
      <ol className="flex flex-wrap gap-2 text-xs font-medium">
        {steps.map((step, index) => {
          const current = step.id === guide.currentStepId;
          return (
            <li key={step.id} className={current ? "text-primary" : "text-foreground/45"}>
              {index + 1}. {step.label}
              {index < steps.length - 1 ? (
                <span className="ml-2 text-foreground/30" aria-hidden>
                  →
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>
      ) : null}
      <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">{guide.nextTitle}</h2>
          <p className="mt-1 text-sm text-foreground/70">{guide.nextDetail}</p>
          {paymentConflict ? (
            <p className="mt-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
              Payment received — availability conflict. This booking stays pending.
            </p>
          ) : null}
          {booked && bookingHref && bookingNumber ? (
            <p className="mt-2 text-sm">
              <Link href={bookingHref} className="text-primary">
                Open {bookingNumber}
              </Link>
            </p>
          ) : cancelled && bookingHref && bookingNumber ? (
            <p className="mt-2 text-sm">
              Cancelled booking{" "}
              <Link href={bookingHref} className="text-primary">
                {bookingNumber}
              </Link>
            </p>
          ) : pendingPayment && bookingHref && bookingNumber ? (
            <p className="mt-2 text-sm">
              Pending booking{" "}
              <Link href={bookingHref} className="text-primary">
                {bookingNumber}
              </Link>
            </p>
          ) : null}
        </div>
        {showWorkingActions || showCancel ? (
          <div className="flex w-full shrink-0 flex-col gap-2 sm:w-64">
            {showStartWorking ? (
              <SecurityActionForm
                action={startWorkingInquiryAction}
                notice={{ successTitle: "You are working this inquiry", errorTitle: "Unable to start working" }}
              >
                <input type="hidden" name="inquiryId" value={inquiryId} />
                <PendingSubmitButton pendingLabel="Starting…" className={PRIMARY_BUTTON}>
                  Start Working
                </PendingSubmitButton>
              </SecurityActionForm>
            ) : null}
            {showSetupInventory ? (
              <Link href={resourcesHref} className={`${PRIMARY_BUTTON} text-center`}>
                Set up inventory
              </Link>
            ) : null}
            {canManage && assigned && showWorkingActions && !showStartWorking ? (
              <ScheduleBookingActionForm
                completeKind="pending"
                action={savePendingBookingAction}
                blocking
                blockingLabel="Saving pending booking…"
                notice={{ successTitle: "Pending booking saved", errorTitle: "Unable to save pending booking" }}
              >
                <input type="hidden" name="inquiryId" value={inquiryId} />
                <PendingSubmitButton
                  pendingLabel="Saving…"
                  className="w-full cursor-pointer rounded-md border border-border px-4 py-2 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed"
                >
                  Save Pending Booking
                </PendingSubmitButton>
              </ScheduleBookingActionForm>
            ) : null}
            {showWorkingActions ? (
              canSubmitConfirm ? (
                <ScheduleBookingActionForm
                  completeKind="confirmed"
                  action={confirmBookingAction}
                  blocking
                  blockingLabel="Confirming the booking…"
                  notice={{ successTitle: "Booking confirmed", errorTitle: "Unable to confirm booking" }}
                  confirm={{
                    title: "Confirm payment and booking?",
                    description:
                      "Use this only after the required payment has been received outside MagicCRM. MagicCRM will recheck availability and allocate the required resources. This will create a confirmed booking on the Master Schedule.",
                    confirmLabel: "Confirm Payment & Book",
                    confirmPendingLabel: "Confirming…",
                  }}
                >
                  <input type="hidden" name="inquiryId" value={inquiryId} />
                  <input type="hidden" name="expectedUpdatedAt" value={expectedUpdatedAt} />
                  <PendingSubmitButton pendingLabel="Confirming…" className={PRIMARY_BUTTON}>
                    Confirm Payment & Book
                  </PendingSubmitButton>
                </ScheduleBookingActionForm>
              ) : (
                <DisabledStatusButton>Confirm Payment & Book</DisabledStatusButton>
              )
            ) : null}
            {showCancel ? (
              <SecurityActionForm
                action={cancelBookingAction}
                notice={{ successTitle: "Booking cancelled", errorTitle: "Unable to cancel booking" }}
                confirm={booked ? cancelConfirmedBookingConfirm() : cancelPendingBookingConfirm()}
              >
                <input type="hidden" name="inquiryId" value={inquiryId} />
                <PendingSubmitButton
                  pendingLabel="Cancelling…"
                  className="w-full rounded-md border border-destructive/40 px-4 py-2 text-sm font-medium text-destructive"
                >
                  Cancel Booking
                </PendingSubmitButton>
              </SecurityActionForm>
            ) : null}
            {showWorkingActions && !canConfirm ? (
              <p className="text-xs text-foreground/55">You need permission to confirm bookings.</p>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
