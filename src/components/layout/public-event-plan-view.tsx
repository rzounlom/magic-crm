"use client";

import { useRouter } from "next/navigation";
import { unstable_rethrow } from "next/navigation";
import { useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";

import { PUBLIC_CONTENT_CLASS } from "@/components/layout/public-content";
import { BlockingMutation } from "@/components/ui/blocking-mutation";
import { PendingActionProvider, PendingSubmitButton } from "@/components/ui/pending-submit-button";
import { PriceBreakdown } from "@/components/ui/price-breakdown";
import { budgetFitCustomerText } from "@/lib/event-planner/budget-fit";
import {
  classifyProductKind,
  customerAvailabilityCopy,
  customerTaxNote,
  describeTierImprovements,
  formatComponentPrice,
  isUnresolvedDining,
  itemizedTotalMatchesEstimate,
  matchingLineItem,
  packagePresentation,
  previousTierInSet,
  sharedDurationMinutes,
  summarizeCustomerEvent,
} from "@/lib/event-planner/customer-package";
import { formatCustomerDurationText, formatEventDuration, personalEventPlannerTitle } from "@/lib/event-planner/labels";
import { formatEstimatedDepositLine, formatMoneyFromCents, perPersonCents } from "@/lib/event-planner/money";
import { isBestFitTier, isEventPlanScheduleInfeasible, readEventPlanPayload } from "@/lib/event-planner/payload";
import {
  formatAdjustedEventWindow,
  formatCustomerFacingClocks,
  formatEventLocalDateTime,
  formatEventLocalTime,
  formatItineraryLine,
  formatItineraryRange,
  formatOrganizationTimestamp,
} from "@/lib/inquiries/tenant-datetime";
import { onSafeSubmitAttempt } from "@/lib/ui/confirm-gate";
import { notify } from "@/lib/ui/notify";
import { yieldToPaint } from "@/lib/ui/yield-to-paint";
import { isSampleItinerarySegment } from "@/server/catalog/scheduling-behavior";
import { reservePublicEventPlanAction, selectPublicEventPlanAction } from "@/server/actions/public-inquiry";
import { BOOKING_STATUSES } from "@/types/booking";
import {
  BOOK_NOW_EXPLANATION,
  CONTINUE_PACKAGE_EXPLANATION,
  CUSTOMER_AVAILABILITY_NOTE,
  SCHEDULE_INFEASIBLE_CUSTOMER_NOTE,
  DINING_PREFERENCE_LABELS,
  EVENT_PLAN_TIERS,
  UNCONFIRMED_DINING_LABEL,
  type EventPlanLineItem,
  type EventPlanPayload,
} from "@/types/event-planner";
import { INQUIRY_SALES_STAGES } from "@/types/inquiry";
import { PLAN_AVAILABILITY_STATUSES } from "@/types/resource-schedule";

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

type PublicInquirySummary = {
  customerFirstName: string | null;
  guestCount: number | null;
  eventGoal: string | null;
  selectedEventPlanId: string | null;
  status?: string | null;
  salesStage?: string | null;
  eventType?: string | null;
  occasion?: string | null;
  desiredDate?: Date | string | null;
  desiredStartTime?: string | null;
  guestMix?: string | null;
  audience?: string | null;
  diningPreference?: string | null;
  spacePreference?: string | null;
  desiredDurationMinutes?: number | null;
};

export function PublicEventPlanView({
  organizationName,
  currency,
  inquiry,
  plans,
  token,
  booking = null,
  pendingBooking = null,
  hold = null,
  timeZone,
}: {
  organizationName: string;
  currency: string;
  inquiry: PublicInquirySummary;
  plans: PlanCard[];
  token: string;
  booking?: {
    bookingNumber: string;
    eventDate: Date | string;
    startTime: string;
    endTime: string;
    guestCount: number;
    status?: string | null;
    totalCents?: number | null;
    depositRequiredCents?: number | null;
    currency?: string | null;
  } | null;
  pendingBooking?: {
    bookingNumber: string;
    eventDate: Date | string;
    startTime: string;
    endTime: string;
    guestCount: number;
    status?: string | null;
    totalCents?: number | null;
    depositRequiredCents?: number | null;
    currency?: string | null;
    selectedEventPlanId?: string | null;
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
  const pendingPlan =
    plans.find((plan) => plan.id === pendingBooking?.selectedEventPlanId) ?? selectedPlan;
  const confirmed = Boolean(booking && booking.status !== BOOKING_STATUSES.PENDING_PAYMENT);
  const finalized = confirmed || inquiry.status === "BOOKED";
  const pending = Boolean(pendingBooking) || inquiry.salesStage === INQUIRY_SALES_STAGES.DEPOSIT_PENDING;
  const reserved = Boolean(hold) || inquiry.salesStage === INQUIRY_SALES_STAGES.HOLD_PLACED;
  const payloads = plans.map((plan) => readEventPlanPayload(plan.payload));
  const firstPayload = payloads[0];
  const adjustmentNote = payloads.find((payload) => payload.itineraryAdjusted && payload.adjustmentNote)
    ?.adjustmentNote;
  const summaryDuration =
    inquiry.desiredDurationMinutes && inquiry.desiredDurationMinutes > 0
      ? inquiry.desiredDurationMinutes
      : sharedDurationMinutes(plans.map((plan) => plan.durationMinutes ?? readEventPlanPayload(plan.payload).durationMinutes));
  const eventSummary = summarizeCustomerEvent({
    occasion: inquiry.occasion,
    eventType: inquiry.eventType,
    eventGoal: inquiry.eventGoal,
    desiredDate: inquiry.desiredDate,
    desiredStartTime: inquiry.desiredStartTime,
    payloadDate: firstPayload?.eventDate,
    payloadStartTime: firstPayload?.startTime,
    guestCount: inquiry.guestCount ?? firstPayload?.guestCount,
    durationMinutes: summaryDuration,
    guestMix: inquiry.guestMix,
    audience: inquiry.audience,
    diningPreference: inquiry.diningPreference,
    spacePreference: inquiry.spacePreference,
  });

  return (
    <section className={`${PUBLIC_CONTENT_CLASS} py-6 sm:py-8`}>
      <p className="page-eyebrow">{organizationName}</p>
      {confirmed && booking ? (
        <ConfirmedBookingPanel organizationName={organizationName} booking={booking} />
      ) : pending && pendingBooking ? (
        <PendingBookingPanel
          organizationName={organizationName}
          planTitle={pendingPlan?.title ?? "Selected package"}
          booking={pendingBooking}
          currency={pendingPlan?.currency || currency}
          depositPercent={readEventPlanPayload(pendingPlan?.payload).depositPreviewPercent}
        />
      ) : pending ? (
        <PendingBookingPanel
          organizationName={organizationName}
          planTitle={pendingPlan?.title ?? "Selected package"}
          booking={null}
          currency={pendingPlan?.currency || currency}
          depositPercent={readEventPlanPayload(pendingPlan?.payload).depositPreviewPercent}
        />
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
          <h1 className="page-title mt-1 text-[1.5rem] sm:text-[length:var(--text-display)]">
            Your Personal Event Plan
          </h1>
          <p className="page-description mt-2 max-w-3xl">
            {plans.length === 1
              ? `${personalEventPlannerTitle(organizationName)} prepared a package for ${firstName}. Review what is included, then continue with this package or submit an inquiry. Continuing saves a booking request. It does not confirm the date or reserve inventory.`
              : `${personalEventPlannerTitle(organizationName)} prepared packages for ${firstName}. Compare what is included, then continue with a package or submit an inquiry. Continuing saves a booking request. It does not confirm the date or reserve inventory.`}
          </p>
          <AdjustmentNotice note={adjustmentNote ? formatCustomerFacingClocks(adjustmentNote) : undefined} />
        </>
      )}

      <EventSummaryCard summary={eventSummary} />

      {plans.length === 0 ? (
        <div
          className="mt-6 rounded-[var(--radius-card)] border border-border bg-surface px-5 py-6 shadow-[var(--shadow-card)]"
          data-public-status
        >
          <h2 className="text-lg font-semibold">We&apos;re putting the finishing touches on your event plan</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            A member of our team will follow up with your best options. You do not need to fill this
            out again.
          </p>
        </div>
      ) : (
        <ProposalComparison
          plans={plans}
          currency={currency}
          token={token}
          selectedId={selectedId}
          hideCta={Boolean(selectedId) || finalized || pending}
          sharedDurationMinutes={summaryDuration}
        />
      )}
    </section>
  );
}

function EventSummaryCard({
  summary,
}: {
  summary: ReturnType<typeof summarizeCustomerEvent>;
}) {
  const rows = [
    { label: "Occasion", value: summary.title },
    { label: "Date and time", value: summary.dateTime },
    { label: "Guest count", value: summary.guestCount },
    ...(summary.duration ? [{ label: "Duration", value: summary.duration }] : []),
    ...(summary.audience ? [{ label: "Audience", value: summary.audience }] : []),
    ...(summary.diningPreference ? [{ label: "Food preference", value: summary.diningPreference }] : []),
    ...(summary.spacePreference ? [{ label: "Space preference", value: summary.spacePreference }] : []),
  ];

  return (
    <section
      data-event-summary
      aria-labelledby="event-summary-heading"
      className="mt-6 rounded-[var(--radius-card)] border border-border bg-surface px-5 py-5 shadow-[var(--shadow-card)]"
    >
      <h2 id="event-summary-heading" className="text-lg font-semibold tracking-tight">
        Event details
      </h2>
      <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((row) => (
          <div key={row.label} className="min-w-0">
            <dt className="text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">
              {row.label}
            </dt>
            <dd className="mt-1 break-words text-sm text-foreground">{row.value}</dd>
          </div>
        ))}
      </dl>
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

function PendingBookingPanel({
  organizationName,
  planTitle,
  booking,
  currency,
  depositPercent,
}: {
  organizationName: string;
  planTitle: string;
  booking: {
    bookingNumber: string;
    eventDate: Date | string;
    startTime: string;
    endTime: string;
    guestCount: number;
    totalCents?: number | null;
    depositRequiredCents?: number | null;
    currency?: string | null;
  } | null;
  currency: string;
  depositPercent?: number | null;
}) {
  const displayCurrency = booking?.currency || currency;
  return (
    <div className="mt-3 rounded-md border border-primary/40 bg-primary/5 px-5 py-6">
      <p className="text-xs font-semibold tracking-[0.18em] text-primary uppercase">Booking request received</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">Booking request received</h1>
      <p className="mt-3 max-w-2xl text-sm text-foreground/80">
        Your booking request has been saved. The next step is the required deposit. Your booking is not yet
        confirmed and inventory is not reserved until payment is received. A final availability check will be
        performed when payment is completed.
      </p>
      <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-foreground/70">
        <li>{planTitle}</li>
        {booking ? (
          <>
            <li>Reference: {booking.bookingNumber}</li>
            <li>{formatEventLocalDateTime({ date: booking.eventDate, time: booking.startTime })}</li>
            <li>
              {formatEventLocalTime(booking.startTime)}–{formatEventLocalTime(booking.endTime)} ·{" "}
              {booking.guestCount} guests
            </li>
            {booking.totalCents != null ? (
              <li>Total {formatMoneyFromCents(booking.totalCents, displayCurrency)}</li>
            ) : null}
            {booking.depositRequiredCents != null ? (
              <li>
                {formatEstimatedDepositLine(booking.depositRequiredCents, depositPercent, displayCurrency)}
              </li>
            ) : null}
          </>
        ) : null}
        <li>Your booking is not yet confirmed. The required deposit and final availability check are still needed.</li>
        <li>
          Online payment is not enabled in this test environment. {organizationName} can continue the booking
          with you.
        </li>
      </ul>
    </div>
  );
}

function AdjustmentNotice({ note }: { note?: string }) {
  const [dismissed, setDismissed] = useState(false);
  if (!note || dismissed) {
    return null;
  }
  return (
    <div className="mt-6 rounded-md border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-foreground">
      <div className="flex items-start justify-between gap-3">
        <p>{note}</p>
        <button
          type="button"
          className="shrink-0 text-xs font-medium text-foreground/70 underline"
          onClick={() => setDismissed(true)}
        >
          Dismiss
        </button>
      </div>
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
          : "Thanks — your inquiry has been submitted."}
      </h1>
      <p className="mt-3 max-w-2xl text-sm text-foreground/80">
        {availabilityChanged
          ? `A member of the events team will follow up to confirm the final details and availability. Your preferred plan (${planTitle}) is saved. The time is not reserved.`
          : `A member of the ${organizationName} events team will follow up with you to review the details and help finalize your event.`}
      </p>
      <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-foreground/70">
        <li>Your inquiry has been submitted — you do not need to fill everything out again.</li>
        <li>Inventory is not reserved. The time is not held.</li>
        <li>{CUSTOMER_AVAILABILITY_NOTE}</li>
      </ul>
    </div>
  );
}

function ProposalComparison({
  plans,
  currency,
  token,
  selectedId,
  hideCta,
  sharedDurationMinutes: sharedDuration,
}: {
  plans: PlanCard[];
  currency: string;
  token: string;
  selectedId: string | null;
  hideCta: boolean;
  sharedDurationMinutes: number | null;
}) {
  const recommended = plans.find((plan) => isBestFitTier(plan.tier)) ?? plans[0];
  const [mobileTier, setMobileTier] = useState(recommended?.tier ?? EVENT_PLAN_TIERS.BEST_FIT);
  const mobilePlan = plans.find((plan) => plan.tier === mobileTier) ?? recommended;
  const presentTiers = plans.map((plan) => plan.tier);

  function onTierKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft" && event.key !== "Home" && event.key !== "End") {
      return;
    }
    event.preventDefault();
    const nextIndex =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? plans.length - 1
          : event.key === "ArrowRight"
            ? (index + 1) % plans.length
            : (index - 1 + plans.length) % plans.length;
    const next = plans[nextIndex];
    if (!next) {
      return;
    }
    setMobileTier(next.tier);
    document.getElementById(`proposal-tier-${next.tier}`)?.focus();
  }

  return (
    <div className="mt-6">
      <div
        role="tablist"
        aria-label="Proposal options"
        data-proposal-tier-selector
        className="mb-4 grid grid-cols-3 gap-1 rounded-full bg-muted p-1 lg:hidden"
      >
        {plans.map((plan, index) => {
          const selected = plan.tier === mobilePlan?.tier;
          const presentation = packagePresentation(plan.tier);
          return (
            <button
              key={plan.id}
              id={`proposal-tier-${plan.tier}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls="proposal-mobile-panel"
              tabIndex={selected ? 0 : -1}
              className={`box-border min-h-11 min-w-0 cursor-pointer rounded-full border px-2 py-2 text-center outline-2 -outline-offset-2 focus-visible:outline-primary ${
                selected
                  ? "border-primary bg-surface font-semibold text-primary shadow-sm outline-primary/40"
                  : "border-transparent bg-transparent font-medium text-foreground outline-transparent"
              }`}
              onClick={() => setMobileTier(plan.tier)}
              onKeyDown={(event) => onTierKeyDown(event, index)}
            >
              <span className="block truncate">{presentation.label}</span>
              <span className="block text-xs" aria-hidden={selected ? undefined : true}>
                {selected ? "Selected" : "\u00a0"}
              </span>
            </button>
          );
        })}
      </div>
      <div
        id="proposal-mobile-panel"
        role="tabpanel"
        aria-labelledby={mobilePlan ? `proposal-tier-${mobilePlan.tier}` : undefined}
        data-proposal-mobile
        className="lg:hidden"
      >
        {mobilePlan ? (
          <PlanOptionCard
            plan={mobilePlan}
            previous={planByTier(plans, previousTierInSet(mobilePlan.tier, presentTiers))}
            currency={currency}
            token={token}
            selected={selectedId === mobilePlan.id}
            hideCta={hideCta}
            sharedDurationMinutes={sharedDuration}
          />
        ) : null}
      </div>
      <div data-proposal-desktop className="hidden items-start gap-4 lg:grid lg:grid-cols-3">
        {plans.map((plan) => (
          <PlanOptionCard
            key={plan.id}
            plan={plan}
            previous={planByTier(plans, previousTierInSet(plan.tier, presentTiers))}
            currency={currency}
            token={token}
            selected={selectedId === plan.id}
            hideCta={hideCta}
            sharedDurationMinutes={sharedDuration}
          />
        ))}
      </div>
    </div>
  );
}

function planByTier(plans: PlanCard[], tier: string | null): PlanCard | null {
  if (!tier) {
    return null;
  }
  return plans.find((plan) => plan.tier === tier) ?? null;
}

function PlanOptionCard({
  plan,
  previous,
  currency,
  token,
  selected,
  hideCta,
  sharedDurationMinutes: sharedDuration,
}: {
  plan: PlanCard;
  previous: PlanCard | null;
  currency: string;
  token: string;
  selected: boolean;
  hideCta: boolean;
  sharedDurationMinutes: number | null;
}) {
  const payload = readEventPlanPayload(plan.payload);
  const previousPayload = previous ? readEventPlanPayload(previous.payload) : null;
  const presentation = packagePresentation(plan.tier);
  const recommended = isBestFitTier(plan.tier);
  const total = plan.estimatedTotalCents ?? 0;
  const guestCount = payload.guestCount || null;
  const perPerson = guestCount ? perPersonCents(total, guestCount) : null;
  const displayCurrency = plan.currency || currency;
  const packageDurationMinutes = plan.durationMinutes ?? payload.durationMinutes;
  const showPackageDuration =
    packageDurationMinutes > 0 && (sharedDuration == null || sharedDuration !== packageDurationMinutes);
  const sampleItinerary = (payload.itinerary ?? []).filter(isSampleItinerarySegment);
  const adjustedWindow = formatAdjustedEventWindow(
    payload.startTime,
    plan.durationMinutes ?? payload.durationMinutes,
  );
  const availabilityNote = formatCustomerFacingClocks(
    customerAvailabilityCopy({
      availabilityStatus: plan.availabilityStatus,
      itineraryAdjusted: payload.itineraryAdjusted,
      customerAvailabilityNote: payload.customerAvailabilityNote,
    }),
  );
  const recommendation = formatCustomerDurationText(formatCustomerFacingClocks(plan.customerFacingReason));
  const budgetLine = budgetFitCustomerText({
    code: payload.budgetExplanationCode,
    differenceCents: payload.budgetDifferenceCents,
    currency: displayCurrency,
    preservedSelections: payload.budgetPreservedSelections === true,
  });
  const durationNote = formatCustomerFacingClocks(payload.durationNote);
  const unavailable =
    plan.availabilityStatus === PLAN_AVAILABILITY_STATUSES.UNAVAILABLE ||
    plan.availabilityStatus === PLAN_AVAILABILITY_STATUSES.NEEDS_ADJUSTMENT;
  const coverageReady = !payload.coverageFeasibility || payload.coverageFeasibility === "FEASIBLE";
  const scheduleInfeasible = isEventPlanScheduleInfeasible(payload);
  const canContinue =
    coverageReady &&
    !unavailable &&
    !scheduleInfeasible &&
    plan.availabilityStatus !== PLAN_AVAILABILITY_STATUSES.AVAILABILITY_CHANGED;
  const upgrades = describeTierImprovements(previousPayload, payload);
  const previousLabel = previous ? packagePresentation(previous.tier).label : null;
  const taxNote = customerTaxNote(payload.taxBreakdown, displayCurrency);
  const itemized = itemizedTotalMatchesEstimate(payload, plan.estimatedTotalCents);

  return (
    <article
      data-plan-card
      aria-current={selected ? "true" : undefined}
      className={`box-border flex w-full flex-col rounded-[var(--radius-card)] border outline-2 -outline-offset-2 ${
        recommended ? "border-primary shadow-[var(--shadow-card)] outline-primary/40" : "border-border outline-transparent"
      } ${selected ? "bg-primary/5" : "bg-surface"}`}
    >
      <div data-plan-summary className="px-5 pt-5">
        <p className={`text-xs font-semibold tracking-[0.16em] uppercase ${recommended ? "text-primary" : "text-muted-foreground"}`}>
          {presentation.label}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">{presentation.subtitle}</p>
        <h2 className="mt-2 text-lg font-semibold break-words">{plan.title}</h2>
        <PriceBreakdown
          className="mt-3"
          density="compact"
          currency={displayCurrency}
          totalCents={total}
          pricingComplete={payload.pricingComplete === true}
          guestCount={guestCount}
          perPersonCents={perPerson}
          depositPreviewCents={payload.depositPreviewCents}
          depositPreviewPercent={payload.depositPreviewPercent}
          budgetLine={budgetLine}
        />
      </div>
      <div data-plan-details className="px-5 py-4">
        {upgrades.length > 0 && previousLabel ? (
          <PlanSection title={`What this adds over ${previousLabel}`}>
            <ul data-upgrade-lines className="list-disc space-y-1 pl-5">
              {upgrades.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </PlanSection>
        ) : null}

        <PlanSection title="Activities & Experiences">
          <InclusionList
            emptyLabel="To be confirmed with our team"
            items={activityLines(payload, displayCurrency)}
          />
        </PlanSection>

        <PlanSection title="Food & Drinks">
          <InclusionList
            emptyLabel={
              payload.dining.label === DINING_PREFERENCE_LABELS.none
                ? "No food included"
                : isUnresolvedDining(payload.dining)
                  ? UNCONFIRMED_DINING_LABEL
                  : payload.dining.label
            }
            items={foodLines(payload, displayCurrency)}
          />
        </PlanSection>

        {spaceLines(payload, displayCurrency).length > 0 || payload.spaceUnconfirmed ? (
          <PlanSection title="Private Space / Room">
            {payload.spaceUnconfirmed && spaceLines(payload, displayCurrency).length === 0 ? (
              <p>Private space could not be confirmed for this option.</p>
            ) : (
              <InclusionList items={spaceLines(payload, displayCurrency)} />
            )}
          </PlanSection>
        ) : null}

        {addonLines(payload, displayCurrency).length > 0 ? (
          <PlanSection title="Additional Inclusions">
            <InclusionList items={addonLines(payload, displayCurrency)} />
          </PlanSection>
        ) : null}

        <PlanSection title="Price details">
          <PackagePriceDetails
            payload={payload}
            currency={displayCurrency}
            itemized={itemized}
            taxNote={taxNote}
          />
        </PlanSection>

        <PlanSection title="Sample timeline">
          {payload.itineraryPrecise === false ? (
            <div>
              {payload.schedule.length > 0 ? (
                <ul className="list-disc space-y-1 pl-5">
                  {payload.schedule.map((row) => (
                    <li key={row}>{formatCustomerDurationText(row)}</li>
                  ))}
                </ul>
              ) : (
                <p>Activity times will be confirmed with our event team.</p>
              )}
              {payload.scheduleLimitation ? <p className="mt-2">{payload.scheduleLimitation}</p> : null}
            </div>
          ) : sampleItinerary.length > 0 ? (
            <ul className="list-disc space-y-1 pl-5">
              {sampleItinerary.map((segment) => (
                <li key={`${segment.startTime}-${segment.label}`}>
                  {formatItineraryRange(segment.startTime, segment.endTime)} {formatCustomerDurationText(segment.label)}
                </li>
              ))}
            </ul>
          ) : payload.schedule.length > 0 ? (
            <ul className="list-disc space-y-1 pl-5">
              {payload.schedule.map((row) => (
                <li key={row}>{formatCustomerDurationText(formatItineraryLine(row))}</li>
              ))}
            </ul>
          ) : (
            <p>To be confirmed with our event team</p>
          )}
        </PlanSection>

        {showPackageDuration ? (
          <PlanSection title="Event length">
            <p>{formatEventDuration(packageDurationMinutes)}</p>
          </PlanSection>
        ) : null}

        <PlanSection title="Availability">
          <p>{availabilityNote}</p>
          {payload.itineraryAdjusted && adjustedWindow ? <p className="mt-2">Adjusted to: {adjustedWindow}</p> : null}
        </PlanSection>

        {payload.itineraryAdjusted ? (
          <p className="mt-3 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs">
            Adjusted from your requested time
            {adjustedWindow ? (
              <>
                <br />
                Adjusted to: {adjustedWindow}
              </>
            ) : null}
          </p>
        ) : null}

        <PlanSection title="About this package">
          <p>{recommendation}</p>
          {durationNote && !recommendation.includes(durationNote) ? <p className="mt-2">{durationNote}</p> : null}
          {payload.itineraryAdjusted && (payload.adjustmentNote || payload.customerAvailabilityNote) ? (
            <p className="mt-2">
              {formatCustomerFacingClocks(payload.adjustmentNote || payload.customerAvailabilityNote)}
            </p>
          ) : null}
          <p className="mt-2 text-xs text-foreground/55">{CUSTOMER_AVAILABILITY_NOTE}</p>
          {scheduleInfeasible ? (
            <p className="mt-2 text-xs text-foreground/70">
              {payload.scheduleLimitation?.trim() || SCHEDULE_INFEASIBLE_CUSTOMER_NOTE}
            </p>
          ) : (
            <>
              <p className="mt-2 text-xs text-foreground/55">{CONTINUE_PACKAGE_EXPLANATION}</p>
              <p className="mt-2 text-xs text-foreground/55">{BOOK_NOW_EXPLANATION}</p>
            </>
          )}
          {payload.suggestedStartTimes && payload.suggestedStartTimes.length > 0 ? (
            <p className="mt-2 text-xs text-foreground/70">
              Nearby times to consider:{" "}
              {payload.suggestedStartTimes.map((time) => formatEventLocalTime(time) ?? time).join(", ")}.
            </p>
          ) : null}
        </PlanSection>
      </div>

      <div data-plan-actions className="border-t border-border px-5 py-4">
        {selected ? (
          <p className="text-sm font-medium text-primary">You chose this event plan</p>
        ) : hideCta ? null : (
          <ChoosePlanButton
            planId={plan.id}
            token={token}
            planLabel={presentation.label}
            emphasized={recommended}
            allowContinue={canContinue}
            scheduleInfeasible={scheduleInfeasible}
            scheduleLimitation={payload.scheduleLimitation}
          />
        )}
      </div>
    </article>
  );
}

function PackagePriceDetails({
  payload,
  currency,
  itemized,
  taxNote,
}: {
  payload: EventPlanPayload;
  currency: string;
  itemized: boolean;
  taxNote: string | null;
}) {
  const priced = (payload.lineItems ?? [])
    .map((item) => formatComponentPrice(item, currency))
    .filter((row): row is string => Boolean(row));
  return (
    <div className="space-y-2">
      {priced.length > 0 ? (
        <ul className="list-disc space-y-1 pl-5">
          {priced.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : (
        <p>A component breakdown is not available for this estimate.</p>
      )}
      {priced.length > 0 && !itemized ? (
        <p>This estimate includes items that are not listed individually.</p>
      ) : null}
      {taxNote ? <p>{taxNote}</p> : null}
    </div>
  );
}

function activityLines(payload: EventPlanPayload, currency: string): string[] {
  if (payload.activities.length > 0) {
    return payload.activities.map((activity) => {
      const priced = matchingLineItem(payload, { name: activity.name, productId: activity.productId });
      if (priced) {
        return formatComponentPrice(priced, currency) ?? formatCustomerDurationText(activity.name);
      }
      const quantity =
        activity.quantity > 1 && activity.unitLabel ? ` · ${activity.quantity} ${activity.unitLabel}s` : "";
      return `${formatCustomerDurationText(activity.name)}${quantity}`;
    });
  }
  return (payload.lineItems ?? [])
    .filter((row) => classifyProductKind(row.kind) === "activity")
    .map((row) => formatComponentPrice(row, currency) ?? formatCustomerDurationText(row.name));
}

function foodLines(payload: EventPlanPayload, currency: string): string[] {
  const foodItems = (payload.lineItems ?? []).filter((row) => classifyProductKind(row.kind) === "food");
  const lines = foodItems.map((row) => formatComponentPrice(row, currency) ?? formatCustomerDurationText(row.name));
  const beverageLines = (payload.beverages ?? []).map((item) => {
    const quantity = item.quantity ? ` · ${item.quantity}${item.unitLabel ? ` ${item.unitLabel}` : ""}` : "";
    return `${formatCustomerDurationText(item.name)}${quantity}`;
  });
  if (lines.length > 0) {
    return [...lines, ...beverageLines];
  }
  if (isUnresolvedDining(payload.dining) || payload.dining.label === DINING_PREFERENCE_LABELS.none) {
    return beverageLines;
  }
  if (payload.dining.label.trim()) {
    return [payload.dining.label, ...beverageLines];
  }
  return beverageLines;
}

function spaceLines(payload: EventPlanPayload, currency: string): string[] {
  const rentalItems = (payload.lineItems ?? []).filter((row) => classifyProductKind(row.kind) === "space");
  if (rentalItems.length > 0) {
    return rentalItems.map((row) => spaceLineFromItem(row, currency));
  }
  return payload.spaces.map((space) => {
    const window =
      space.startTime && space.endTime ? formatItineraryRange(space.startTime, space.endTime) : null;
    const reservation =
      space.durationMinutes && space.durationMinutes > 0
        ? `${formatEventDuration(space.durationMinutes)} reservation`
        : null;
    return [formatCustomerDurationText(space.name), reservation, window].filter(Boolean).join(" · ");
  });
}

function spaceLineFromItem(item: EventPlanLineItem, currency: string): string {
  return formatComponentPrice(item, currency) ?? formatCustomerDurationText(item.name);
}

function addonLines(payload: EventPlanPayload, currency: string): string[] {
  const addons = (payload.lineItems ?? []).filter((row) => classifyProductKind(row.kind) === "addon");
  const fromItems = addons.map((row) => formatComponentPrice(row, currency) ?? formatCustomerDurationText(row.name));
  const extras = (payload.includedItems ?? []).map((item) => {
    const quantity = item.quantity ? ` · ${item.quantity}${item.unitLabel ? ` ${item.unitLabel}` : ""}` : "";
    return `${formatCustomerDurationText(item.name)}${quantity}`;
  });
  return uniqueDisplayLines([...fromItems, ...extras]);
}

function uniqueDisplayLines(lines: string[]): string[] {
  return [...new Set(lines.filter((row) => row.trim().length > 0))];
}

function InclusionList({ items, emptyLabel }: { items: string[]; emptyLabel?: string }) {
  if (items.length === 0) {
    return <p>{emptyLabel ?? "None listed"}</p>;
  }
  return (
    <ul className="list-disc space-y-1 pl-5">
      {items.map((item) => (
        <li key={item} className="break-words">
          {item}
        </li>
      ))}
    </ul>
  );
}

function PlanSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mt-5 text-sm">
      <p className="font-medium">{title}</p>
      <div className="mt-1 text-foreground/80">{children}</div>
    </div>
  );
}

function ChoosePlanButton({
  planId,
  token,
  planLabel,
  emphasized,
  allowContinue,
  scheduleInfeasible,
  scheduleLimitation,
}: {
  planId: string;
  token: string;
  planLabel: string;
  emphasized: boolean;
  allowContinue: boolean;
  scheduleInfeasible: boolean;
  scheduleLimitation?: string | null;
}) {
  const router = useRouter();
  const pendingRef = useRef(false);
  const [pending, setPending] = useState(false);
  const [pendingLabel, setPendingLabel] = useState("Working…");

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
    setPendingLabel(
      action === reservePublicEventPlanAction ? "Saving your booking request…" : "Submitting your inquiry…",
    );
    setPending(true);
    await yieldToPaint();
    try {
      const result = await action(formData);
      if (!result.ok) {
        notify.error({ title: result.title ?? errorTitle, description: result.message });
        if (result.code === "AVAILABILITY_CHANGED" || result.refresh) {
          router.refresh();
        }
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
    <>
      <PendingActionProvider pending={pending}>
        <div className="space-y-2">
          {allowContinue ? (
            <form
              onSubmit={(event) => submit(event, reservePublicEventPlanAction, "Unable to save that booking request")}
            >
              <input type="hidden" name="token" value={token} />
              <input type="hidden" name="planId" value={planId} />
              <PendingSubmitButton
                pendingLabel="Saving…"
                aria-label={`Continue with this package: ${planLabel}`}
                className={
                  emphasized
                    ? "w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
                    : "w-full rounded-md border border-border px-4 py-2 text-sm font-medium"
                }
              >
                Continue with this package
              </PendingSubmitButton>
            </form>
          ) : scheduleInfeasible ? (
            <p className="rounded-md border border-border px-3 py-2 text-sm text-foreground/70">
              {scheduleLimitation?.trim() || SCHEDULE_INFEASIBLE_CUSTOMER_NOTE}
            </p>
          ) : (
            <p className="rounded-md border border-border px-3 py-2 text-sm text-foreground/70">
              This option is not available at the requested time.
            </p>
          )}
          <form onSubmit={(event) => submit(event, selectPublicEventPlanAction, "Unable to submit inquiry")}>
            <input type="hidden" name="token" value={token} />
            <input type="hidden" name="planId" value={planId} />
            <PendingSubmitButton
              pendingLabel="Submitting…"
              aria-label={`Submit inquiry: ${planLabel}`}
              className="w-full rounded-md border border-border px-4 py-2 text-sm font-medium"
            >
              Submit inquiry
            </PendingSubmitButton>
          </form>
          {allowContinue ? (
            <p className="text-xs text-muted-foreground">{CONTINUE_PACKAGE_EXPLANATION}</p>
          ) : null}
        </div>
      </PendingActionProvider>
      <BlockingMutation active={pending} label={pendingLabel} />
    </>
  );
}
