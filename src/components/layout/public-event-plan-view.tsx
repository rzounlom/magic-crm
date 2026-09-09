"use client";

import { useRouter } from "next/navigation";
import { unstable_rethrow } from "next/navigation";
import { useRef, useState, type FormEvent, type ReactNode } from "react";

import { PendingActionProvider, PendingSubmitButton } from "@/components/ui/pending-submit-button";
import { formatEventDuration, personalEventPlannerTitle } from "@/lib/event-planner/labels";
import { formatMoneyFromCents, perPersonCents } from "@/lib/event-planner/money";
import { isBestFitTier, readEventPlanPayload } from "@/lib/event-planner/payload";
import { onSafeSubmitAttempt } from "@/lib/ui/confirm-gate";
import { notify } from "@/lib/ui/notify";
import { yieldToPaint } from "@/lib/ui/yield-to-paint";
import { selectPublicEventPlanAction } from "@/server/actions/public-inquiry";
import { CUSTOMER_AVAILABILITY_NOTE, EVENT_PLAN_TIERS } from "@/types/event-planner";

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
}: {
  organizationName: string;
  currency: string;
  inquiry: {
    customerFirstName: string | null;
    guestCount: number | null;
    eventGoal: string | null;
    selectedEventPlanId: string | null;
  };
  plans: PlanCard[];
  token: string;
}) {
  const selectedId = inquiry.selectedEventPlanId;
  const firstName = inquiry.customerFirstName || "there";
  const selectedPlan = plans.find((plan) => plan.id === selectedId);

  return (
    <section className="mx-auto w-full max-w-5xl flex-1 px-6 py-16">
      <p className="text-sm font-semibold tracking-[0.18em] text-primary uppercase">
        {organizationName}
      </p>
      {selectedPlan ? (
        <ConfirmationPanel
          organizationName={organizationName}
          planTitle={selectedPlan.title}
          availabilityChanged={selectedPlan.availabilityStatus === "AVAILABILITY_CHANGED"}
        />
      ) : (
        <>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground">
            Your Personal Event Plan
          </h1>
          <p className="mt-4 max-w-2xl text-sm text-foreground/70">
            {personalEventPlannerTitle(organizationName)} prepared options for {firstName}
            {inquiry.guestCount ? ` · ${inquiry.guestCount} guests` : ""}
            {inquiry.eventGoal ? ` · ${inquiry.eventGoal}` : ""}. {CUSTOMER_AVAILABILITY_NOTE} Selecting
            a plan saves your preference; it does not reserve the date.
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
              hideCta={Boolean(selectedId)}
            />
          ))}
        </div>
      )}
    </section>
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
          ? "We’ve saved your preferred event plan."
          : "Great choice — we saved your event plan."}
      </h1>
      <p className="mt-3 max-w-2xl text-sm text-foreground/80">
        {availabilityChanged
          ? `Our event team will confirm the final schedule and availability with you. Your preferred plan (${planTitle}) is saved.`
          : `Our team now has your event details and preferred plan (${planTitle}). A ${organizationName} event specialist will review the details and reach out soon.`}
      </p>
      <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-foreground/70">
        <li>Your preference is saved — you do not need to fill everything out again.</li>
        <li>A team member will contact you to confirm the details.</li>
        <li>The event is not reserved yet. {CUSTOMER_AVAILABILITY_NOTE}</li>
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
          {plan.tier === EVENT_PLAN_TIERS.BUDGET ? "Lower cost" : "Upgrade"}
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

      <PlanSection title="Activities">
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

      <PlanSection title="Space">
        {payload.spaces.length > 0
          ? payload.spaces.map((space) => space.name).join(", ")
          : "Shared / to be confirmed"}
      </PlanSection>

      <PlanSection title="Event Length">{duration}</PlanSection>

      <PlanSection title="Why We Recommend This">
        <p>{plan.customerFacingReason}</p>
        <p className="mt-2 text-xs text-foreground/55">{availabilityNote}</p>
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

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (onSafeSubmitAttempt(pendingRef.current) === "block") {
      return;
    }
    pendingRef.current = true;
    setPending(true);
    await yieldToPaint();
    try {
      const formData = new FormData(event.currentTarget);
      const result = await selectPublicEventPlanAction(formData);
      if (!result.ok) {
        notify.error({ title: result.title ?? "Unable to save that plan", description: result.message });
        return;
      }
      router.refresh();
    } catch (error) {
      unstable_rethrow(error);
      notify.error({ title: "Unable to save that plan", description: "Something went wrong. Try again." });
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }

  return (
    <PendingActionProvider pending={pending}>
      <form onSubmit={onSubmit}>
        <input type="hidden" name="token" value={token} />
        <input type="hidden" name="planId" value={planId} />
        <PendingSubmitButton
          pendingLabel="Saving…"
          className={
            emphasized
              ? "w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
              : "w-full rounded-md border border-border px-4 py-2 text-sm font-medium"
          }
        >
          Choose This Event Plan
        </PendingSubmitButton>
      </form>
    </PendingActionProvider>
  );
}
