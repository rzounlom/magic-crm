import Link from "next/link";

import { SecurityActionForm } from "@/components/layout/security-action-form";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import {
  liveAgentBookingGuide,
  liveAgentBookingSteps,
} from "@/lib/inquiries/live-agent-next-step";
import { confirmBookingAction } from "@/server/actions/bookings";
import { startWorkingInquiryAction } from "@/server/actions/live-agent";
import { placeInquiryHoldAction } from "@/server/actions/resource-schedule";

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
}) {
  const guide = liveAgentBookingGuide({
    booked,
    assigned,
    needsHold,
    hasHold,
    canPlaceHold,
    needsInventory,
    confirmBlockers,
  });
  const steps = liveAgentBookingSteps({ needsHold, hasHold });
  const canSubmitConfirm = canConfirm && !booked && confirmBlockers.length === 0;
  const showStartWorking = canManage && !booked && !assigned;
  const showPlaceHold = canHold && canManage && !booked && assigned && needsHold && !hasHold && canPlaceHold;
  const showSetupInventory = canManage && !booked && assigned && needsHold && !hasHold && needsInventory;

  return (
    <section
      id="confirm-booking"
      className="sticky top-0 z-20 mt-6 rounded-md border border-primary/40 bg-background px-4 py-4 shadow-sm"
    >
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
      <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">{guide.nextTitle}</h2>
          <p className="mt-1 text-sm text-foreground/70">{guide.nextDetail}</p>
          {booked && bookingHref && bookingNumber ? (
            <p className="mt-2 text-sm">
              <Link href={bookingHref} className="text-primary">
                Open {bookingNumber}
              </Link>
            </p>
          ) : null}
        </div>
        {booked ? null : (
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
            {showPlaceHold ? (
              <SecurityActionForm
                action={placeInquiryHoldAction}
                notice={{ successTitle: "Resources held", errorTitle: "Unable to place resource hold" }}
                confirm={{
                  title: "Place a temporary resource hold?",
                  description: "This holds the required resources for this inquiry. It does not confirm a booking.",
                  confirmLabel: "Place resource hold",
                  confirmPendingLabel: "Placing hold…",
                }}
              >
                <input type="hidden" name="inquiryId" value={inquiryId} />
                <PendingSubmitButton pendingLabel="Placing hold…" className={PRIMARY_BUTTON}>
                  Place Resource Hold
                </PendingSubmitButton>
              </SecurityActionForm>
            ) : !hasHold && needsHold ? (
              <DisabledStatusButton>Place Resource Hold</DisabledStatusButton>
            ) : null}
            {canSubmitConfirm ? (
              <SecurityActionForm
                action={confirmBookingAction}
                notice={{ successTitle: "Booking confirmed", errorTitle: "Unable to confirm booking" }}
                confirm={{
                  title: "Confirm this booking?",
                  description:
                    "This will convert the held resources into a confirmed booking on the Master Schedule. Payment collection is not enabled yet.",
                  confirmLabel: "Confirm Booking",
                  confirmPendingLabel: "Confirming…",
                }}
              >
                <input type="hidden" name="inquiryId" value={inquiryId} />
                <input type="hidden" name="expectedUpdatedAt" value={expectedUpdatedAt} />
                <PendingSubmitButton pendingLabel="Confirming…" className={PRIMARY_BUTTON}>
                  Confirm Booking
                </PendingSubmitButton>
              </SecurityActionForm>
            ) : (
              <DisabledStatusButton>Confirm Booking</DisabledStatusButton>
            )}
            {!canConfirm ? (
              <p className="text-xs text-foreground/55">You need permission to confirm bookings.</p>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}
