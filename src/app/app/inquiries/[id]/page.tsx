import Link from "next/link";
import { notFound } from "next/navigation";

import { ConfirmationReadinessPanel } from "@/components/layout/confirmation-readiness-panel";
import { HoldReadinessPanel } from "@/components/layout/hold-readiness-panel";
import { LiveAgentWorkspace } from "@/components/layout/live-agent-workspace";
import { AcknowledgeInquiryView } from "@/components/layout/acknowledge-inquiry-view";
import { EmployeeInquiryConversation } from "@/components/layout/employee-inquiry-conversation";
import { EmployeeInquiryTabs } from "@/components/layout/employee-inquiry-tabs";
import { InquiryArchiveActions } from "@/components/layout/inquiry-archive-actions";
import { InquiryFunnel } from "@/components/layout/inquiry-funnel";
import { SecurityActionForm } from "@/components/layout/security-action-form";
import { SecurityStatusPanel } from "@/components/layout/security-status-panel";
import {
  findWpIntakeMetadata,
  WpIntakeAnswersPanel,
} from "@/components/layout/wp-intake-answers-panel";
import { WpStaffQuoteDraftPanel } from "@/components/layout/wp-staff-quote-draft-panel";
import {
  WP_ATTRACTION_ANSWER_LABELS,
  WP_ATTRACTION_KEYS,
  WP_ATTRACTION_LABELS,
} from "@/lib/event-planner/wp-intake-contract";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import { db } from "@/lib/db";
import {
  formatBeveragePreference,
  formatDiningPreference,
  formatDesiredDuration,
  formatGuestMix,
  formatIntakeBudget,
  formatSpacePreference,
} from "@/lib/event-planner/labels";
import { formatMoneyFromCents } from "@/lib/event-planner/money";
import {
  employeeInquiryStatusBanner,
  employeeReadyForHumanCopy,
  formatEmployeeInquiryQueueLabel,
} from "@/lib/inquiries/inquiry-workflow-labels";
import { formatPhoneDisplay } from "@/lib/inquiries/public-phone";
import { formatEventLocalDateTime } from "@/lib/inquiries/tenant-datetime";
import {
  sendEmployeeInquiryMessageAction,
  takeOverInquiryAction,
} from "@/server/actions/inquiries";
import {
  readWpQuoteDraftProvenance,
  resolveWpCustomerQuoteDeliveryPolicy,
} from "@/server/event-planner/wp-parity";
import { EVENT_PLAN_KINDS } from "@/types/inquiry";
import { listInquiryActivity, listWorkspaceKnowledge } from "@/server/services/live-agent-service";
import { isAuthorizationError, isInquiryError, isTenantContextError } from "@/server/errors";
import { getRequestContext } from "@/server/get-request-context";
import { hasPermission } from "@/server/policies/require-permission";
import { getConfirmationReadiness } from "@/server/services/confirmation-readiness-service";
import { getHoldReadiness } from "@/server/services/hold-readiness-service";
import { getCurrentTenantTimezone, getInquiryDetail } from "@/server/services/inquiry-service";
import { getInquiryPlanAvailabilitySnapshot } from "@/server/services/resource-hold-service";
import { listActiveResourceTypeCounts } from "@/server/services/resource-schedule-service";
import { BOOKING_STATUSES } from "@/types/booking";
import type { ConfirmationReadinessResult } from "@/types/confirmation-readiness";
import type { HoldReadinessResult } from "@/types/hold-readiness";
import { PERMISSIONS } from "@/types/permissions";

