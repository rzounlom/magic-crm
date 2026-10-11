import Link from "next/link";
import type { ReactNode } from "react";

import { ScheduleBookingActionForm } from "@/components/layout/schedule-booking-session";
import { SecurityActionForm } from "@/components/layout/security-action-form";
import { buttonClassName } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import {
  liveAgentBookingGuide,
  liveAgentBookingStepStates,
} from "@/lib/inquiries/live-agent-next-step";
import { cn } from "@/lib/ui/cn";
import { confirmBookingAction, cancelBookingAction } from "@/server/actions/bookings";
import { savePendingBookingAction, startWorkingInquiryAction } from "@/server/actions/live-agent";
import {
  cancelConfirmedBookingConfirm,
  cancelPendingBookingConfirm,
} from "@/lib/ui/destructive-confirm";

function DisabledStatusButton({ children }: { children: string }) {
  return (
    <button
      type="button"
      disabled
      aria-disabled="true"
      className={buttonClassName({
        variant: "secondary",
        size: "md",
        className: "w-full cursor-not-allowed opacity-60",
      })}
    >
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
  canManageInventory = false,
  resourcesHref = "/app/admin/resources",
  pendingPayment = false,
  paymentConflict = false,
  availabilityChecked = false,
  cancelled = false,
  canCancel = false,
  hoursExceptionId = null,
  confirmAttemptAllowed = false,
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
  /** When false, inventory setup guidance asks for an administrator instead of linking to Resources. */
  canManageInventory?: boolean;
  resourcesHref?: string;
  pendingPayment?: boolean;
  paymentConflict?: boolean;
  availabilityChecked?: boolean;
  cancelled?: boolean;
  canCancel?: boolean;
  /** Active matching CONFIRM_BOOKING hours exception id from server readiness (optional). */
  hoursExceptionId?: string | null;
  /** Server-derived: confirmation may be attempted (still revalidated transactionally). */
  confirmAttemptAllowed?: boolean;
}) {
  void canHold;
  const guideInput = {
    booked,
    assigned,
    needsHold,
    hasHold,
    canPlaceHold,
    needsInventory,
    confirmBlockers,
    pendingPayment,
    paymentConflict,
    availabilityChecked,
    cancelled,
    confirmAttemptAllowed,
  };
  const guide = liveAgentBookingGuide(guideInput);
  const steps = liveAgentBookingStepStates(guideInput);
  const canSubmitConfirm =
    canConfirm &&
    !booked &&
    !cancelled &&
    confirmBlockers.length === 0 &&
    assigned &&
    !needsInventory &&
    confirmAttemptAllowed;
  const showStartWorking = canManage && !booked && !cancelled && !assigned;
  const showSetupInventory = canManage && !booked && !cancelled && assigned && needsInventory;
  const showWorkingActions = !booked && !cancelled;
  const showCancel = canCancel && (pendingPayment || booked);
  const showHoldCue =
    showWorkingActions &&
    assigned &&
    !needsInventory &&
    availabilityChecked &&
    needsHold &&
    !hasHold;
  const showSavePending = canManage && assigned && showWorkingActions && !showStartWorking;

  const startWorkingAction = showStartWorking ? (
    <SecurityActionForm
      action={startWorkingInquiryAction}
      notice={{ successTitle: "You are working this inquiry", errorTitle: "Unable to start working" }}
    >
      <input type="hidden" name="inquiryId" value={inquiryId} />
      <PendingSubmitButton
        pendingLabel="Starting…"
        className={buttonClassName({ variant: "primary", size: "md", className: "w-full" })}
      >
        Start Working
      </PendingSubmitButton>
    </SecurityActionForm>
  ) : null;

  const inventoryAction = showSetupInventory ? (
    canManageInventory ? (
      <Link
        href={resourcesHref}
        className={buttonClassName({ variant: "primary", size: "md", className: "w-full text-center" })}
      >
        Set up inventory
      </Link>
    ) : (
      <p
        className="rounded-[var(--radius-control)] border border-border bg-muted/40 px-3 py-2 text-sm text-foreground/80"
        data-permission-guidance
      >
        Numbered inventory must be configured by an authorized administrator before availability and
        booking can proceed. Your role cannot change Resources.
      </p>
    )
  ) : null;

  const savePendingAction = showSavePending ? (
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
        className={buttonClassName({ variant: "secondary", size: "md", className: "w-full" })}
      >
        Save Pending Booking
      </PendingSubmitButton>
    </ScheduleBookingActionForm>
  ) : null;

  const confirmAction = showWorkingActions ? (
    canSubmitConfirm ? (
      <ScheduleBookingActionForm
        completeKind="confirmed"
        action={confirmBookingAction}
        blocking
        blockingLabel="Confirming the booking…"
        notice={{ successTitle: "Booking confirmed", errorTitle: "Unable to confirm booking" }}
        confirm={{
          title: "Confirm this booking?",
          description:
            "MagicCRM will recheck availability and allocate the required resources on the Master Schedule. MagicCRM does not collect payment — complete any venue payment process outside MagicCRM before confirming if your policy requires it.",
          confirmLabel: "Confirm booking",
          confirmPendingLabel: "Confirming…",
        }}
      >
        <input type="hidden" name="inquiryId" value={inquiryId} />
        <input type="hidden" name="expectedUpdatedAt" value={expectedUpdatedAt} />
        {hoursExceptionId ? (
          <input type="hidden" name="hoursExceptionId" value={hoursExceptionId} />
        ) : null}
        <PendingSubmitButton
          pendingLabel="Confirming…"
          className={buttonClassName({ variant: "primary", size: "md", className: "w-full" })}
        >
          Confirm booking
        </PendingSubmitButton>
      </ScheduleBookingActionForm>
    ) : (
      <DisabledStatusButton>Confirm booking</DisabledStatusButton>
    )
  ) : null;

  const cancelAction = showCancel ? (
    <SecurityActionForm
      action={cancelBookingAction}
      notice={{ successTitle: "Booking cancelled", errorTitle: "Unable to cancel booking" }}
      confirm={booked ? cancelConfirmedBookingConfirm() : cancelPendingBookingConfirm()}
    >
      <input type="hidden" name="inquiryId" value={inquiryId} />
      <PendingSubmitButton
        pendingLabel="Cancelling…"
        className={buttonClassName({ variant: "destructive", size: "md", className: "w-full" })}
      >
        Cancel Booking
      </PendingSubmitButton>
    </SecurityActionForm>
  ) : null;

  const openBookingAction =
    booked && bookingHref && bookingNumber ? (
      <Link
        href={bookingHref}
        className={buttonClassName({ variant: "primary", size: "md", className: "w-full text-center" })}
      >
        Open {bookingNumber}
      </Link>
    ) : null;

  /** Desktop: full action stack. */
  const desktopActions = (
    <>
      {startWorkingAction}
      {inventoryAction}
      {savePendingAction}
      {confirmAction}
      {cancelAction}
      {openBookingAction}
    </>
  );

  /**
   * Mobile: one primary control above the UX3 bottom nav.
   * Secondary paths stay in the in-flow coach (HOLD readiness, save pending, cancel).
   */
  const mobilePrimaryAction =
    startWorkingAction ??
    inventoryAction ??
    (canSubmitConfirm ? confirmAction : null) ??
    (showWorkingActions ? confirmAction : null) ??
    openBookingAction ??
    cancelAction;

  const secondaryLinks = (
    <>
      {showHoldCue ? (
        <p className="text-sm">
          <a href="#hold-readiness" className="font-semibold text-primary">
            Review HOLD readiness
          </a>
          {canPlaceHold ? " to place an optional 24-hour HOLD, or confirm when ready." : "."}
        </p>
      ) : null}
      {hasHold && showWorkingActions ? (
        <p className="text-sm text-muted-foreground">
          Resources are currently held.{" "}
          <a href="#hold-readiness" className="font-semibold text-primary">
            Review HOLD
          </a>
        </p>
      ) : null}
      {showSavePending ? (
        <div className="lg:hidden">{savePendingAction}</div>
      ) : null}
      {showCancel && !booked ? <div className="lg:hidden">{cancelAction}</div> : null}
      <p className="text-sm">
        <a href="#confirmation-readiness" className="font-semibold text-primary">
          Confirmation readiness
        </a>
        {" · "}
        <a href="#availability-resources" className="font-semibold text-primary">
          Availability
        </a>
        {" · "}
        <a href="#working-plan" className="font-semibold text-primary">
          Working plan
        </a>
      </p>
      {booked && bookingHref && bookingNumber ? (
        <p className="text-sm">
          <Link href={bookingHref} className="text-primary">
            Open {bookingNumber}
          </Link>
          {" · "}
          <Link href="/app/schedule" className="text-primary">
            Master Schedule
          </Link>
        </p>
      ) : cancelled && bookingHref && bookingNumber ? (
        <p className="text-sm">
          Cancelled booking{" "}
          <Link href={bookingHref} className="text-primary">
            {bookingNumber}
          </Link>
        </p>
      ) : pendingPayment && bookingHref && bookingNumber ? (
        <p className="text-sm">
          Pending booking{" "}
          <Link href={bookingHref} className="text-primary">
            {bookingNumber}
          </Link>
        </p>
      ) : null}
      {showWorkingActions && !canConfirm ? (
        <p className="text-xs text-muted-foreground">You need permission to confirm bookings.</p>
      ) : null}
    </>
  );

  return (
    <section id="confirm-booking" className="booking-coach mt-6" aria-label="Booking coach">
      {/* Desktop: sticky under header */}
      <Card
        variant="elevated"
        padding="md"
        className="hidden border-primary/30 lg:sticky lg:top-[var(--header-offset)] lg:z-20 lg:block"
      >
        <CoachBody
          showSteps={showWorkingActions}
          steps={steps}
          title={guide.nextTitle}
          detail={guide.nextDetail}
          paymentConflict={paymentConflict}
          secondary={secondaryLinks}
          actions={showWorkingActions || showCancel || booked ? desktopActions : null}
        />
      </Card>

      {/* Mobile: in-flow coach (not sticky) — primary action lives in the bottom-safe bar */}
      <Card variant="elevated" padding="md" className="border-primary/30 lg:hidden">
        <CoachBody
          showSteps={showWorkingActions}
          steps={steps}
          title={guide.nextTitle}
          detail={guide.nextDetail}
          paymentConflict={paymentConflict}
          secondary={secondaryLinks}
          actions={null}
        />
      </Card>

      {mobilePrimaryAction && !cancelled ? (
        <div
          className="booking-mobile-action-bar lg:hidden"
          data-booking-mobile-action-bar
          role="region"
          aria-label="Booking actions"
        >
          <div className="mx-auto w-full max-w-[90rem] px-3">{mobilePrimaryAction}</div>
        </div>
      ) : null}

      {/* Spacer so content clears the fixed mobile action bar + bottom nav */}
      {mobilePrimaryAction && !cancelled ? (
        <div className="h-[var(--booking-action-bar-height)] lg:hidden" aria-hidden />
      ) : null}
    </section>
  );
}

