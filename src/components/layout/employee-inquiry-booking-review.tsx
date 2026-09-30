import { AcknowledgeInquiryView } from "@/components/layout/acknowledge-inquiry-view";
import { LiveAgentWorkspace } from "@/components/layout/live-agent-workspace";
import { ScheduleBookingRecordLinks } from "@/components/layout/schedule-booking-record-links";
import { db } from "@/lib/db";
import { isAuthorizationError, isInquiryError, isTenantContextError } from "@/server/errors";
import { getRequestContext } from "@/server/get-request-context";
import { hasPermission } from "@/server/policies/require-permission";
import { listInquiryActivity, listWorkspaceKnowledge } from "@/server/services/live-agent-service";
import { getCurrentTenantTimezone, getInquiryDetail } from "@/server/services/inquiry-service";
import { getInquiryPlanAvailabilitySnapshot } from "@/server/services/resource-hold-service";
import { listActiveResourceTypeCounts } from "@/server/services/resource-schedule-service";
import { BOOKING_STATUSES } from "@/types/booking";
import { EVENT_PLAN_KINDS } from "@/types/inquiry";
import { PERMISSIONS } from "@/types/permissions";

type ReviewModel =
  | { kind: "message"; body: string }
  | { kind: "missing-plan"; inquiryId: string; bookingId: string | null }
  | {
      kind: "ready";
      inquiry: NonNullable<Awaited<ReturnType<typeof getInquiryDetail>>>;
      selectedPlan: NonNullable<NonNullable<Awaited<ReturnType<typeof getInquiryDetail>>>["eventPlanRecommendations"][number]>;
      workingPlan: NonNullable<Awaited<ReturnType<typeof getInquiryDetail>>>["eventPlanRecommendations"][number] | null;
      resourceCheck: Awaited<ReturnType<typeof getInquiryPlanAvailabilitySnapshot>> | null;
      knowledge: Awaited<ReturnType<typeof listWorkspaceKnowledge>>;
      activity: Awaited<ReturnType<typeof listInquiryActivity>>;
      inventoryCounts: Awaited<ReturnType<typeof listActiveResourceTypeCounts>>;
      currentUserId: string;
      canManage: boolean;
      canHold: boolean;
      canRelease: boolean;
      canConfirm: boolean;
      canCancel: boolean;
      timeZone: string;
      bookingId: string | null;
    };

async function loadReview(inquiryId: string): Promise<ReviewModel> {
  try {
    const ctx = await getRequestContext();
    const [inquiry, canManage, canHold, canRelease, canConfirm, canCancel, timeZone] = await Promise.all([
      getInquiryDetail(ctx, db, inquiryId),
      hasPermission(ctx, PERMISSIONS.CRM_INQUIRIES_MANAGE, db),
      hasPermission(ctx, PERMISSIONS.EVENTS_CREATE, db),
      hasPermission(ctx, PERMISSIONS.EVENTS_EDIT, db),
      hasPermission(ctx, PERMISSIONS.EVENTS_CONFIRM, db),
      hasPermission(ctx, PERMISSIONS.EVENTS_CANCEL, db),
      getCurrentTenantTimezone(ctx, db),
    ]);
    if (!inquiry) {
      return { kind: "message", body: "This inquiry is not available." };
    }
    const selectedPlan = inquiry.eventPlanRecommendations.find((plan) => plan.id === inquiry.selectedEventPlanId) ?? null;
    const workingPlan =
      inquiry.eventPlanRecommendations.find((plan) => plan.id === inquiry.agentWorkingPlanId) ??
      inquiry.eventPlanRecommendations.find((plan) => plan.kind === EVENT_PLAN_KINDS.AGENT_WORKING) ??
      null;
    const booking = inquiry.bookings[0] ?? null;
    if (!selectedPlan) {
      return { kind: "missing-plan", inquiryId: inquiry.id, bookingId: booking?.id ?? null };
    }
    const bookingStatus = booking?.status;
    const skipAvailability = bookingStatus === BOOKING_STATUSES.CONFIRMED || bookingStatus === BOOKING_STATUSES.CANCELLED;
    const planForCheck = skipAvailability ? null : (workingPlan ?? selectedPlan);
    const [resourceCheck, knowledge, activity, inventoryCounts] = await Promise.all([
      planForCheck ? getInquiryPlanAvailabilitySnapshot(ctx, db, inquiry, planForCheck) : Promise.resolve(null),
      listWorkspaceKnowledge(ctx, db),
      listInquiryActivity(ctx, db, inquiry.id),
      listActiveResourceTypeCounts(db, ctx.organizationId, inquiry.locationId),
    ]);
    return {
      kind: "ready",
      inquiry,
      selectedPlan,
      workingPlan,
      resourceCheck,
      knowledge,
      activity,
      inventoryCounts,
      currentUserId: ctx.userId,
      canManage,
      canHold,
      canRelease,
      canConfirm,
      canCancel,
      timeZone,
      bookingId: booking?.id ?? null,
    };
  } catch (error) {
    if (isAuthorizationError(error) || isTenantContextError(error) || isInquiryError(error)) {
      return { kind: "message", body: error.userMessage };
    }
    throw error;
  }
}

export async function EmployeeInquiryBookingReview({ inquiryId }: { inquiryId: string }) {
  const model = await loadReview(inquiryId);
  if (model.kind === "message") {
    return <p className="text-sm text-foreground/70">{model.body}</p>;
  }
  if (model.kind === "missing-plan") {
    return (
      <div className="space-y-3 text-sm">
        <p>The event was created, but a plan is not ready to review in the schedule.</p>
        <ScheduleBookingRecordLinks inquiryId={model.inquiryId} bookingId={model.bookingId} />
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <AcknowledgeInquiryView inquiryId={model.inquiry.id} />
      <ScheduleBookingRecordLinks inquiryId={model.inquiry.id} bookingId={model.bookingId} />
      <LiveAgentWorkspace
        inquiry={model.inquiry}
        selectedPlan={model.selectedPlan}
        workingPlan={model.workingPlan}
        resourceCheck={model.resourceCheck}
        knowledge={model.knowledge}
        activity={model.activity}
        currentUserId={model.currentUserId}
        canManage={model.canManage}
        canHold={model.canHold}
        canRelease={model.canRelease}
        canConfirm={model.canConfirm}
        canCancel={model.canCancel}
        timeZone={model.timeZone}
        recommendations={model.inquiry.eventPlanRecommendations.map((row) => ({
          id: row.id,
          kind: row.kind,
          title: row.title,
          tier: row.tier,
        }))}
        inventoryCounts={model.inventoryCounts}
      />
    </div>
  );
}
