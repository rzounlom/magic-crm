import Link from "next/link";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";

import { formatMoneyFromCents } from "@/lib/event-planner/money";
import { READY_FOR_HUMAN_REASONS } from "@/lib/inquiries/ready-for-human-reason";
import { formatEmployeeInquiryQueueLabel } from "@/lib/inquiries/inquiry-workflow-labels";
import {
  isLiveAgentSelectedAttention,
  isOtherReadyForHumanAttention,
  isPendingConfirmation,
  sortLiveAgentQueue,
} from "@/lib/inquiries/live-agent-queue";
import { INQUIRY_WORKFLOW_STAGE_LABELS, EVENT_PLAN_KINDS } from "@/types/inquiry";
import { PLAN_AVAILABILITY_STATUS_LABELS, PLAN_AVAILABILITY_STATUSES } from "@/types/resource-schedule";
import { formatEventLocalDateTime, formatOrganizationTimestamp } from "@/lib/inquiries/tenant-datetime";
import {
  deriveInquiryWorkflowStage,
  employeeDisplayName,
  formatHoldTimeRemaining,
  holdExpiresSoon,
} from "@/lib/inquiries/workflow-stage";
import { cn } from "@/lib/ui/cn";

type InquiryListItem = {
  id: string;
  status: string;
  salesStage?: string | null;
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
  desiredStartTime?: string | null;
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
  bookings?: Array<{ id: string; bookingNumber: string; status: string }>;
};

export function LiveAgentInquiryQueue({
  inquiries,
  timeZone,
}: {
  inquiries: InquiryListItem[];
  timeZone: string;
}) {
  const pendingPayment = sortLiveAgentQueue(
    inquiries.filter(isPendingConfirmation).map((inquiry) => toQueueItem(inquiry)),
  );
  const selected = sortLiveAgentQueue(
    inquiries.filter(isLiveAgentSelectedAttention).map((inquiry) => toQueueItem(inquiry)),
  );
  const otherReady = inquiries
    .filter(isOtherReadyForHumanAttention)
    .sort((left, right) => {
      const createdDelta = right.createdAt.getTime() - left.createdAt.getTime();
      if (createdDelta !== 0) {
        return createdDelta;
      }
      return right.id.localeCompare(left.id);
    });
  const rest = inquiries
    .filter(
      (inquiry) =>
        !isPendingConfirmation(inquiry) &&
        !isLiveAgentSelectedAttention(inquiry) &&
        !isOtherReadyForHumanAttention(inquiry),
    )
    .sort((left, right) => {
      const createdDelta = right.createdAt.getTime() - left.createdAt.getTime();
      if (createdDelta !== 0) {
        return createdDelta;
      }
      return right.id.localeCompare(left.id);
    });

  return (
    <div id="inquiry-queue-top" className="inquiry-queue mt-8 space-y-8 scroll-mt-24">
      {pendingPayment.length > 0 ? (
        <QueueSection
          id="pending-confirmation"
          title="Pending confirmation"
          description="Book Now requests waiting for staff confirmation. They do not occupy the Master Schedule yet."
          count={pendingPayment.length}
        >
          {pendingPayment.map((inquiry) => (
            <InquiryRow key={inquiry.id} inquiry={inquiry} timeZone={timeZone} priority />
          ))}
        </QueueSection>
      ) : null}
      {selected.length > 0 || otherReady.length > 0 ? (
        <QueueSection
          id="ready-for-live-agent"
          title="Ready for Live Agent"
          description="Customer-selected plans appear first. WordPress event requests need staff follow-up without a customer package selection."
          count={selected.length + otherReady.length}
        >
          {selected.map((inquiry) => (
            <InquiryRow key={inquiry.id} inquiry={inquiry} timeZone={timeZone} priority />
          ))}
          {otherReady.map((inquiry) => (
            <InquiryRow key={inquiry.id} inquiry={inquiry} timeZone={timeZone} />
          ))}
        </QueueSection>
      ) : null}
      {rest.length > 0 ? (
        <QueueSection
          id="other-inquiries"
          title="Other inquiries"
          description="Active inquiries that are not waiting on confirmation or staff review."
          count={rest.length}
        >
          {rest.map((inquiry) => (
            <InquiryRow key={inquiry.id} inquiry={inquiry} timeZone={timeZone} />
          ))}
        </QueueSection>
      ) : null}
    </div>
  );
}

