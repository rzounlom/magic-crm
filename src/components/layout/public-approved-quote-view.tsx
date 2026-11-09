"use client";

import { useRouter } from "next/navigation";
import { unstable_rethrow } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";

import { PUBLIC_CONTENT_CLASS } from "@/components/layout/public-content";
import { BlockingMutation } from "@/components/ui/blocking-mutation";
import { PendingActionProvider, PendingSubmitButton } from "@/components/ui/pending-submit-button";
import { formatMoneyFromCents } from "@/lib/event-planner/money";
import { readEventPlanPayload } from "@/lib/event-planner/payload";
import { formatEventLocalDateTime } from "@/lib/inquiries/tenant-datetime";
import { onSafeSubmitAttempt } from "@/lib/ui/confirm-gate";
import { notify } from "@/lib/ui/notify";
import { yieldToPaint } from "@/lib/ui/yield-to-paint";
import { selectPublicEventPlanAction } from "@/server/actions/public-inquiry";

const APPROVED_QUOTE_MARKER = "employee_approved_wordpress_quote";

type PlanCard = {
  id: string;
  title: string;
  estimatedTotalCents: number | null;
  currency: string;
  durationMinutes: number | null;
  customerFacingReason: string;
  payload: unknown;
};

export function isEmployeeApprovedQuotePlan(plan: { payload: unknown }): boolean {
  if (!plan.payload || typeof plan.payload !== "object") {
    return false;
  }
  const marker = (plan.payload as { employeeApprovedQuote?: { marker?: string } }).employeeApprovedQuote;
  return marker?.marker === APPROVED_QUOTE_MARKER;
}

/**
 * Single employee-approved quote (WordPress-sourced). No Good / Recommended / Premium tiers.
 */
export function PublicApprovedQuoteView({
  organizationName,
  currency,
  plan,
  token,
  customerFirstName,
  selectedEventPlanId,
  desiredDate,
  desiredStartTime,
}: {
  organizationName: string;
  currency: string;
  plan: PlanCard;
  token: string;
  customerFirstName: string | null;
  selectedEventPlanId: string | null;
  desiredDate?: Date | string | null;
  desiredStartTime?: string | null;
}) {
  const router = useRouter();
  const pendingRef = useRef(false);
  const [pending, setPending] = useState(false);
  const payload = readEventPlanPayload(plan.payload);
  const approvedMeta =
    payload.employeeApprovedQuote?.marker === APPROVED_QUOTE_MARKER
      ? payload.employeeApprovedQuote
      : null;
  const total = plan.estimatedTotalCents ?? 0;
  const lineItems = payload.lineItems ?? [];
  const alreadySelected = selectedEventPlanId === plan.id;
  const firstName = customerFirstName || "there";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (onSafeSubmitAttempt(pendingRef.current) === "block") {
      return;
    }
    const formData = new FormData(event.currentTarget);
    pendingRef.current = true;
    setPending(true);
    await yieldToPaint();
    try {
      const result = await selectPublicEventPlanAction(formData);
      if (!result.ok) {
        notify.error({
          title: result.title ?? "Unable to accept quote",
          description: result.message,
        });
        if (result.refresh) {
          router.refresh();
        }
        return;
      }
      notify.success({
        title: "Quote accepted",
        description: "Our team will follow up to finalize your booking.",
      });
      router.refresh();
    } catch (error) {
      unstable_rethrow(error);
      notify.error({
        title: "Unable to accept quote",
        description: "Something went wrong. Try again.",
      });
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }

  return (
    <section className={`${PUBLIC_CONTENT_CLASS} py-6 sm:py-8`} data-employee-approved-quote>
      <p className="page-eyebrow">{organizationName}</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">Your event quote</h1>
      <p className="mt-2 max-w-2xl text-sm text-foreground/80">
        Hi {firstName} — here is the quote our team prepared for your event. This is not a confirmed
        reservation.
      </p>

      <div className="mt-6 rounded-md border border-border px-5 py-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">{plan.title}</h2>
            <p className="mt-1 text-sm text-foreground/70">{plan.customerFacingReason}</p>
          </div>
          <p className="text-2xl font-semibold">
            {formatMoneyFromCents(total, plan.currency || currency)}
          </p>
        </div>

        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-foreground/60">Event date / time</dt>
            <dd className="mt-1">
              {formatEventLocalDateTime({
                date: payload.eventDate ?? desiredDate ?? null,
                time: payload.startTime ?? desiredStartTime ?? null,
              })}
            </dd>
          </div>
          <div>
            <dt className="text-foreground/60">Guests</dt>
            <dd className="mt-1">{payload.guestCount || "—"}</dd>
          </div>
          <div>
            <dt className="text-foreground/60">Duration</dt>
            <dd className="mt-1">
              {plan.durationMinutes ? `${plan.durationMinutes} minutes` : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-foreground/60">Dining</dt>
            <dd className="mt-1">{payload.dining.label}</dd>
          </div>
        </dl>

        {payload.activities.length > 0 ? (
          <div className="mt-4">
            <p className="text-xs font-medium uppercase tracking-wide text-foreground/60">Activities</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
              {payload.activities.map((activity) => (
                <li key={`${activity.name}-${activity.quantity}`}>
                  {activity.name}
                  {activity.quantity > 1 ? ` × ${activity.quantity}` : ""}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {payload.schedule.length > 0 ? (
          <div className="mt-4">
            <p className="text-xs font-medium uppercase tracking-wide text-foreground/60">Schedule</p>
            <ul className="mt-2 space-y-1 text-sm">
              {payload.schedule.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {lineItems.length > 0 ? (
          <div className="mt-4">
            <p className="text-xs font-medium uppercase tracking-wide text-foreground/60">
              Itemized pricing
            </p>
            <ul className="mt-2 space-y-1 text-sm">
              {lineItems.map((item) => (
                <li key={`${item.slug}-${item.name}`} className="flex justify-between gap-3">
                  <span>
                    {item.name}
                    {item.quantity > 1 ? ` × ${item.quantity}` : ""}
                  </span>
                  <span>{formatMoneyFromCents(item.totalCents, plan.currency || currency)}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {approvedMeta && !approvedMeta.availabilityConfirmed ? (
          <p className="mt-4 text-xs text-foreground/70">
            {approvedMeta.availabilityNote ||
              "Final resource availability will be confirmed by our event team."}
          </p>
        ) : null}
      </div>

      {alreadySelected ? (
        <p className="mt-6 text-sm text-foreground/80">
          Thanks — we received your acceptance. Our team will follow up to finalize your booking.
        </p>
      ) : (
        <PendingActionProvider pending={pending}>
          <form onSubmit={submit} className="mt-6">
            <input type="hidden" name="token" value={token} />
            <input type="hidden" name="planId" value={plan.id} />
            <PendingSubmitButton
              pendingLabel="Accepting…"
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            >
              Accept this quote
            </PendingSubmitButton>
          </form>
          <BlockingMutation active={pending} label="Saving your acceptance…" />
        </PendingActionProvider>
      )}
    </section>
  );
}
