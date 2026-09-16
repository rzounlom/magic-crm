"use client";

import { useRouter } from "next/navigation";
import { unstable_rethrow } from "next/navigation";
import { useRef, useState, type FormEvent, type ReactNode } from "react";

import { PendingActionProvider, PendingSubmitButton } from "@/components/ui/pending-submit-button";
import { formatEventDuration, personalEventPlannerTitle } from "@/lib/event-planner/labels";
import { formatMoneyFromCents, perPersonCents } from "@/lib/event-planner/money";
import { isBestFitTier, readEventPlanPayload } from "@/lib/event-planner/payload";
import { formatEventLocalDateTime, formatEventLocalTime, formatItineraryLine, formatItineraryRange, formatOrganizationTimestamp } from "@/lib/inquiries/tenant-datetime";
import { onSafeSubmitAttempt } from "@/lib/ui/confirm-gate";
import { notify } from "@/lib/ui/notify";
import { yieldToPaint } from "@/lib/ui/yield-to-paint";
import { selectPublicEventPlanAction, reservePublicEventPlanAction } from "@/server/actions/public-inquiry";
import { CUSTOMER_AVAILABILITY_NOTE, EVENT_PLAN_TIERS } from "@/types/event-planner";
import { DEPOSIT_PREVIEW_NOTE } from "@/types/catalog";
import { INQUIRY_SALES_STAGES } from "@/types/inquiry";

type PlanCard = {
  id: string;
  tier: string;
  title: string;
  estimatedTotalCents: number | null;
  currency: string;
  durationMinutes: number | null;
  customerFacingReason: string;
  availabilityStatus?: string;
  payload: unknown;
};