type InquiryDetailView =
  | { kind: "status"; title: string; body: string }
  | { kind: "missing" }
  | {
      kind: "ready";
      inquiry: NonNullable<Awaited<ReturnType<typeof getInquiryDetail>>>;
      canManage: boolean;
      canManageInventory: boolean;
      canHold: boolean;
      canRelease: boolean;
      canConfirm: boolean;
      canCancel: boolean;
      canApproveQuotes: boolean;
      canOverrideQuotePricing: boolean;
      timeZone: string;
      resourceCheck: Awaited<ReturnType<typeof getInquiryPlanAvailabilitySnapshot>> | null;
      knowledge: Awaited<ReturnType<typeof listWorkspaceKnowledge>>;
      activity: Awaited<ReturnType<typeof listInquiryActivity>>;
      currentUserId: string;
      inventoryCounts: Awaited<ReturnType<typeof listActiveResourceTypeCounts>>;
      confirmationReadiness: ConfirmationReadinessResult | null;
      holdReadiness: HoldReadinessResult | null;
    };

async function loadInquiryDetailView(id: string): Promise<InquiryDetailView> {
  try {
    const ctx = await getRequestContext();
    const [
      inquiry,
      canManage,
      canManageInventory,
      canHold,
      canRelease,
      canConfirm,
      canCancel,
      canApproveQuotes,
      canOverrideQuotePricing,
      timeZone,
    ] = await Promise.all([
      getInquiryDetail(ctx, db, id),
      hasPermission(ctx, PERMISSIONS.CRM_INQUIRIES_MANAGE, db),
      hasPermission(ctx, PERMISSIONS.INVENTORY_MANAGE, db),
      hasPermission(ctx, PERMISSIONS.EVENTS_CREATE, db),
      hasPermission(ctx, PERMISSIONS.EVENTS_EDIT, db),
      hasPermission(ctx, PERMISSIONS.EVENTS_CONFIRM, db),
      hasPermission(ctx, PERMISSIONS.EVENTS_CANCEL, db),
      hasPermission(ctx, PERMISSIONS.CRM_QUOTES_APPROVE, db),
      hasPermission(ctx, PERMISSIONS.CRM_QUOTES_PRICE_OVERRIDE, db),
      getCurrentTenantTimezone(ctx, db),
    ]);
    if (!inquiry) {
      return { kind: "missing" };
    }
    const selectedPlan = inquiry.eventPlanRecommendations.find((plan) => plan.id === inquiry.selectedEventPlanId);
    const workingPlan =
      inquiry.eventPlanRecommendations.find((plan) => plan.id === inquiry.agentWorkingPlanId) ??
      inquiry.eventPlanRecommendations.find((plan) => plan.kind === EVENT_PLAN_KINDS.AGENT_WORKING) ??
      null;
    const bookingStatus = inquiry.bookings[0]?.status;
    const skipAvailability =
      bookingStatus === BOOKING_STATUSES.CONFIRMED || bookingStatus === BOOKING_STATUSES.CANCELLED;
    const planForCheck = skipAvailability ? null : (workingPlan ?? selectedPlan);
    const [resourceCheck, knowledge, activity, inventoryCounts, confirmationReadiness, holdReadiness] =
      await Promise.all([
        planForCheck ? getInquiryPlanAvailabilitySnapshot(ctx, db, inquiry, planForCheck) : Promise.resolve(null),
        listWorkspaceKnowledge(ctx, db),
        listInquiryActivity(ctx, db, inquiry.id),
        listActiveResourceTypeCounts(db, ctx.organizationId, inquiry.locationId),
        getConfirmationReadiness(ctx, db, inquiry.id).catch(() => null),
        getHoldReadiness(ctx, db, inquiry.id).catch(() => null),
      ]);
    return {
      kind: "ready",
      inquiry,
      canManage,
      canManageInventory,
      canHold,
      canRelease,
      canConfirm,
      canCancel,
      canApproveQuotes,
      canOverrideQuotePricing,
      timeZone,
      resourceCheck,
      knowledge,
      activity,
      currentUserId: ctx.userId,
      inventoryCounts,
      confirmationReadiness,
      holdReadiness,
    };
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

  const {
    inquiry,
    canManage,
    canManageInventory,
    canHold,
    canRelease,
    canConfirm,
    canCancel,
    canApproveQuotes,
    canOverrideQuotePricing,
    timeZone,
    resourceCheck,
    knowledge,
    activity,
    currentUserId,
    inventoryCounts,
    confirmationReadiness,
    holdReadiness,
  } = view;
  const conversation = inquiry.conversations[0];
  const wpIntake = findWpIntakeMetadata(conversation?.messages);
  const selectedPlan = inquiry.eventPlanRecommendations.find(
    (plan) => plan.id === inquiry.selectedEventPlanId,
  );
  const workingPlan =
    inquiry.eventPlanRecommendations.find((plan) => plan.id === inquiry.agentWorkingPlanId) ??
    inquiry.eventPlanRecommendations.find((plan) => plan.kind === EVENT_PLAN_KINDS.AGENT_WORKING) ??
    null;
  const wpStaffDraftProvenance = workingPlan
    ? readWpQuoteDraftProvenance(workingPlan.payload)
    : null;
  const wpDeliveryPolicy = wpIntake
    ? resolveWpCustomerQuoteDeliveryPolicy(wpIntake.privateCalculation)
    : null;
  const wpSnapshotReady =
    wpIntake?.privateCalculation.status === "ready" &&
    Boolean(
      wpIntake.privateCalculation.snapshot &&
        typeof wpIntake.privateCalculation.snapshot === "object" &&
        (wpIntake.privateCalculation.snapshot as { valid?: unknown }).valid === true,
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

  // WP staff drafts stay on the inquiry detail surface — Live Agent catalog reprice is not WP-safe yet.
  if (selectedPlan && !wpStaffDraftProvenance) {
    return (
      <>
        <AcknowledgeInquiryView inquiryId={inquiry.id} />
        <LiveAgentWorkspace
          inquiry={inquiry}
          selectedPlan={selectedPlan}
          workingPlan={workingPlan}
          resourceCheck={resourceCheck}
          knowledge={knowledge}
          activity={activity}
          currentUserId={currentUserId}
          canManage={canManage}
          canManageInventory={canManageInventory}
          canHold={canHold}
          canRelease={canRelease}
          canConfirm={canConfirm}
          canCancel={canCancel}
          timeZone={timeZone}
          recommendations={inquiry.eventPlanRecommendations.map((row) => ({
            id: row.id,
            kind: row.kind,
            title: row.title,
            tier: row.tier,
          }))}
          inventoryCounts={inventoryCounts}
          confirmationReadiness={confirmationReadiness}
          holdReadiness={holdReadiness}
          readinessSection={
            holdReadiness || confirmationReadiness ? (
              inquiry.bookings[0]?.status === BOOKING_STATUSES.CONFIRMED ||
              inquiry.bookings[0]?.status === BOOKING_STATUSES.CANCELLED ? (
                <details className="mt-6 rounded-[var(--radius-card)] border border-border bg-surface px-4 py-3">
                  <summary className="cursor-pointer text-sm font-semibold text-foreground">
                    Historical readiness details
                  </summary>
                  <p className="mt-2 text-sm text-muted-foreground">
                    HOLD and confirmation readiness from before this booking closed. They are not
                    active workflow steps.
                  </p>
                  <div className="mt-4 space-y-4" aria-label="Historical booking readiness">
                    {holdReadiness ? (
                      <HoldReadinessPanel
                        readiness={holdReadiness}
                        canHold={false}
                        inquiryAssigned={Boolean(inquiry.assignedUserProfileId)}
                      />
                    ) : null}
                    {confirmationReadiness ? (
                      <ConfirmationReadinessPanel readiness={confirmationReadiness} />
                    ) : null}
                  </div>
                </details>
              ) : (
                <div className="mt-6 space-y-4" aria-label="Booking readiness">
                  <h2 className="text-[length:var(--text-title-sm)] font-semibold text-foreground">
                    HOLD and confirmation readiness
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    HOLD and confirmation stay separate. A PLACE_HOLD exception never authorizes
                    confirmation, and a CONFIRM_BOOKING exception never authorizes HOLD placement.
                  </p>
                  {holdReadiness ? (
                    <HoldReadinessPanel
                      readiness={holdReadiness}
                      canHold={canHold && canManage}
                      inquiryAssigned={Boolean(inquiry.assignedUserProfileId)}
                    />
                  ) : null}
                  {confirmationReadiness ? (
                    <ConfirmationReadinessPanel readiness={confirmationReadiness} />
                  ) : null}
                </div>
              )
            ) : null
          }
        />
      </>
    );
  }

  const statusBanner = employeeInquiryStatusBanner({
    isWpIntake: Boolean(wpIntake),
    selectedEventPlanId: inquiry.selectedEventPlanId,
    bookingNumber: inquiry.bookings[0]?.bookingNumber,
  });
  const privateEstimateCents =
    wpStaffDraftProvenance?.totalCents ??
    (typeof wpIntake?.privateCalculation.snapshot === "object" &&
    wpIntake.privateCalculation.snapshot &&
    "valid" in wpIntake.privateCalculation.snapshot &&
    (wpIntake.privateCalculation.snapshot as { valid?: boolean }).valid === true
      ? (
          wpIntake.privateCalculation.snapshot as {
            dates?: Array<{ recommendation?: { total_cents?: number } }>;
          }
        ).dates?.[0]?.recommendation?.total_cents
      : null);
  const quoteApproved = Boolean(wpStaffDraftProvenance?.employeeApproval);
  const quoteDelivered = Boolean(wpStaffDraftProvenance?.employeeApproval?.deliveryCompleted);
  const availabilityLabel = workingPlan?.availabilityStatus ?? "Not checked";
  const warningCount =
    (wpStaffDraftProvenance?.warnings.length ?? 0) +
    (wpStaffDraftProvenance?.catalogPriceDiscrepancies.length ?? 0);
  const guestSummary = wpIntake
    ? `${wpIntake.answers.adults} adults · ${wpIntake.answers.children} children (${inquiry.guestCount ?? wpIntake.answers.adults + wpIntake.answers.children} total)`
    : inquiry.adultGuestCount != null || inquiry.childGuestCount != null
      ? `${inquiry.adultGuestCount ?? 0} adults · ${inquiry.childGuestCount ?? 0} children (${inquiry.guestCount ?? "—"} total)`
      : String(inquiry.guestCount ?? "—");
  const durationSummary =
    inquiry.desiredDurationMinutes != null
      ? formatDesiredDuration(inquiry.desiredDurationMinutes)
      : wpIntake
        ? `${wpIntake.answers.duration}${wpIntake.answers.otherHours != null ? ` (${wpIntake.answers.otherHours}h)` : ""}`
        : "—";

  return (
    <section className="mx-auto w-full max-w-5xl">
      <AcknowledgeInquiryView inquiryId={inquiry.id} />
      <Link href="/app/inquiries" className="text-sm font-semibold text-primary">
        Back to inquiries
      </Link>

      <header className="mt-4 rounded-[var(--radius-card)] border border-border bg-surface p-5 shadow-[var(--shadow-card)] sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="text-[length:var(--text-caption)] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
              {formatEmployeeInquiryQueueLabel({
                isWpIntake: Boolean(wpIntake),
                status: inquiry.status,
                aiHandlingEnabled: inquiry.aiHandlingEnabled,
                selectedEventPlanId: inquiry.selectedEventPlanId,
                humanHandoffReason: inquiry.humanHandoffReason,
                bookingNumber: inquiry.bookings[0]?.bookingNumber,
                bookingStatus: inquiry.bookings[0]?.status,
                salesStage: inquiry.salesStage,
              })}
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              {displayName}
            </h1>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <dt className="text-muted-foreground">Event type</dt>
                <dd className="mt-0.5 font-medium text-foreground">{inquiry.eventType || "—"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Requested date / time</dt>
                <dd className="mt-0.5 font-medium text-foreground">
                  {formatEventLocalDateTime({
                    date: inquiry.desiredDate,
                    time: inquiry.desiredStartTime,
                  })}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Guests</dt>
                <dd className="mt-0.5 font-medium text-foreground">{guestSummary}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Duration</dt>
                <dd className="mt-0.5 font-medium text-foreground">{durationSummary}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Primary contact</dt>
                <dd className="mt-0.5 font-medium text-foreground">
                  {[inquiry.customerFirstName, inquiry.customerLastName].filter(Boolean).join(" ") ||
                    "—"}
                  {phoneDisplay ? ` · ${phoneDisplay}` : ""}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Email</dt>
                <dd className="mt-0.5 font-medium text-foreground break-all">{inquiry.customerEmail}</dd>
              </div>
            </dl>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <a
              href={mailto}
              className="inline-flex min-h-10 items-center justify-center rounded-[var(--radius-control)] bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
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
                  className="inline-flex min-h-10 items-center justify-center rounded-[var(--radius-control)] border border-border px-4 py-2 text-sm font-semibold"
                >
                  Take over
                </PendingSubmitButton>
              </SecurityActionForm>
            ) : null}
          </div>
        </div>

        {inquiry.bookings[0] ? (
          <p className="mt-4 rounded-[var(--radius-control)] border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
            Converted to Booking{" "}
            <Link href={`/app/bookings/${inquiry.bookings[0].id}`} className="font-semibold text-primary">
              {inquiry.bookings[0].bookingNumber}
            </Link>
          </p>
        ) : statusBanner ? (
          <div
            className={`mt-4 rounded-[var(--radius-control)] border px-3 py-2 text-sm ${
              statusBanner.tone === "info"
                ? "border-info/30 bg-info/5 text-foreground"
                : statusBanner.tone === "success"
                  ? "border-success/30 bg-success/5 text-foreground"
                  : "border-border bg-muted/40 text-foreground"
            }`}
          >
            <p className="font-semibold">{statusBanner.title}</p>
            {statusBanner.detail ? (
              <p className="mt-1 text-muted-foreground">{statusBanner.detail}</p>
            ) : null}
          </div>
        ) : null}

        <div className="mt-4">
          <InquiryArchiveActions
            inquiryId={inquiry.id}
            archived={Boolean(inquiry.archivedAt)}
            canManage={canManage}
            bookingId={inquiry.bookings[0]?.id}
            bookingNumber={inquiry.bookings[0]?.bookingNumber}
            bookingStatus={inquiry.bookings[0]?.status}
          />
        </div>
      </header>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatusCard
          label="Private estimate"
          value={
            typeof privateEstimateCents === "number"
              ? formatMoneyFromCents(privateEstimateCents, "USD")
              : "Not ready"
          }
          hint={wpIntake ? "Staff-only WordPress calculation" : "No private estimate"}
        />
        <StatusCard
          label="Availability"
          value={availabilityLabel}
          hint={workingPlan?.availabilityNote || "Check from Staff quote"}
        />
        <StatusCard
          label="Quote status"
          value={
            quoteApproved
              ? "Internally approved"
              : workingPlan && wpStaffDraftProvenance
                ? "Draft in progress"
                : "No staff draft"
          }
          hint={quoteDelivered ? "Customer delivery completed" : "Approval ≠ customer send"}
        />
        <StatusCard
          label="Customer delivery"
          value={
            wpDeliveryPolicy?.canDeliver
              ? quoteDelivered
                ? "Delivered"
                : "Allowed"
              : "Blocked"
          }
          hint={
            wpDeliveryPolicy?.canDeliver
              ? "tenant_live delivery path available"
              : wpDeliveryPolicy?.message || "Delivery remains gated"
          }
        />
      </div>

      {warningCount > 0 ? (
        <div className="mt-4 rounded-[var(--radius-control)] border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
          <p className="font-semibold text-warning">
            {warningCount} staff attention item{warningCount === 1 ? "" : "s"}
          </p>
          <p className="mt-1 text-foreground">
            Review warnings and known catalog discrepancies on the Staff quote and Recommendations tabs
            before contacting the customer.
          </p>
        </div>
      ) : null}

      {wpIntake || (inquiry.humanHandoffReason && !inquiry.selectedEventPlanId) ? (
        <div className="mt-4 rounded-[var(--radius-control)] border border-border bg-muted/30 px-4 py-3 text-sm">
          <p className="font-semibold text-foreground">
            {wpIntake ? "Recommended next actions" : "Needs staff follow-up"}
          </p>
          <p className="mt-1 text-muted-foreground">
            {employeeReadyForHumanCopy({
              isWpIntake: Boolean(wpIntake),
              reason: inquiry.humanHandoffReason,
              selectedEventPlanId: inquiry.selectedEventPlanId,
            })}
          </p>
        </div>
      ) : null}

      <EmployeeInquiryTabs
        badges={warningCount > 0 ? { recommendations: String(warningCount) } : undefined}
        panels={{
          overview: (
            <div className="space-y-5">
              <div className="rounded-[var(--radius-card)] border border-border bg-surface p-4 sm:p-5">
                <h2 className="text-sm font-semibold text-foreground">Event summary</h2>
                <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-muted-foreground">Customer / group</dt>
                    <dd className="mt-1 font-medium">{inquiry.customerGroupName || displayName}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Guest mix</dt>
                    <dd className="mt-1 font-medium">{formatGuestMix(inquiry.guestMix)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Budget</dt>
                    <dd className="mt-1 font-medium">
                      {wpIntake
                        ? wpIntake.answers.hasBudget === "yes" && wpIntake.answers.budgetCents != null
                          ? `$${(wpIntake.answers.budgetCents / 100).toFixed(2)}`
                          : "Flexible"
                        : formatIntakeBudget({
                            budgetPreference: inquiry.budgetPreference,
                            budgetMin: inquiry.budgetMin,
                            budgetMax: inquiry.budgetMax,
                          })}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Event goal</dt>
                    <dd className="mt-1 font-medium">{inquiry.eventGoal || inquiry.occasion || "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Food</dt>
                    <dd className="mt-1 font-medium">
                      {wpIntake ? wpIntake.answers.food : formatDiningPreference(inquiry.diningPreference)}
                    </dd>
                  </div>
                  {wpIntake || inquiry.beveragePreference ? (
                    <div>
                      <dt className="text-muted-foreground">Beverages</dt>
                      <dd className="mt-1 font-medium">
                        {wpIntake
                          ? `Craft: ${wpIntake.answers.craft}`
                          : formatBeveragePreference(inquiry.beveragePreference)}
                      </dd>
                    </div>
                  ) : null}
                  <div>
                    <dt className="text-muted-foreground">Private space</dt>
                    <dd className="mt-1 font-medium">
                      {wpIntake
                        ? wpIntake.answers.privateRoom
                        : formatSpacePreference(inquiry.spacePreference)}
                    </dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-muted-foreground">Attraction preferences</dt>
                    <dd className="mt-1">
                      {wpIntake ? (
                        <ul className="grid gap-1 sm:grid-cols-2">
                          {WP_ATTRACTION_KEYS.map((key) => (
                            <li key={key}>
                              {WP_ATTRACTION_LABELS[key]}:{" "}
                              {WP_ATTRACTION_ANSWER_LABELS[wpIntake.answers.attractions[key]]}
                            </li>
                          ))}
                        </ul>
                      ) : inquiry.attractionInterestNames.length > 0 ? (
                        inquiry.attractionInterestNames.join(", ")
                      ) : (
                        "—"
                      )}
                    </dd>
                  </div>
                </dl>
                {inquiry.customerNotes ? (
                  <div className="mt-4 border-t border-border pt-4">
                    <p className="text-muted-foreground">Customer notes</p>
                    <p className="mt-1 whitespace-pre-wrap text-foreground/90">{inquiry.customerNotes}</p>
                  </div>
                ) : null}
              </div>

              <div className="rounded-[var(--radius-card)] border border-border bg-surface p-4 sm:p-5">
                <h2 className="text-sm font-semibold text-foreground">Customer activity</h2>
                <div className="mt-3">
                  <InquiryFunnel
                    timeZone={timeZone}
                    inquiry={{
                      ...inquiry,
                      selectedPlanTitle: undefined,
                      selectedPlanTier: undefined,
                    }}
                  />
                </div>
              </div>

              {inquiry.internalSummary ? (
                <div className="rounded-[var(--radius-card)] border border-border bg-surface p-4 sm:p-5">
                  <h2 className="text-sm font-semibold text-foreground">Planner summary</h2>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-foreground/80">
                    {inquiry.internalSummary}
                  </p>
                </div>
              ) : null}
            </div>
          ),
          quote: wpIntake ? (
            <WpStaffQuoteDraftPanel
              inquiryId={inquiry.id}
              canManage={canManage}
              canApproveQuotes={canApproveQuotes}
              canOverrideQuotePricing={canOverrideQuotePricing}
              canCreate={wpSnapshotReady}
              draft={workingPlan && wpStaffDraftProvenance ? workingPlan : null}
              provenance={wpStaffDraftProvenance}
              deliveryPolicy={wpDeliveryPolicy}
              customerEmail={inquiry.customerEmail}
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              Staff quote drafting for WordPress intake is not available on this inquiry.
            </p>
          ),
          recommendations: wpIntake ? (
            <WpIntakeAnswersPanel metadata={wpIntake} />
          ) : (
            <p className="text-sm text-muted-foreground">No private WordPress recommendation on this inquiry.</p>
          ),
          activity: (
            <div className="space-y-5">
              <div className="rounded-[var(--radius-card)] border border-border bg-surface p-4 sm:p-5">
                <h2 className="text-sm font-semibold text-foreground">Inquiry notes</h2>
                <div className="mt-3">
                  <EmployeeInquiryConversation messages={conversation?.messages ?? []} />
                </div>
                {canManage && conversation ? (
                  <SecurityActionForm
                    action={sendEmployeeInquiryMessageAction}
                    className="mt-6 space-y-3"
                    notice={{ successTitle: "Reply sent", errorTitle: "Unable to send reply" }}
                  >
                    <input type="hidden" name="inquiryId" value={inquiry.id} />
                    <input type="hidden" name="conversationId" value={conversation.id} />
                    <label className="block text-sm">
                      <span className="text-muted-foreground">Internal / customer follow-up note</span>
                      <textarea
                        name="content"
                        required
                        rows={3}
                        maxLength={2000}
                        className="mt-1 w-full rounded-[var(--radius-control)] border border-border bg-background px-3 py-2"
                      />
                    </label>
                    <PendingSubmitButton
                      pendingLabel="Sending…"
                      className="rounded-[var(--radius-control)] bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
                    >
                      Add note
                    </PendingSubmitButton>
                  </SecurityActionForm>
                ) : null}
              </div>
            </div>
          ),
        }}
      />
    </section>
  );
}

function StatusCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-[var(--radius-card)] border border-border bg-surface px-4 py-3 shadow-sm">
      <p className="text-[length:var(--text-caption)] font-semibold tracking-wide text-muted-foreground uppercase">
        {label}
      </p>
      <p className="mt-1 text-base font-semibold text-foreground">{value}</p>
      <p className="mt-1 text-[length:var(--text-caption)] text-muted-foreground">{hint}</p>
    </div>
  );
}
