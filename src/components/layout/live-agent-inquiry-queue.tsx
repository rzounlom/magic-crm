import Link from "next/link";

import { formatMoneyFromCents } from "@/lib/event-planner/money";
import { CUSTOMER_SELECTED_PLAN_BANNER } from "@/lib/inquiries/ready-for-human-reason";
import { formatInquiryQueueLabel } from "@/lib/inquiries/inquiry-status-display";
import { isCustomerSelectedPlanReason } from "@/lib/inquiries/ready-for-human-reason";
import { sortLiveAgentQueue } from "@/lib/inquiries/live-agent-queue";
import { INQUIRY_STATUSES, INQUIRY_WORKFLOW_STAGE_LABELS, EVENT_PLAN_KINDS } from "@/types/inquiry";
import { PLAN_AVAILABILITY_STATUS_LABELS, PLAN_AVAILABILITY_STATUSES } from "@/types/resource-schedule";
import { formatEventLocalDate, formatOrganizationTimestamp } from "@/lib/inquiries/tenant-datetime";
import {
  deriveInquiryWorkflowStage,
  employeeDisplayName,
  formatHoldTimeRemaining,
  holdExpiresSoon,
} from "@/lib/inquiries/workflow-stage";

type InquiryListItem = {
  id: string;
  status: string;
  selectedEventPlanId: string | null;
  humanHandoffReason: string | null;
  assignedUserProfileId: string | null;
  customerSelectedAt: Date | null;
  createdAt: Date;
  humanHandoffRequestedAt: Date | null;
  aiHandlingEnabled: boolean;
  workflowStage: string | null;
  customerGroupName: string | null;
  customerFirstName: string | null;
  customerLastName: string | null;
  customerEmail: string;
  eventType: string | null;
  desiredDate: Date | null;
  guestCount: number | null;
  assignedUser: {
    firstName: string | null;
    lastName: string | null;
    displayName: string | null;
    email: string | null;
  } | null;
  eventPlanRecommendations: Array<{
    id: string;
    kind: string;
    title: string;
    estimatedTotalCents: number | null;
    currency: string;
    availabilityStatus: string;
  }>;
  resourceReservations: Array<{ id: string; expiresAt: Date | null }>;
};

