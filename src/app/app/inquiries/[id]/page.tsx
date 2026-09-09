import Link from "next/link";
import { notFound } from "next/navigation";

import { EmployeeInquiryConversation } from "@/components/layout/employee-inquiry-conversation";
import { EmployeeSelectedEventPlan } from "@/components/layout/employee-selected-event-plan";
import { EmployeeSelectedPlanResourceCheck } from "@/components/layout/employee-selected-plan-resource-check";
import { InquiryFunnel } from "@/components/layout/inquiry-funnel";
import { SecurityActionForm } from "@/components/layout/security-action-form";
import { SecurityStatusPanel } from "@/components/layout/security-status-panel";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import { db } from "@/lib/db";
import {
  formatBudgetRange,
  formatDiningPreference,
  formatEventDuration,
  formatGuestMix,
  formatSpacePreference,
} from "@/lib/event-planner/labels";
import { formatInquiryQueueLabel } from "@/lib/inquiries/inquiry-status-display";
import {
  CUSTOMER_SELECTED_PLAN_BANNER,
  formatReadyForHumanReason,
} from "@/lib/inquiries/ready-for-human-reason";
import { formatPhoneDisplay } from "@/lib/inquiries/public-phone";
import { formatEventLocalDateTime } from "@/lib/inquiries/tenant-datetime";
import {
  sendEmployeeInquiryMessageAction,
  takeOverInquiryAction,
} from "@/server/actions/inquiries";
import { isAuthorizationError, isInquiryError, isTenantContextError } from "@/server/errors";
import { getRequestContext } from "@/server/get-request-context";
import { hasPermission } from "@/server/policies/require-permission";
import { getCurrentTenantTimezone, getInquiryDetail } from "@/server/services/inquiry-service";
import { getInquiryPlanAvailabilitySnapshot } from "@/server/services/resource-hold-service";
import { PERMISSIONS } from "@/types/permissions";

type InquiryDetailView =
  | { kind: "status"; title: string; body: string }
  | { kind: "missing" }
  | {
      kind: "ready";
      inquiry: NonNullable<Awaited<ReturnType<typeof getInquiryDetail>>>;
      canManage: boolean;
      canHold: boolean;
      canRelease: boolean;
      timeZone: string;
      resourceCheck: Awaited<ReturnType<typeof getInquiryPlanAvailabilitySnapshot>> | null;
    };

async function loadInquiryDetailView(id: string): Promise<InquiryDetailView> {
  try {
    const ctx = await getRequestContext();
    const [inquiry, canManage, canHold, canRelease, timeZone] = await Promise.all([
      getInquiryDetail(ctx, db, id),
      hasPermission(ctx, PERMISSIONS.CRM_INQUIRIES_MANAGE, db),
      hasPermission(ctx, PERMISSIONS.EVENTS_CREATE, db),
      hasPermission(ctx, PERMISSIONS.EVENTS_EDIT, db),
      getCurrentTenantTimezone(ctx, db),
    ]);
    if (!inquiry) {
      return { kind: "missing" };
    }
    const selectedPlan = inquiry.eventPlanRecommendations.find((plan) => plan.id === inquiry.selectedEventPlanId);
    const resourceCheck = selectedPlan
      ? await getInquiryPlanAvailabilitySnapshot(ctx, db, inquiry, selectedPlan)
      : null;
    return { kind: "ready", inquiry, canManage, canHold, canRelease, timeZone, resourceCheck };
  } catch (error) {
    if (isAuthorizationError(error) || isTenantContextError(error) || isInquiryError(error)) {
      return { kind: "status", title: "Inquiry", body: error.userMessage };
    }
    throw error;
  }
}