function QueueSection({
  id,
  title,
  description,
  count,
  children,
}: {
  id: string;
  title: string;
  description: string;
  count: number;
  children: ReactNode;
}) {
  return (
    <section id={id} className="inquiry-queue-section scroll-mt-24" aria-labelledby={`${id}-heading`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id={`${id}-heading`} className="text-[length:var(--text-title-sm)] font-semibold text-foreground">
          {title}
        </h2>
        <p className="text-[length:var(--text-caption)] font-medium text-muted-foreground">
          {count} {count === 1 ? "inquiry" : "inquiries"}
        </p>
      </div>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>
      <ul className="inquiry-queue-list mt-4 flex flex-col gap-2.5">
        {children}
      </ul>
    </section>
  );
}

function toQueueItem(inquiry: InquiryListItem) {
  const selected = inquiry.eventPlanRecommendations.find((plan) => plan.id === inquiry.selectedEventPlanId);
  const earliestHoldExpiresAt =
    inquiry.resourceReservations
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

  const assignedLabel = inquiry.assignedUser
    ? `Assigned to ${employeeDisplayName(inquiry.assignedUser)}`
    : "Unassigned";
  const isWpIntake = inquiry.humanHandoffReason === READY_FOR_HUMAN_REASONS.PUBLIC_EVENT_REQUEST;
  const statusLabel = formatEmployeeInquiryQueueLabel({
    isWpIntake,
    status: inquiry.status,
    aiHandlingEnabled: inquiry.aiHandlingEnabled,
    selectedEventPlanId: inquiry.selectedEventPlanId,
    humanHandoffReason: inquiry.humanHandoffReason,
    bookingNumber: inquiry.bookings?.[0]?.bookingNumber,
    bookingStatus: inquiry.bookings?.[0]?.status,
    salesStage: "salesStage" in inquiry ? String(inquiry.salesStage ?? "") : null,
  });
  const nextHint = priority
    ? "Continue booking"
    : holdCount > 0
      ? "Review hold"
      : "Open inquiry";
  const displayName =
    inquiry.customerGroupName ||
    [inquiry.customerFirstName, inquiry.customerLastName].filter(Boolean).join(" ") ||
    inquiry.customerEmail;

  const metaBits = [
    stage ? INQUIRY_WORKFLOW_STAGE_LABELS[stage] : null,
    holdCount > 0 ? "Active hold" : null,
    soonest && holdExpiresSoon(soonest) ? `Expires ${formatHoldTimeRemaining(soonest)}` : null,
    selected
      ? `Selected: ${selected.title}${
          selected.estimatedTotalCents
            ? ` · ${formatMoneyFromCents(selected.estimatedTotalCents, selected.currency)}`
            : ""
        } · ${availabilityLabel}`
      : null,
  ].filter(Boolean);

  return (
    <li className="inquiry-queue-card overflow-hidden rounded-[var(--radius-card)] border border-border-subtle bg-surface">
      <Link
        href={`/app/inquiries/${inquiry.id}`}
        className={cn(
          "inquiry-queue-row block px-4 py-3.5 transition-colors hover:bg-muted/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--focus-ring)]",
          priority && "inquiry-queue-row-priority",
        )}
      >
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-foreground">{displayName}</p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {inquiry.eventType || "Event"}
              {inquiry.desiredDate || inquiry.desiredStartTime
                ? ` · ${formatEventLocalDateTime({ date: inquiry.desiredDate, time: inquiry.desiredStartTime })}`
                : ""}
              {inquiry.guestCount ? ` · ${inquiry.guestCount} guests` : ""}
            </p>
            {metaBits.length > 0 ? (
              <p className="mt-1.5 line-clamp-2 text-[length:var(--text-caption)] text-muted-foreground">
                {metaBits.join(" · ")}
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2 sm:flex-col sm:items-end">
            <Badge tone={priority ? "info" : "neutral"}>{statusLabel}</Badge>
            <Badge tone={inquiry.assignedUser ? "neutral" : "warning"}>{assignedLabel}</Badge>
            <p className="text-[length:var(--text-caption)] font-semibold text-primary">{nextHint}</p>
            <p className="text-[length:var(--text-caption)] text-muted-foreground">
              {inquiry.customerSelectedAt
                ? `Selected ${formatOrganizationTimestamp(inquiry.customerSelectedAt, timeZone)}`
                : formatOrganizationTimestamp(inquiry.createdAt, timeZone)}
            </p>
          </div>
        </div>
      </Link>
    </li>
  );
}