export function LiveAgentInquiryQueue({
  inquiries,
  timeZone,
}: {
  inquiries: InquiryListItem[];
  timeZone: string;
}) {
  const selected = sortLiveAgentQueue(
    inquiries
      .filter((inquiry) => isCustomerSelectedPlanReason(inquiry.humanHandoffReason, inquiry.selectedEventPlanId))
      .map((inquiry) => toQueueItem(inquiry)),
  );
  const otherReady = inquiries
    .filter(
      (inquiry) =>
        inquiry.status === INQUIRY_STATUSES.READY_FOR_HUMAN &&
        !isCustomerSelectedPlanReason(inquiry.humanHandoffReason, inquiry.selectedEventPlanId),
    )
    .sort((left, right) => {
      const leftWait = left.humanHandoffRequestedAt ?? left.createdAt;
      const rightWait = right.humanHandoffRequestedAt ?? right.createdAt;
      return leftWait.getTime() - rightWait.getTime();
    });
  const rest = inquiries.filter(
    (inquiry) =>
      !isCustomerSelectedPlanReason(inquiry.humanHandoffReason, inquiry.selectedEventPlanId) &&
      inquiry.status !== INQUIRY_STATUSES.READY_FOR_HUMAN,
  );

  return (
    <div className="mt-8 space-y-10">
      {selected.length > 0 || otherReady.length > 0 ? (
        <section>
          <h2 className="text-lg font-semibold">Ready for Live Agent</h2>
          <p className="mt-1 text-sm text-foreground/70">
            Customer-selected plans are listed first. Unassigned leads, availability issues, and expiring holds
            stay at the top of that group.
          </p>
          {selected.length > 0 ? (
            <ul className="mt-4 space-y-3">
              {selected.map((inquiry) => (
                <InquiryRow key={inquiry.id} inquiry={inquiry} timeZone={timeZone} priority />
              ))}
            </ul>
          ) : null}
          {otherReady.length > 0 ? (
            <ul className={selected.length > 0 ? "mt-6 space-y-3" : "mt-4 space-y-3"}>
              {otherReady.map((inquiry) => (
                <InquiryRow key={inquiry.id} inquiry={inquiry} timeZone={timeZone} />
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}
      {rest.length > 0 ? (
        <section>
          {selected.length > 0 || otherReady.length > 0 ? <h2 className="text-lg font-semibold">Other inquiries</h2> : null}
          <ul className={selected.length > 0 || otherReady.length > 0 ? "mt-4 space-y-3" : "space-y-3"}>
            {rest.map((inquiry) => (
              <InquiryRow key={inquiry.id} inquiry={inquiry} timeZone={timeZone} />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function toQueueItem(inquiry: InquiryListItem) {
  const selected = inquiry.eventPlanRecommendations.find((plan) => plan.id === inquiry.selectedEventPlanId);
  const earliestHoldExpiresAt = inquiry.resourceReservations
    .map((row) => row.expiresAt)
    .filter((value): value is Date => Boolean(value))
    .sort((left, right) => left.getTime() - right.getTime())[0] ?? null;
  return {
    ...inquiry,
    selectedAvailabilityStatus: selected?.availabilityStatus ?? null,
    earliestHoldExpiresAt,
  };
}

function InquiryRow({
  inquiry,
  timeZone,
  priority = false,
}: {
  inquiry: InquiryListItem;
  timeZone: string;
  priority?: boolean;
}) {
  const selected = inquiry.eventPlanRecommendations.find((plan) => plan.id === inquiry.selectedEventPlanId);
  const working = inquiry.eventPlanRecommendations.find((plan) => plan.kind === EVENT_PLAN_KINDS.AGENT_WORKING);
  const availability = working?.availabilityStatus ?? selected?.availabilityStatus;
  const holdCount = inquiry.resourceReservations.length;
  const soonest = inquiry.resourceReservations
    .map((row) => row.expiresAt)
    .filter((value): value is Date => Boolean(value))
    .sort((left, right) => left.getTime() - right.getTime())[0];
  const stage = deriveInquiryWorkflowStage({
    workflowStage: inquiry.workflowStage,
    selectedEventPlanId: inquiry.selectedEventPlanId,
    assignedUserProfileId: inquiry.assignedUserProfileId,
    hasActiveHold: holdCount > 0,
  });
  const availabilityLabel =
    availability && availability in PLAN_AVAILABILITY_STATUS_LABELS
      ? PLAN_AVAILABILITY_STATUS_LABELS[availability as keyof typeof PLAN_AVAILABILITY_STATUS_LABELS]
      : PLAN_AVAILABILITY_STATUS_LABELS[PLAN_AVAILABILITY_STATUSES.NOT_VALIDATED];

  return (
    <li>
      <Link
        href={`/app/inquiries/${inquiry.id}`}
        className={`block rounded-md border px-4 py-4 hover:bg-muted/60 ${
          priority ? "border-primary/40 bg-primary/5" : "border-border"
        }`}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-medium text-foreground">
              {inquiry.customerGroupName ||
                [inquiry.customerFirstName, inquiry.customerLastName].filter(Boolean).join(" ") ||
                inquiry.customerEmail}
            </p>
            <p className="mt-1 text-sm text-foreground/70">
              {inquiry.eventType || "Event"}
              {inquiry.desiredDate ? ` · ${formatEventLocalDate(inquiry.desiredDate)}` : ""}
              {inquiry.guestCount ? ` · ${inquiry.guestCount} guests` : ""}
            </p>
          </div>
          <span className="text-xs font-medium tracking-wide text-foreground/60">
            {formatInquiryQueueLabel(inquiry)}
          </span>
        </div>
        {priority ? (
          <p className="mt-3 text-xs font-semibold tracking-[0.14em] text-primary uppercase">
            {CUSTOMER_SELECTED_PLAN_BANNER}
          </p>
        ) : null}
        {selected ? (
          <p className="mt-3 text-sm text-foreground/80">
            Selected: {selected.title}
            {selected.estimatedTotalCents
              ? ` · ${formatMoneyFromCents(selected.estimatedTotalCents, selected.currency)}`
              : ""}
            {` · ${availabilityLabel}`}
          </p>
        ) : null}
        <p className="mt-2 text-xs text-foreground/55">
          {stage ? INQUIRY_WORKFLOW_STAGE_LABELS[stage] : null}
          {inquiry.assignedUser ? ` · Assigned to ${employeeDisplayName(inquiry.assignedUser)}` : " · Unassigned"}
          {holdCount > 0 ? " · Hold placed" : ""}
          {soonest && holdExpiresSoon(soonest) ? ` · Hold expires ${formatHoldTimeRemaining(soonest)}` : ""}
        </p>
        {inquiry.customerSelectedAt ? (
          <p className="mt-2 text-xs text-foreground/50">
            Selected {formatOrganizationTimestamp(inquiry.customerSelectedAt, timeZone)}
          </p>
        ) : (
          <p className="mt-2 text-xs text-foreground/50">{formatOrganizationTimestamp(inquiry.createdAt, timeZone)}</p>
        )}
      </Link>
    </li>
  );
}