export default async function InquiryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const view = await loadInquiryDetailView(id);
  if (view.kind === "status") {
    return <SecurityStatusPanel title={view.title} body={view.body} />;
  }
  if (view.kind === "missing") {
    notFound();
  }

  const { inquiry, canManage, canHold, canRelease, timeZone, resourceCheck } = view;
  const conversation = inquiry.conversations[0];
  const selectedPlan = inquiry.eventPlanRecommendations.find(
    (plan) => plan.id === inquiry.selectedEventPlanId,
  );
  const displayName =
    inquiry.customerGroupName ||
    [inquiry.customerFirstName, inquiry.customerLastName].filter(Boolean).join(" ") ||
    inquiry.customerEmail;
  const phoneDisplay = formatPhoneDisplay(inquiry.customerPhone);
  const mailto = `mailto:${inquiry.customerEmail}${
    inquiry.customerFirstName
      ? `?subject=${encodeURIComponent(`Your event plan at our venue`)}`
      : ""
  }`;

  return (
    <section className="max-w-3xl">
      <Link href="/app/inquiries" className="text-sm text-primary">
        Back to inquiries
      </Link>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground">{displayName}</h1>
      <p className="mt-2 text-sm font-medium text-foreground">
        {formatInquiryQueueLabel(inquiry)}
      </p>
      {inquiry.selectedEventPlanId ? (
        <p className="mt-2 rounded-md border border-primary/40 bg-primary/5 px-3 py-2 text-sm font-semibold tracking-[0.12em] uppercase">
          {CUSTOMER_SELECTED_PLAN_BANNER}
        </p>
      ) : null}

      <div className="mt-8 border-t border-border pt-6">
        <h2 className="text-sm font-medium text-foreground">Customer activity</h2>
        <InquiryFunnel
          timeZone={timeZone}
          inquiry={{
            ...inquiry,
            selectedPlanTitle: selectedPlan?.title,
            selectedPlanTier: selectedPlan?.tier,
          }}
        />
      </div>

      <dl className="mt-8 grid gap-4 border-t border-border pt-6 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-foreground/60">Customer / group</dt>
          <dd className="mt-1">{inquiry.customerGroupName || displayName}</dd>
        </div>
        <div>
          <dt className="text-foreground/60">Contact</dt>
          <dd className="mt-1">
            {[inquiry.customerFirstName, inquiry.customerLastName].filter(Boolean).join(" ") || "—"}
          </dd>
        </div>
        <div>
          <dt className="text-foreground/60">Email</dt>
          <dd className="mt-1">{inquiry.customerEmail}</dd>
        </div>
        <div>
          <dt className="text-foreground/60">Phone</dt>
          <dd className="mt-1">{phoneDisplay || "—"}</dd>
        </div>
        <div>
          <dt className="text-foreground/60">Event type</dt>
          <dd className="mt-1">{inquiry.eventType || "—"}</dd>
        </div>
        <div>
          <dt className="text-foreground/60">Date / time</dt>
          <dd className="mt-1">
            {formatEventLocalDateTime({
              date: inquiry.desiredDate,
              time: inquiry.desiredStartTime,
            })}
          </dd>
        </div>
        <div>
          <dt className="text-foreground/60">Guests</dt>
          <dd className="mt-1">{inquiry.guestCount ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-foreground/60">Guest mix</dt>
          <dd className="mt-1">{formatGuestMix(inquiry.guestMix)}</dd>
        </div>
        <div>
          <dt className="text-foreground/60">Event length</dt>
          <dd className="mt-1">{formatEventDuration(inquiry.desiredDurationMinutes)}</dd>
        </div>
        <div>
          <dt className="text-foreground/60">Budget</dt>
          <dd className="mt-1">{formatBudgetRange(inquiry.budgetMin, inquiry.budgetMax)}</dd>
        </div>
        <div>
          <dt className="text-foreground/60">Event goal</dt>
          <dd className="mt-1">{inquiry.eventGoal || inquiry.occasion || "—"}</dd>
        </div>
        <div>
          <dt className="text-foreground/60">Dining preference</dt>
          <dd className="mt-1">{formatDiningPreference(inquiry.diningPreference)}</dd>
        </div>
        <div>
          <dt className="text-foreground/60">Space preference</dt>
          <dd className="mt-1">{formatSpacePreference(inquiry.spacePreference)}</dd>
        </div>
        <div>
          <dt className="text-foreground/60">Attraction interests</dt>
          <dd className="mt-1">
            {inquiry.attractionInterestNames.length > 0
              ? inquiry.attractionInterestNames.join(", ")
              : "—"}
          </dd>
        </div>
      </dl>
      {inquiry.customerNotes ? (
        <div className="mt-6 text-sm">
          <p className="text-foreground/60">Customer notes</p>
          <p className="mt-1 whitespace-pre-wrap text-foreground/80">{inquiry.customerNotes}</p>
        </div>
      ) : null}

      {selectedPlan ? (
        <EmployeeSelectedEventPlan
          plan={selectedPlan}
          desiredDate={inquiry.desiredDate}
          desiredStartTime={inquiry.desiredStartTime}
          selectedAt={inquiry.customerSelectedAt}
          timeZone={timeZone}
        />
      ) : null}
      {selectedPlan && resourceCheck ? (
        <EmployeeSelectedPlanResourceCheck
          inquiryId={inquiry.id}
          availabilityStatus={selectedPlan.availabilityStatus}
          live={resourceCheck}
          holds={inquiry.resourceReservations}
          canHold={canHold && canManage}
          canRelease={canRelease && canManage}
          timeZone={timeZone}
        />
      ) : null}

      {inquiry.internalSummary ? (
        <div className="mt-8 rounded-md border border-border px-4 py-4">
          <h2 className="text-sm font-medium text-foreground">Planner summary</h2>
          <p className="mt-2 whitespace-pre-wrap text-sm text-foreground/80">{inquiry.internalSummary}</p>
        </div>
      ) : null}
      {inquiry.humanHandoffReason && !inquiry.selectedEventPlanId ? (
        <div className="mt-4 rounded-md border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
          <p className="font-medium">Needs staff follow-up</p>
          <p className="mt-1 text-foreground/80">
            {formatReadyForHumanReason(inquiry.humanHandoffReason, inquiry.selectedEventPlanId)}
          </p>
        </div>
      ) : null}

      <div className="mt-6 flex flex-wrap gap-3">
        <a
          href={mailto}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Contact customer
        </a>
        {canManage && inquiry.aiHandlingEnabled ? (
          <SecurityActionForm
            action={takeOverInquiryAction}
            notice={{ successTitle: "Conversation taken over", errorTitle: "Unable to take over" }}
          >
            <input type="hidden" name="inquiryId" value={inquiry.id} />
            <PendingSubmitButton
              pendingLabel="Taking over…"
              className="rounded-md border border-border px-4 py-2 text-sm font-medium"
            >
              Take over
            </PendingSubmitButton>
          </SecurityActionForm>
        ) : null}
      </div>

      <h2 className="mt-10 text-lg font-semibold">Inquiry notes</h2>
      <EmployeeInquiryConversation messages={conversation?.messages ?? []} />
      {canManage && conversation ? (
        <SecurityActionForm
          action={sendEmployeeInquiryMessageAction}
          className="mt-6 space-y-3"
          notice={{ successTitle: "Reply sent", errorTitle: "Unable to send reply" }}
        >
          <input type="hidden" name="inquiryId" value={inquiry.id} />
          <input type="hidden" name="conversationId" value={conversation.id} />
          <label className="block text-sm">
            <span className="text-foreground/70">Internal / customer follow-up note</span>
            <textarea
              name="content"
              required
              rows={3}
              maxLength={2000}
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"
            />
          </label>
          <PendingSubmitButton
            pendingLabel="Sending…"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Add note
          </PendingSubmitButton>
        </SecurityActionForm>
      ) : null}
    </section>
  );
}
