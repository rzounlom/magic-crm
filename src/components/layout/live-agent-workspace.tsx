import Link from "next/link";

import { AgentWorkingPlanForm } from "@/components/layout/agent-working-plan-form";
import { CopyValueButton } from "@/components/layout/copy-value-button";
import { EmployeeInquiryConversation } from "@/components/layout/employee-inquiry-conversation";
import { EmployeeSelectedEventPlan } from "@/components/layout/employee-selected-event-plan";
import { EmployeeSelectedPlanResourceCheck } from "@/components/layout/employee-selected-plan-resource-check";
import { InquiryFunnel } from "@/components/layout/inquiry-funnel";
import { SecurityActionForm } from "@/components/layout/security-action-form";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import {
  formatBudgetRange,
  formatDiningPreference,
  formatEventDuration,
  formatGuestMix,
  formatSpacePreference,
} from "@/lib/event-planner/labels";
import { formatInquiryActivityAction } from "@/lib/inquiries/activity-labels";
import { workingPlanAffectsExistingHolds } from "@/lib/inquiries/plan-diff";
import { formatPhoneDisplay } from "@/lib/inquiries/public-phone";
import { CUSTOMER_SELECTED_PLAN_BANNER } from "@/lib/inquiries/ready-for-human-reason";
import { formatEventLocalDateTime, formatOrganizationTimestamp } from "@/lib/inquiries/tenant-datetime";
import { readEventPlanPayload } from "@/lib/event-planner/payload";
import {
  markCustomerContactedAction,
  markReadyToFinalizeAction,
  saveInternalNotesAction,
  startWorkingInquiryAction,
} from "@/server/actions/live-agent";
import { sendEmployeeInquiryMessageAction } from "@/server/actions/inquiries";
import { formatInquiryQueueLabel } from "@/lib/inquiries/inquiry-status-display";
import {
  deriveInquiryWorkflowStage,
  employeeDisplayName,
} from "@/lib/inquiries/workflow-stage";
import { INQUIRY_WORKFLOW_STAGE_LABELS, INQUIRY_WORKFLOW_STAGES } from "@/types/inquiry";

type WorkspaceInquiry = {
  id: string;
  updatedAt: Date;
  status: string;
  workflowStage: string | null;
  assignedUserProfileId: string | null;
  assignedAt: Date | null;
  customerContactedAt: Date | null;
  readyToFinalizeAt: Date | null;
  employeeInternalNotes: string | null;
  customerGroupName: string | null;
  customerFirstName: string | null;
  customerLastName: string | null;
  customerEmail: string;
  customerPhone: string | null;
  eventType: string | null;
  desiredDate: Date | null;
  desiredStartTime: string | null;
  guestCount: number | null;
  guestMix: string | null;
  desiredDurationMinutes: number | null;
  budgetMin: number | null;
  budgetMax: number | null;
  eventGoal: string | null;
  occasion: string | null;
  diningPreference: string | null;
  spacePreference: string | null;
  customerNotes: string | null;
  selectedEventPlanId: string | null;
  customerSelectedAt: Date | null;
  createdAt: Date;
  recommendationsGeneratedAt: Date | null;
  recommendationsViewedAt: Date | null;
  humanHandoffRequestedAt: Date | null;
  aiHandlingEnabled: boolean;
  humanHandoffReason: string | null;
  attractionInterestNames: string[];
  assignedUser: {
    firstName: string | null;
    lastName: string | null;
    displayName: string | null;
    email: string | null;
  } | null;
  conversations: Array<{
    id: string;
    messages: Array<{
      id: string;
      content: string;
      senderType: string;
      createdAt: Date;
    }>;
  }>;
  resourceReservations: Array<{
    id: string;
    startMinute: number;
    endMinute: number;
    expiresAt: Date | null;
    resource: { name: string; resourceType: { name: string } };
  }>;
};

