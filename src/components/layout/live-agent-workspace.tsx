import Link from "next/link";

import { AgentWorkingPlanForm } from "@/components/layout/agent-working-plan-form";
import { CopyValueButton } from "@/components/layout/copy-value-button";
import { EmployeeInquiryConversation } from "@/components/layout/employee-inquiry-conversation";
import { EmployeeSelectedEventPlan } from "@/components/layout/employee-selected-event-plan";
import { EmployeeSelectedPlanResourceCheck } from "@/components/layout/employee-selected-plan-resource-check";
import { InquiryFunnel } from "@/components/layout/inquiry-funnel";
import { LiveAgentBookingActions } from "@/components/layout/live-agent-booking-actions";
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
import { formatEventLocalDateTime, formatOrganizationTimestamp } from "@/lib/inquiries/tenant-datetime";
import { readEventPlanPayload } from "@/lib/event-planner/payload";
import { markCustomerContactedAction, saveInternalNotesAction } from "@/server/actions/live-agent";
import { bookingConfirmationBlockers } from "@/lib/bookings/confirmation-blockers";
import { holdCoverageErrors } from "@/lib/bookings/hold-coverage";
import { sendEmployeeInquiryMessageAction } from "@/server/actions/inquiries";
import { liveAgentHoldReadiness } from "@/lib/inquiries/live-agent-next-step";
import { employeeDisplayName } from "@/lib/inquiries/workflow-stage";
import { INQUIRY_STATUSES } from "@/types/inquiry";

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
    status?: string;
    releasedAt?: Date | null;
    startMinute: number;
    endMinute: number;
    expiresAt: Date | null;
    resource: { name: string; resourceType: { id?: string; name: string } };
  }>;
  bookings?: Array<{ id: string; bookingNumber: string; status: string; confirmedAt: Date }>;
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
  canConfirm = false,
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
  canConfirm?: boolean;
  timeZone: string;
}) {
  const displayName =
    inquiry.customerGroupName ||
    [inquiry.customerFirstName, inquiry.customerLastName].filter(Boolean).join(" ") ||
    inquiry.customerEmail;
  const phoneDisplay = formatPhoneDisplay(inquiry.customerPhone);
  const booking = inquiry.bookings?.[0] ?? null;
  const booked = inquiry.status === INQUIRY_STATUSES.BOOKED || Boolean(booking);
  const assignedName = employeeDisplayName(inquiry.assignedUser);
  const assignedToOther = Boolean(
    inquiry.assignedUserProfileId && inquiry.assignedUserProfileId !== currentUserId,
  );
  const workingPayload = readEventPlanPayload((workingPlan ?? selectedPlan).payload);
  const holdAffected =
    !booked &&
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
  const confirmBlockers = booked
    ? []
    : [
        ...bookingConfirmationBlockers({
          inquiryStatus: inquiry.status,
          workflowStage: inquiry.workflowStage,
          readyToFinalizeAt: inquiry.readyToFinalizeAt,
          selectedEventPlanId: inquiry.selectedEventPlanId,
          assignedUserProfileId: inquiry.assignedUserProfileId,
          workingPlan: workingPlan
            ? {
                availabilityStatus: workingPlan.availabilityStatus ?? null,
                estimatedTotalCents: workingPlan.estimatedTotalCents,
                payload: workingPayload,
              }
            : null,
          holds: inquiry.resourceReservations.map((row) => ({
            status: row.status ?? "HOLD",
            expiresAt: row.expiresAt,
            releasedAt: row.releasedAt ?? null,
            startMinute: row.startMinute,
            endMinute: row.endMinute,
            resource: {
              resourceType: {
                id: row.resource.resourceType.id ?? "",
                name: row.resource.resourceType.name,
              },
            },
          })),
          hasFiniteRequirements: Boolean(
            resourceCheck?.requirements.some((row) => row.quantity != null && row.quantity > 0),
          ),
        }),
        ...(workingPlan && resourceCheck
          ? holdCoverageErrors(workingPayload, resourceCheck.requirements, inquiry.resourceReservations.map((row) => ({
              id: row.id,
              status: row.status ?? "HOLD",
              expiresAt: row.expiresAt,
              releasedAt: row.releasedAt ?? null,
              startMinute: row.startMinute,
              endMinute: row.endMinute,
              resource: {
                resourceType: {
                  id: row.resource.resourceType.id ?? "",
                  name: row.resource.resourceType.name,
                },
              },
            })))
          : []),
      ];
  const holdReadiness = liveAgentHoldReadiness({
    requirements: resourceCheck?.requirements ?? [],
    validated: resourceCheck?.result.validated ?? false,
    available: resourceCheck?.result.available ?? false,
  });

  return (
    <section className="w-full">
      <Link href="/app/inquiries" className="text-sm text-primary">
        Back to inquiries
      </Link>
      <div className="mt-4">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">{displayName}</h1>
        <p className={`mt-2 text-sm ${assignedToOther ? "rounded-md border border-warning/40 bg-warning/10 px-3 py-2" : "text-foreground/70"}`}>
          {inquiry.assignedUserProfileId
            ? `${assignedToOther ? "Being worked by" : "Assigned to"} ${assignedName}${
                inquiry.assignedAt ? ` · ${formatOrganizationTimestamp(inquiry.assignedAt, timeZone)}` : ""
              }`
            : "Unassigned"}
        </p>
      </div>

      <LiveAgentBookingActions
        inquiryId={inquiry.id}
        expectedUpdatedAt={inquiry.updatedAt.toISOString()}
        booked={booked}
        bookingHref={booking ? `/app/bookings/${booking.id}` : null}
        bookingNumber={booking?.bookingNumber ?? null}
        canManage={canManage}
        canHold={canHold}
        canConfirm={canConfirm}
        assigned={Boolean(inquiry.assignedUserProfileId)}
        needsHold={holdReadiness.needsHold}
        hasHold={inquiry.resourceReservations.length > 0}
        canPlaceHold={holdReadiness.canPlaceHold}
        needsInventory={holdReadiness.needsInventory}
        readyToFinalize={Boolean(inquiry.readyToFinalizeAt)}
        confirmBlockers={confirmBlockers}
      />

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(16rem,0.7fr)]">
        <div className="space-y-6">
          {workingPlan && canManage && !assignedToOther && !booked ? (
            <AgentWorkingPlanForm
              inquiryId={inquiry.id}
              expectedUpdatedAt={inquiry.updatedAt.toISOString()}
              selectedPayload={selectedPlan.payload}
              working={workingPlan}
              knowledge={knowledge}
              currency={selectedPlan.currency}
              guestMix={inquiry.guestMix}
            />
          ) : workingPlan ? (
            <section className="rounded-md border border-border px-5 py-5">
              <h2 className="text-lg font-semibold">Plan you&apos;ll book</h2>
              <p className="mt-2 text-sm text-foreground/70">
                {workingPlan.title}
                {assignedToOther ? " · the assigned agent is editing this plan." : " · view only."}
              </p>
            </section>
          ) : (
            <p className="text-sm text-foreground/70">Start working to copy the customer plan into an editable booking version.</p>
          )}
          {resourceCheck ? (
            <EmployeeSelectedPlanResourceCheck
              inquiryId={inquiry.id}
              availabilityStatus={workingPlan?.availabilityStatus ?? selectedPlan.availabilityStatus ?? "NOT_VALIDATED"}
              live={resourceCheck}
              holds={inquiry.resourceReservations}
              canHold={canHold && canManage && !booked}
              canRelease={canRelease && canManage && !booked}
              timeZone={timeZone}
              title="Rooms and lanes"
              scheduleHref={scheduleHref}
              holdAffected={holdAffected}
            />
          ) : null}
          <EmployeeSelectedEventPlan
            plan={selectedPlan}
            desiredDate={inquiry.desiredDate}
            desiredStartTime={inquiry.desiredStartTime}
            selectedAt={inquiry.customerSelectedAt}
            timeZone={timeZone}
          />
        </div>

        <aside className="space-y-4">
          <section className="rounded-md border border-border px-4 py-4 text-sm">
            <h2 className="font-semibold">Customer</h2>
            <p className="mt-2">{[inquiry.customerFirstName, inquiry.customerLastName].filter(Boolean).join(" ") || displayName}</p>
            <p className="mt-2 flex flex-wrap items-center gap-2">
              <a href={mailto} className="text-primary">
                {inquiry.customerEmail}
              </a>
              <CopyValueButton value={inquiry.customerEmail} label="Email" />
            </p>
            <p className="mt-2 flex flex-wrap items-center gap-2">
              {phoneDisplay ? (
                <>
                  <a href={`tel:${inquiry.customerPhone}`} className="text-primary">
                    {phoneDisplay}
                  </a>
                  <CopyValueButton value={inquiry.customerPhone ?? ""} label="Phone" />
                </>
              ) : (
                "No phone"
              )}
            </p>
            <p className="mt-3 text-foreground/70">
              {formatEventLocalDateTime({ date: inquiry.desiredDate, time: inquiry.desiredStartTime })}
              {inquiry.guestCount != null ? ` · ${inquiry.guestCount} guests` : ""}
            </p>
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
            <details className="mt-4">
              <summary className="cursor-pointer text-sm text-foreground/70">More customer details</summary>
              <dl className="mt-3 space-y-2">
                <div>
                  <dt className="text-foreground/60">Event</dt>
                  <dd>
                    {inquiry.eventType || "—"} · {formatEventDuration(inquiry.desiredDurationMinutes)} ·{" "}
                    {formatGuestMix(inquiry.guestMix)}
                  </dd>
                </div>
                <div>
                  <dt className="text-foreground/60">Budget</dt>
                  <dd>{formatBudgetRange(inquiry.budgetMin, inquiry.budgetMax)}</dd>
                </div>
                <div>
                  <dt className="text-foreground/60">Goal / occasion</dt>
                  <dd>{[inquiry.eventGoal, inquiry.occasion].filter(Boolean).join(" · ") || "—"}</dd>
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
            </details>
          </section>

          <details className="rounded-md border border-border px-4 py-4 text-sm">
            <summary className="cursor-pointer font-semibold">Staff notes</summary>
            <p className="mt-1 text-xs text-foreground/60">Not shown on the customer plan page.</p>
            {canManage ? (
              <SecurityActionForm
                action={saveInternalNotesAction}
                className="mt-3 space-y-2"
                notice={{ successTitle: "Internal notes saved", errorTitle: "Unable to save notes" }}
              >
                <input type="hidden" name="inquiryId" value={inquiry.id} />
                <textarea
                  name="notes"
                  rows={4}
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
          </details>
        </aside>
      </div>

      <details className="mt-8 rounded-md border border-border px-4 py-4 text-sm">
        <summary className="cursor-pointer font-semibold">History and notes</summary>
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
        <h3 className="mt-6 font-medium">Inquiry notes</h3>
        <EmployeeInquiryConversation messages={conversation?.messages ?? []} />
        {canManage && conversation ? (
          <SecurityActionForm
            action={sendEmployeeInquiryMessageAction}
            className="mt-4 space-y-3"
            notice={{ successTitle: "Reply sent", errorTitle: "Unable to send reply" }}
          >
            <input type="hidden" name="inquiryId" value={inquiry.id} />
            <input type="hidden" name="conversationId" value={conversation.id} />
            <label className="block text-sm">
              <span className="text-foreground/70">Follow-up note</span>
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
      </details>
    </section>
  );
}