function CoachBody({
  showSteps,
  steps,
  title,
  detail,
  paymentConflict,
  secondary,
  actions,
}: {
  showSteps: boolean;
  steps: ReturnType<typeof liveAgentBookingStepStates>;
  title: string;
  detail: string;
  paymentConflict: boolean;
  secondary: ReactNode;
  actions: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div className="min-w-0 flex-1">
        {showSteps ? (
          <ol className="flex flex-wrap gap-2" aria-label="Booking progress">
            {steps.map((step, index) => {
              const current = step.status === "current";
              const complete = step.status === "complete" || step.status === "optional";
              const content = (
                <>
                  <span className="font-semibold" aria-hidden>
                    {index + 1}.
                  </span>{" "}
                  {step.label}
                  {step.status === "optional" ? (
                    <span className="sr-only"> (skipped, optional)</span>
                  ) : null}
                  {current ? <span className="sr-only"> (current)</span> : null}
                </>
              );
              return (
                <li key={step.id}>
                  {step.href && (current || step.id === "hold" || step.id === "confirm") ? (
                    <a
                      href={step.href}
                      aria-current={current ? "step" : undefined}
                      className={cn(
                        "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold",
                        current && "bg-primary/10 text-primary",
                        complete && !current && "bg-muted text-muted-foreground",
                        !complete && !current && "text-muted-foreground",
                      )}
                    >
                      {content}
                    </a>
                  ) : (
                    <span
                      aria-current={current ? "step" : undefined}
                      className={cn(
                        "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold",
                        current && "bg-primary/10 text-primary",
                        complete && !current && "bg-muted text-muted-foreground",
                        !complete && !current && "text-muted-foreground",
                      )}
                    >
                      {content}
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        ) : null}
        <h2 className="mt-3 text-lg font-semibold tracking-tight">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{detail}</p>
        {paymentConflict ? (
          <p className="mt-2 rounded-[var(--radius-control)] border border-warning/40 bg-warning/10 px-3 py-2 text-sm" role="status">
            Pending confirmation — availability conflict. This booking stays pending until resources
            can be allocated.
          </p>
        ) : null}
        <div className="mt-3 space-y-2">{secondary}</div>
      </div>
      {actions ? <div className="flex w-full shrink-0 flex-col gap-2 sm:w-64">{actions}</div> : null}
    </div>
  );
}