export function LiveAgentWorkspace({
  inquiry,
  selectedPlan,
  workingPlan,
  resourceCheck,
  knowledge,
  activity,
  currentUserId,
  canManage,
  canHold,
  canRelease,
  timeZone,
}: {
  inquiry: WorkspaceInquiry;
  selectedPlan: {
    id: string;
    tier: string;
    title: string;
    estimatedTotalCents: number | null;
    currency: string;
    durationMinutes: number | null;
    customerFacingReason: string;
    availabilityValidated: boolean;
    availabilityNote: string | null;
    availabilityStatus?: string | null;
    payload: unknown;
  };
  workingPlan: typeof selectedPlan | null;
  resourceCheck: Parameters<typeof EmployeeSelectedPlanResourceCheck>[0]["live"] | null;
  knowledge: Array<{ id: string; name: string; type: string; maxGuests: number | null }>;
  activity: Array<{
    id: string;
    action: string;
    createdAt: Date;
    actor: { firstName: string | null; lastName: string | null; displayName: string | null; email: string | null } | null;
  }>;
  currentUserId: string;
  canManage: boolean;
  canHold: boolean;
  canRelease: boolean;
  timeZone: string;
}) {
  const displayName =
    inquiry.customerGroupName ||
    [inquiry.customerFirstName, inquiry.customerLastName].filter(Boolean).join(" ") ||
    inquiry.customerEmail;
  const phoneDisplay = formatPhoneDisplay(inquiry.customerPhone);
  const stage = deriveInquiryWorkflowStage({
    workflowStage: inquiry.workflowStage,
    selectedEventPlanId: inquiry.selectedEventPlanId,
    assignedUserProfileId: inquiry.assignedUserProfileId,
    readyToFinalizeAt: inquiry.readyToFinalizeAt,
    hasActiveHold: inquiry.resourceReservations.length > 0,
  });
  const assignedName = employeeDisplayName(inquiry.assignedUser);
  const assignedToOther = Boolean(
    inquiry.assignedUserProfileId && inquiry.assignedUserProfileId !== currentUserId,
  );
  const workingPayload = readEventPlanPayload((workingPlan ?? selectedPlan).payload);
  const holdAffected =
    inquiry.resourceReservations.length > 0 &&
    workingPlanAffectsExistingHolds(workingPayload, inquiry.resourceReservations);
  const eventDate = workingPayload.eventDate;
  const resourceTypeId = resourceCheck?.requirements.find((row) => row.resourceTypeId)?.resourceTypeId ?? null;
  const scheduleHref = eventDate
    ? `/app/schedule?date=${eventDate}${resourceTypeId ? `&type=${resourceTypeId}` : ""}${
        workingPayload.startTime ? `&start=${workingPayload.startTime}` : ""
      }`
    : "/app/schedule";
  const conversation = inquiry.conversations[0];
  const mailto = `mailto:${inquiry.customerEmail}`;

  return (
    <section className="w-full max-w-6xl">
      <Link href="/app/inquiries" className="text-sm text-primary">
        Back to inquiries
      </Link>
      <p className="mt-3 rounded-md border border-primary/40 bg-primary/5 px-3 py-2 text-sm font-semibold tracking-[0.12em] uppercase">
        {CUSTOMER_SELECTED_PLAN_BANNER}
      </p>
      <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">{displayName}</h1>
          <p className="mt-2 text-sm font-medium">
            {formatInquiryQueueLabel(inquiry)}
            {stage ? ` · ${INQUIRY_WORKFLOW_STAGE_LABELS[stage]}` : ""}
          </p>
        </div>
        {canManage && !inquiry.assignedUserProfileId ? (
          <SecurityActionForm
            action={startWorkingInquiryAction}
            notice={{ successTitle: "You are working this inquiry", errorTitle: "Unable to start working" }}
          >
            <input type="hidden" name="inquiryId" value={inquiry.id} />
            <PendingSubmitButton
              pendingLabel="Starting…"
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            >
              Start Working
            </PendingSubmitButton>
          </SecurityActionForm>
        ) : null}
      </div>
      {inquiry.assignedUserProfileId ? (
        <p className={`mt-3 text-sm ${assignedToOther ? "rounded-md border border-warning/40 bg-warning/10 px-3 py-2" : "text-foreground/70"}`}>
          {assignedToOther
            ? `Currently being worked by ${assignedName}`
            : `Assigned to ${assignedName}`}
          {inquiry.assignedAt ? ` · since ${formatOrganizationTimestamp(inquiry.assignedAt, timeZone)}` : ""}
        </p>
      ) : (
        <p className="mt-3 text-sm text-foreground/70">Unassigned — start working to claim this lead.</p>
      )}

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1.4fr)_minmax(18rem,0.8fr)]">
        <div>
          <EmployeeSelectedEventPlan
            plan={selectedPlan}
            desiredDate={inquiry.desiredDate}
            desiredStartTime={inquiry.desiredStartTime}
            selectedAt={inquiry.customerSelectedAt}
            timeZone={timeZone}
          />
          {workingPlan && canManage && !assignedToOther ? (
            <div className="mt-8">
              <AgentWorkingPlanForm
                inquiryId={inquiry.id}
                expectedUpdatedAt={inquiry.updatedAt.toISOString()}
                selectedPayload={selectedPlan.payload}
                working={workingPlan}
                knowledge={knowledge}
                currency={selectedPlan.currency}
                guestMix={inquiry.guestMix}
              />
            </div>
          ) : workingPlan ? (
            <section className="mt-8 rounded-md border border-border px-5 py-5">
              <h2 className="text-lg font-semibold">Current Agent Version</h2>
              <p className="mt-2 text-sm text-foreground/70">
                {workingPlan.title}
                {workingPlan.estimatedTotalCents
                  ? ` · estimated from sales knowledge`
                  : ""}
              </p>
              {assignedToOther ? (
                <p className="mt-2 text-sm text-foreground/60">
                  Editing is left to the assigned agent. You can still view availability and holds.
                </p>
              ) : (
                <p className="mt-2 text-sm text-foreground/70">
                  A working version exists. Only authorized staff can edit it.
                </p>
              )}
            </section>
          ) : (
            <p className="mt-8 text-sm text-foreground/70">
              Start working to create a persistent Current Agent Version copied from the customer selection.
            </p>
          )}
          {resourceCheck ? (
            <EmployeeSelectedPlanResourceCheck
              inquiryId={inquiry.id}
              availabilityStatus={workingPlan?.availabilityStatus ?? selectedPlan.availabilityStatus ?? "NOT_VALIDATED"}
              live={resourceCheck}
              holds={inquiry.resourceReservations}
              canHold={canHold && canManage}
              canRelease={canRelease && canManage}
              timeZone={timeZone}
              title="Working version — resource check"
              scheduleHref={scheduleHref}
              holdAffected={holdAffected}
            />
          ) : null}
        </div>

        <aside className="space-y-6">
          <section className="rounded-md border border-border px-4 py-4 text-sm">
            <h2 className="font-semibold">Customer summary</h2>
            <dl className="mt-3 space-y-2">
              <div>
                <dt className="text-foreground/60">Group</dt>
                <dd>{inquiry.customerGroupName || displayName}</dd>
              </div>
              <div>
                <dt className="text-foreground/60">Contact</dt>
                <dd>{[inquiry.customerFirstName, inquiry.customerLastName].filter(Boolean).join(" ") || "—"}</dd>
              </div>
              <div>
                <dt className="text-foreground/60">Email</dt>
                <dd className="flex flex-wrap items-center gap-2">
                  <a href={mailto} className="text-primary">
                    {inquiry.customerEmail}
                  </a>
                  <CopyValueButton value={inquiry.customerEmail} label="Email" />
                </dd>
              </div>
              <div>
                <dt className="text-foreground/60">Phone</dt>
                <dd className="flex flex-wrap items-center gap-2">
                  {phoneDisplay ? (
                    <>
                      <a href={`tel:${inquiry.customerPhone}`} className="text-primary">
                        {phoneDisplay}
                      </a>
                      <CopyValueButton value={inquiry.customerPhone ?? ""} label="Phone" />
                    </>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-foreground/60">Date / time</dt>
                <dd>
                  {formatEventLocalDateTime({ date: inquiry.desiredDate, time: inquiry.desiredStartTime })}
                </dd>
              </div>
              <div>
                <dt className="text-foreground/60">Guests</dt>
                <dd>
                  {inquiry.guestCount ?? "—"} · {formatGuestMix(inquiry.guestMix)}
                </dd>
              </div>
              <div>
                <dt className="text-foreground/60">Event</dt>
                <dd>
                  {inquiry.eventType || "—"} · {formatEventDuration(inquiry.desiredDurationMinutes)}
                </dd>
              </div>
              <div>
                <dt className="text-foreground/60">Budget</dt>
                <dd>{formatBudgetRange(inquiry.budgetMin, inquiry.budgetMax)}</dd>
              </div>
              <div>
                <dt className="text-foreground/60">Goal</dt>
                <dd>{inquiry.eventGoal || "—"}</dd>
              </div>
              <div>
                <dt className="text-foreground/60">Occasion</dt>
                <dd>{inquiry.occasion || "—"}</dd>
              </div>
              <div>
                <dt className="text-foreground/60">Dining / space</dt>
                <dd>
                  {formatDiningPreference(inquiry.diningPreference)} · {formatSpacePreference(inquiry.spacePreference)}
                </dd>
              </div>
              <div>
                <dt className="text-foreground/60">Attractions</dt>
                <dd>{inquiry.attractionInterestNames.join(", ") || "—"}</dd>
              </div>
            </dl>
            {inquiry.customerNotes ? (
              <p className="mt-3 whitespace-pre-wrap text-foreground/80">{inquiry.customerNotes}</p>
            ) : null}
            {canManage ? (
              <SecurityActionForm
                action={markCustomerContactedAction}
                className="mt-4"
                notice={{ successTitle: "Customer contacted", errorTitle: "Unable to record contact" }}
              >
                <input type="hidden" name="inquiryId" value={inquiry.id} />
                <PendingSubmitButton pendingLabel="Saving…" className="rounded-md border border-border px-3 py-1.5 text-sm">
                  {inquiry.customerContactedAt ? "Contacted again" : "Mark customer contacted"}
                </PendingSubmitButton>
              </SecurityActionForm>
            ) : null}
          </section>

          <section className="rounded-md border border-border px-4 py-4 text-sm">
            <h2 className="font-semibold">Internal notes</h2>
            <p className="mt-1 text-xs text-foreground/60">Staff only. Not shown on the customer plan page.</p>
            {canManage ? (
              <SecurityActionForm
                action={saveInternalNotesAction}
                className="mt-3 space-y-2"
                notice={{ successTitle: "Internal notes saved", errorTitle: "Unable to save notes" }}
              >
                <input type="hidden" name="inquiryId" value={inquiry.id} />
                <textarea
                  name="notes"
                  rows={5}
                  maxLength={4000}
                  defaultValue={inquiry.employeeInternalNotes ?? ""}
                  className="w-full rounded-md border border-border bg-background px-3 py-2"
                />
                <PendingSubmitButton pendingLabel="Saving…" className="rounded-md border border-border px-3 py-1.5">
                  Save notes
                </PendingSubmitButton>
              </SecurityActionForm>
            ) : (
              <p className="mt-2 whitespace-pre-wrap">{inquiry.employeeInternalNotes || "No internal notes."}</p>
            )}
          </section>

          {canManage && inquiry.resourceReservations.length > 0 ? (
            <SecurityActionForm
              action={markReadyToFinalizeAction}
              notice={{ successTitle: "Ready to finalize", errorTitle: "Unable to mark ready to finalize" }}
              confirm={{
                title: "Mark ready to finalize?",
                description: "This does not create a booking, collect payment, or send customer confirmation.",
                confirmLabel: "Ready to finalize",
              }}
            >
              <input type="hidden" name="inquiryId" value={inquiry.id} />
              <input type="hidden" name="expectedUpdatedAt" value={inquiry.updatedAt.toISOString()} />
              <PendingSubmitButton
                pendingLabel="Saving…"
                className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
              >
                {stage === INQUIRY_WORKFLOW_STAGES.READY_TO_FINALIZE ? "Already ready to finalize" : "Mark Ready to Finalize"}
              </PendingSubmitButton>
            </SecurityActionForm>
          ) : null}

          <section className="rounded-md border border-border px-4 py-4 text-sm">
            <h2 className="font-semibold">Activity</h2>
            <InquiryFunnel
              timeZone={timeZone}
              inquiry={{
                ...inquiry,
                selectedPlanTitle: selectedPlan.title,
                selectedPlanTier: selectedPlan.tier,
              }}
            />
            <ol className="mt-4 space-y-2">
              {activity.map((row) => (
                <li key={row.id}>
                  <p>{formatInquiryActivityAction(row.action)}</p>
                  <p className="text-xs text-foreground/55">
                    {formatOrganizationTimestamp(row.createdAt, timeZone)}
                    {row.actor ? ` · ${employeeDisplayName(row.actor)}` : ""}
                  </p>
                </li>
              ))}
            </ol>
          </section>
        </aside>
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