export function PublicEventPlanView({
  organizationName,
  currency,
  inquiry,
  plans,
  token,
  booking = null,
  hold = null,
  timeZone,
}: {
  organizationName: string;
  currency: string;
  inquiry: {
    customerFirstName: string | null;
    guestCount: number | null;
    eventGoal: string | null;
    selectedEventPlanId: string | null;
    status?: string | null;
    salesStage?: string | null;
  };
  plans: PlanCard[];
  token: string;
  booking?: {
    bookingNumber: string;
    eventDate: Date | string;
    startTime: string;
    endTime: string;
    guestCount: number;
  } | null;
  hold?: {
    expiresAt: Date | null;
    resources: string[];
  } | null;
  timeZone?: string;
}) {
  const selectedId = inquiry.selectedEventPlanId;
  const firstName = inquiry.customerFirstName || "there";
  const selectedPlan = plans.find((plan) => plan.id === selectedId);
  const confirmed = Boolean(booking);
  const finalized = confirmed || inquiry.status === "BOOKED";
  const reserved = Boolean(hold) || inquiry.salesStage === INQUIRY_SALES_STAGES.HOLD_PLACED;

  return (
    <section className="mx-auto w-full max-w-5xl flex-1 px-6 py-16">
      <p className="text-sm font-semibold tracking-[0.18em] text-primary uppercase">
        {organizationName}
      </p>
      {confirmed && booking ? (
        <ConfirmedBookingPanel organizationName={organizationName} booking={booking} />
      ) : finalized ? (
        <div className="mt-3 rounded-md border border-primary/40 bg-primary/5 px-5 py-6">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">
            This event plan has already been finalized.
          </h1>
          <p className="mt-3 max-w-2xl text-sm text-foreground/80">
            Your event team has locked in the details. You cannot select a different recommendation.
          </p>
        </div>
      ) : selectedPlan ? (
        reserved ? (
          <HoldConfirmationPanel
            organizationName={organizationName}
            planTitle={selectedPlan.title}
            hold={hold}
            timeZone={timeZone}
          />
        ) : (
        <ConfirmationPanel
          organizationName={organizationName}
          planTitle={selectedPlan.title}
          availabilityChanged={selectedPlan.availabilityStatus === "AVAILABILITY_CHANGED"}
        />
        )
      ) : (
        <>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground">
            Your Personal Event Plan
          </h1>
          <p className="mt-4 max-w-2xl text-sm text-foreground/70">
            {personalEventPlannerTitle(organizationName)} prepared options for {firstName}
            {inquiry.guestCount ? ` · ${inquiry.guestCount} guests` : ""}
            {inquiry.eventGoal ? ` · ${inquiry.eventGoal}` : ""}. {CUSTOMER_AVAILABILITY_NOTE} You can reserve an
            option for 24 hours, or ask an agent to follow up without holding inventory.
          </p>
        </>
      )}
      {plans.length === 0 ? (
        <div className="mt-10 rounded-md border border-border px-5 py-6">
          <h2 className="text-lg font-semibold">We&apos;re putting the finishing touches on your event plan</h2>
          <p className="mt-2 text-sm text-foreground/70">
            A member of our team will follow up with your best options. You do not need to fill this
            out again.
          </p>
        </div>
      ) : (
        <div className="mt-10 grid gap-5 lg:grid-cols-3">
          {plans.map((plan) => (
            <PlanOptionCard
              key={plan.id}
              plan={plan}
              currency={currency}
              token={token}
              selected={selectedId === plan.id}
              hideCta={Boolean(selectedId) || finalized}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function ConfirmedBookingPanel({
  organizationName,
  booking,
}: {
  organizationName: string;
  booking: {
    bookingNumber: string;
    eventDate: Date | string;
    startTime: string;
    endTime: string;
    guestCount: number;
  };
}) {
  return (
    <div className="mt-3 rounded-md border border-primary/40 bg-primary/5 px-5 py-6">
      <p className="text-xs font-semibold tracking-[0.18em] text-primary uppercase">Your event is confirmed</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">Your Event Is Confirmed</h1>
      <p className="mt-3 max-w-2xl text-sm text-foreground/80">
        {organizationName} has confirmed your event. You cannot select a different plan.
      </p>
      <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-foreground/70">
        <li>Reference: {booking.bookingNumber}</li>
        <li>{formatEventLocalDateTime({ date: booking.eventDate, time: booking.startTime })}</li>
        <li>
          {formatEventLocalTime(booking.startTime)}–{formatEventLocalTime(booking.endTime)} · {booking.guestCount}{" "}
          guests
        </li>
      </ul>
    </div>
  );
}

function HoldConfirmationPanel({
  organizationName,
  planTitle,
  hold,
  timeZone,
}: {
  organizationName: string;
  planTitle: string;
  hold: { expiresAt: Date | null; resources: string[] } | null;
  timeZone?: string;
}) {
  return (
    <div className="mt-3 rounded-md border border-primary/40 bg-primary/5 px-5 py-6">
      <p className="text-xs font-semibold tracking-[0.18em] text-primary uppercase">24-hour hold</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">
        Your event time is being held for 24 hours.
      </h1>
      <p className="mt-3 max-w-2xl text-sm text-foreground/80">
        {organizationName} has reserved the required event resources for {planTitle} while you complete the
        next step. Your reservation will be finalized after the required deposit is received.
      </p>
      <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-foreground/70">
        <li>This is not a final booking. Payment is not collected yet.</li>
        <li>Payment will be enabled in the next release. No deposit link is available yet.</li>
        {hold?.expiresAt && timeZone ? (
          <li>Held until {formatOrganizationTimestamp(hold.expiresAt, timeZone)}.</li>
        ) : (
          <li>The hold expires 24 hours from when it was placed.</li>
        )}
        {hold && hold.resources.length > 0 ? <li>Reserved: {hold.resources.join(", ")}.</li> : null}
      </ul>
    </div>
  );
}

function ConfirmationPanel({
  organizationName,
  planTitle,
  availabilityChanged,
}: {
  organizationName: string;
  planTitle: string;
  availabilityChanged: boolean;
}) {
  return (
    <div className="mt-3 rounded-md border border-primary/40 bg-primary/5 px-5 py-6">
      <p className="text-xs font-semibold tracking-[0.18em] text-primary uppercase">Preference saved</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">
        {availabilityChanged
          ? "We’ve saved the package you’re interested in."
          : "Thanks — we’ve saved the package you’re interested in."}
      </h1>
      <p className="mt-3 max-w-2xl text-sm text-foreground/80">
        {availabilityChanged
          ? `A member of the events team will follow up to confirm the final details and availability. Your preferred plan (${planTitle}) is saved. The time is not reserved.`
          : `A member of the ${organizationName} events team will follow up with you to confirm the final details and availability.`}
      </p>
      <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-foreground/70">
        <li>Your preference is saved — you do not need to fill everything out again.</li>
        <li>Inventory is not held. The time is not reserved.</li>
        <li>{CUSTOMER_AVAILABILITY_NOTE}</li>
      </ul>
    </div>
  );
}

function PlanOptionCard({
  plan,
  currency,
  token,
  selected,
  hideCta,
}: {
  plan: PlanCard;
  currency: string;
  token: string;
  selected: boolean;
  hideCta: boolean;
}) {
  const payload = readEventPlanPayload(plan.payload);
  const recommended = isBestFitTier(plan.tier);
  const total = plan.estimatedTotalCents ?? 0;
  const guestCount = payload.guestCount || null;
  const perPerson = guestCount ? perPersonCents(total, guestCount) : null;
  const displayCurrency = plan.currency || currency;
  const duration = formatEventDuration(plan.durationMinutes ?? payload.durationMinutes);
  const availabilityNote = payload.customerAvailabilityNote || CUSTOMER_AVAILABILITY_NOTE;

  return (
    <article
      className={`flex h-full flex-col rounded-md border px-5 py-5 ${
        recommended ? "border-primary ring-2 ring-primary/30" : "border-border"
      } ${selected ? "bg-muted/50" : "bg-background"}`}
    >
      {recommended ? (
        <p className="text-xs font-semibold tracking-[0.16em] text-primary uppercase">RECOMMENDED</p>
      ) : (
        <p className="text-xs font-semibold tracking-[0.16em] text-foreground/55 uppercase">
          {plan.tier === EVENT_PLAN_TIERS.BUDGET ? "Good" : "Premium"}
        </p>
      )}
      <h2 className="mt-2 text-xl font-semibold">{plan.title}</h2>
      <p className="mt-3 text-3xl font-semibold tracking-tight">
        {payload.pricingComplete || total > 0
          ? formatMoneyFromCents(total, displayCurrency)
          : "Pricing to confirm"}
      </p>
      <p className="mt-1 text-xs text-foreground/60">
        Estimated total
        {perPerson != null && total > 0
          ? ` · ${formatMoneyFromCents(perPerson, displayCurrency)} per person`
          : ""}
      </p>
      {payload.depositPreviewCents != null && payload.pricingComplete ? (
        <p className="mt-1 text-xs text-foreground/60">
          Deposit preview {formatMoneyFromCents(payload.depositPreviewCents, displayCurrency)} ·{" "}
          {payload.depositPreviewNote ?? DEPOSIT_PREVIEW_NOTE}
        </p>
      ) : null}

      <PlanSection title="Attractions">
        {payload.activities.length > 0 ? (
          <ul className="list-disc space-y-1 pl-5">
            {payload.activities.map((activity) => (
              <li key={activity.knowledgeItemId}>
                {activity.name}
                {activity.quantity > 1 && activity.unitLabel
                  ? ` · ${activity.quantity} ${activity.unitLabel}s`
                  : ""}
              </li>
            ))}
          </ul>
        ) : (
          <p>To be confirmed with our team</p>
        )}
      </PlanSection>

      <PlanSection title="Dining">{payload.dining.label}</PlanSection>

      <PlanSection title="Itinerary">
        {payload.itinerary && payload.itinerary.length > 0 ? (
          <ul className="list-disc space-y-1 pl-5">
            {payload.itinerary.map((segment) => (
              <li key={`${segment.startTime}-${segment.label}`}>
                {formatItineraryRange(segment.startTime, segment.endTime)} {segment.label}
              </li>
            ))}
          </ul>
        ) : payload.schedule.length > 0 ? (
          <ul className="list-disc space-y-1 pl-5">
            {payload.schedule.map((row) => (
              <li key={row}>{formatItineraryLine(row)}</li>
            ))}
          </ul>
        ) : (
          <p>To be confirmed with our event team</p>
        )}
      </PlanSection>

      <PlanSection title="Space">
        {payload.spaces.length > 0
          ? payload.spaces.map((space) => space.name).join(", ")
          : "Shared / to be confirmed"}
      </PlanSection>

      <PlanSection title="Event Length">{duration}</PlanSection>

      <PlanSection title="Why We Recommend This">
        <p>{plan.customerFacingReason}</p>
        <p className="mt-2 text-xs text-foreground/55">{availabilityNote}</p>
        {payload.suggestedStartTimes && payload.suggestedStartTimes.length > 0 ? (
          <p className="mt-2 text-xs text-foreground/70">
            Nearby times to consider:{" "}
            {payload.suggestedStartTimes.map((time) => formatEventLocalTime(time) ?? time).join(", ")}.
          </p>
        ) : null}
      </PlanSection>

      <div className="mt-auto pt-5">
        {selected ? (
          <p className="text-sm font-medium text-primary">You chose this event plan</p>
        ) : hideCta ? null : (
          <ChoosePlanButton planId={plan.id} token={token} emphasized={recommended} />
        )}
      </div>
    </article>
  );
}

function PlanSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mt-4 text-sm">
      <p className="font-medium">{title}</p>
      <div className="mt-1 text-foreground/80">{children}</div>
    </div>
  );
}

function ChoosePlanButton({
  planId,
  token,
  emphasized,
}: {
  planId: string;
  token: string;
  emphasized: boolean;
}) {
  const router = useRouter();
  const pendingRef = useRef(false);
  const [pending, setPending] = useState(false);

  async function submit(
    event: FormEvent<HTMLFormElement>,
    action: typeof reservePublicEventPlanAction | typeof selectPublicEventPlanAction,
    errorTitle: string,
  ) {
    event.preventDefault();
    if (onSafeSubmitAttempt(pendingRef.current) === "block") {
      return;
    }
    const formData = new FormData(event.currentTarget);
    pendingRef.current = true;
    setPending(true);
    await yieldToPaint();
    try {
      const result = await action(formData);
      if (!result.ok) {
        notify.error({ title: result.title ?? errorTitle, description: result.message });
        return;
      }
      router.refresh();
    } catch (error) {
      unstable_rethrow(error);
      notify.error({ title: errorTitle, description: "Something went wrong. Try again." });
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }

  return (
    <PendingActionProvider pending={pending}>
      <div className="space-y-2">
        <form onSubmit={(event) => submit(event, reservePublicEventPlanAction, "Unable to reserve that plan")}>
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="planId" value={planId} />
          <PendingSubmitButton
            pendingLabel="Reserving…"
            className={
              emphasized
                ? "w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
                : "w-full rounded-md border border-border px-4 py-2 text-sm font-medium"
            }
          >
            Reserve this option
          </PendingSubmitButton>
        </form>
        <form onSubmit={(event) => submit(event, selectPublicEventPlanAction, "Unable to save that plan")}>
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="planId" value={planId} />
          <PendingSubmitButton
            pendingLabel="Saving…"
            className="w-full rounded-md border border-border px-4 py-2 text-sm font-medium"
          >
            Have an agent contact me
          </PendingSubmitButton>
        </form>
      </div>
    </PendingActionProvider>
  );
}
