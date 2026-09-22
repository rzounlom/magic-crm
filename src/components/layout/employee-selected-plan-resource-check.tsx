import { SecurityActionForm } from "@/components/layout/security-action-form";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import {
  formatAllocatedSummary,
  formatAllocatedWindow,
  formatRequirementClockRange,
  groupAllocatedResources,
  type AllocationReservation,
  type ResourceTypeInventoryCount,
} from "@/lib/bookings/allocated-resources";
import { formatEventLocalTime, formatOrganizationTimestamp } from "@/lib/inquiries/tenant-datetime";
import { formatHoldTimeRemaining, holdExpiresSoon } from "@/lib/inquiries/workflow-stage";
import { checkInquiryAvailabilityAction, applyWorkingPlanStartTimeAction } from "@/server/actions/live-agent";
import {
  expireInquiryHoldNowAction,
  extendInquiryHoldAction,
  releaseInquiryHoldsAction,
  updateInquiryHoldAction,
} from "@/server/actions/resource-schedule";
import { PLAN_AVAILABILITY_STATUS_LABELS, PLAN_AVAILABILITY_STATUSES } from "@/types/resource-schedule";
import type { PlanAvailabilityStatus, ResourceAvailabilityResult, PlanResourceRequirement } from "@/types/resource-schedule";

export function EmployeeSelectedPlanResourceCheck({
  inquiryId,
  availabilityStatus,
  live,
  holds,
  allocations = [],
  inventoryCounts = [],
  canHold,
  canRelease,
  timeZone,
  title = "Rooms and lanes",
  scheduleHref,
  holdAffected = false,
  canCheckAvailability = false,
  nearbyStartTimes = [],
  mode = "pending",
}: {
  inquiryId: string;
  availabilityStatus: string;
  live: { requirements: PlanResourceRequirement[]; result: ResourceAvailabilityResult } | null;
  holds: Array<{
    id: string;
    startMinute: number;
    endMinute: number;
    expiresAt: Date | null;
    resource: { name: string; resourceType: { name: string } };
  }>;
  allocations?: AllocationReservation[];
  inventoryCounts?: ResourceTypeInventoryCount[];
  canHold: boolean;
  canRelease: boolean;
  timeZone: string;
  title?: string;
  scheduleHref?: string;
  holdAffected?: boolean;
  canCheckAvailability?: boolean;
  nearbyStartTimes?: string[];
  mode?: "pending" | "confirmed" | "cancelled";
}) {
  const status = (availabilityStatus in PLAN_AVAILABILITY_STATUS_LABELS
    ? availabilityStatus
    : PLAN_AVAILABILITY_STATUSES.NOT_VALIDATED) as PlanAvailabilityStatus;
  const bySlug = new Map((live?.result.types ?? []).map((row) => [row.resourceTypeSlug, row]));
  const allAvailable =
    mode === "pending" &&
    Boolean(live?.result.validated && live.result.available && live.requirements.every((row) => row.quantity != null));
  const soonest = holds
    .map((row) => row.expiresAt)
    .filter((value): value is Date => Boolean(value))
    .sort((left, right) => left.getTime() - right.getTime())[0];
  const allocatedGroups = groupAllocatedResources(
    mode === "cancelled" ? allocations : allocations.filter((row) => !row.releasedAt),
    inventoryCounts,
  );
  const heading = mode === "confirmed" || mode === "cancelled" ? "Resources booked" : title;

  return (
    <section className="mt-8 rounded-md border border-border px-5 py-5">
      <h2 className="text-lg font-semibold">{heading}</h2>
      {mode === "confirmed" ? (
        <p className="mt-1 text-sm text-foreground/70">Resources booked for this event.</p>
      ) : mode === "cancelled" ? (
        <p className="mt-1 text-sm text-foreground/70">Booking cancelled. Resources released.</p>
      ) : (
        <p className="mt-1 text-sm text-foreground/70">
          {PLAN_AVAILABILITY_STATUS_LABELS[status]}. Checking availability does not reserve rooms or lanes.
          Availability will be rechecked when the booking is confirmed.
        </p>
      )}
      {scheduleHref ? (
        <a href={scheduleHref} className="mt-3 inline-block text-sm text-primary">
          View Master Schedule
        </a>
      ) : null}
      {mode === "pending" ? (
        !live || live.requirements.length === 0 ? (
          <p className="mt-4 text-sm text-foreground/70">No finite resources are mapped to this plan.</p>
        ) : (
          <ul className="mt-4 space-y-3 text-sm">
            {live.requirements.map((requirement) => {
              const liveType = bySlug.get(requirement.resourceTypeSlug);
              const required = requirement.quantity;
              const available = liveType?.availableQuantity;
              const notConfigured = !requirement.inventoryConfigured || requirement.requiresStaffConfiguration;
              const label = notConfigured
                ? "Not validated"
                : liveType?.conflict
                  ? "Needs adjustment"
                  : "Available";
              const windowLabel = formatRequirementClockRange(
                requirement.windowStartTime,
                requirement.windowEndTime,
              );
              return (
                <li key={`${requirement.knowledgeItemId}-${requirement.resourceTypeSlug}-${requirement.windowStartTime ?? "event"}`}>
                  <p className="font-medium">{requirement.resourceTypeName}</p>
                  <p className="text-foreground/70">
                    {required == null ? "Quantity unknown" : `${required} required`}
                    {available != null ? ` · ${available} currently available` : ""}
                    {` · ${label}`}
                  </p>
                  {windowLabel ? <p className="text-foreground/60">{windowLabel}</p> : null}
                  {requirement.locationExclusive || requirement.quantityRule === "LOCATION_EXCLUSIVE" ? (
                    <p className="text-foreground/60">Private use of the full facility</p>
                  ) : null}
                  {requirement.rotationNote ? (
                    <p className="mt-1 text-foreground/60">{requirement.rotationNote}</p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )
      ) : allocatedGroups.length === 0 ? (
        <p className="mt-4 text-sm text-foreground/70">
          {mode === "cancelled" ? "No resource allocation remains on this booking." : "No finite resources are attached to this booking."}
        </p>
      ) : (
        <ul className="mt-4 space-y-4 text-sm">
          {allocatedGroups.map((group) => (
            <li key={group.key}>
              <p className="font-medium">{group.resourceTypeName}</p>
              <p className="text-foreground/70">{formatAllocatedWindow(group)}</p>
              <p className="text-foreground/70">
                {group.released
                  ? `${group.allocatedQuantity} released`
                  : `${group.allocatedQuantity} ${group.allocatedQuantity === 1 ? "unit" : "units"} booked`}
                {group.activeQuantity != null ? ` · ${formatAllocatedSummary(group)}` : ""}
              </p>
              <ul className="mt-1 list-disc pl-5 text-foreground/80">
                {group.names.map((name) => (
                  <li key={name}>{name}</li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
      {mode === "pending" && allAvailable ? (
        <p className="mt-4 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
          Available. All required resources are currently free at the selected time.
        </p>
      ) : mode === "pending" && live?.result.validated && !live.result.available ? (
        <div className="mt-4 rounded-md border border-warning/40 bg-warning/10 px-3 py-3 text-sm">
          <p>
            {live.requirements
              .filter((row) => bySlug.get(row.resourceTypeSlug)?.conflict)
              .map((row) => row.knowledgeItemName || row.resourceTypeName)[0] ?? "A required activity"}{" "}
            is unavailable
            {live.requirements.find((row) => row.windowStartTime && bySlug.get(row.resourceTypeSlug)?.conflict)
              ? ` from ${formatRequirementClockRange(
                  live.requirements.find((row) => bySlug.get(row.resourceTypeSlug)?.conflict)?.windowStartTime,
                  live.requirements.find((row) => bySlug.get(row.resourceTypeSlug)?.conflict)?.windowEndTime,
                )}`
              : ""}
            .
          </p>
          {nearbyStartTimes.length > 0 ? (
            <div className="mt-3">
              <p className="font-medium">Closest available options:</p>
              <ul className="mt-2 flex flex-wrap gap-2">
                {nearbyStartTimes.map((time) => (
                  <li key={time}>
                    <SecurityActionForm
                      action={applyWorkingPlanStartTimeAction}
                      notice={{
                        successTitle: "Schedule updated",
                        errorTitle: "Unable to apply that start time",
                      }}
                    >
                      <input type="hidden" name="inquiryId" value={inquiryId} />
                      <input type="hidden" name="startTime" value={time} />
                      <PendingSubmitButton
                        pendingLabel="Updating…"
                        className="rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium"
                      >
                        {formatEventLocalTime(time) ?? time}
                      </PendingSubmitButton>
                    </SecurityActionForm>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="mt-2">{live.result.note}</p>
          )}
        </div>
      ) : null}
      {canCheckAvailability && mode === "pending" ? (
        <SecurityActionForm
          action={checkInquiryAvailabilityAction}
          className="mt-4"
          notice={{ successTitle: "Availability checked", errorTitle: "Unavailable" }}
        >
          <input type="hidden" name="inquiryId" value={inquiryId} />
          <PendingSubmitButton
            pendingLabel="Checking…"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Check Availability
          </PendingSubmitButton>
        </SecurityActionForm>
      ) : null}
      {mode === "pending" && holds.length > 0 ? (
        <div className="mt-6 border-t border-border pt-4">
          <h3 className="text-sm font-medium">Legacy hold</h3>
          <ul className="mt-2 space-y-2 text-sm text-foreground/80">
            {groupAllocatedResources(holds).map((group) => (
              <li key={group.key}>
                <p className="font-medium">{group.names.join(", ")}</p>
                <p>
                  {formatAllocatedWindow(group)}
                  {holds.find((row) => row.startMinute === group.startMinute)?.expiresAt
                    ? ` · Hold expires ${formatOrganizationTimestamp(
                        holds.find((row) => row.startMinute === group.startMinute)?.expiresAt as Date,
                        timeZone,
                      )}`
                    : ""}
                </p>
              </li>
            ))}
          </ul>
          {soonest && holdExpiresSoon(soonest) ? (
            <p className="mt-3 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm font-medium">
              Resource hold expires in {formatHoldTimeRemaining(soonest)}
            </p>
          ) : soonest ? (
            <p className="mt-2 text-xs text-foreground/60">Hold expires: {formatHoldTimeRemaining(soonest)}</p>
          ) : null}
          {holdAffected ? (
            <p className="mt-3 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
              This change affects the current resource hold.
            </p>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
          {canRelease ? (
            <SecurityActionForm
              action={releaseInquiryHoldsAction}
              className="mt-3"
              notice={{ successTitle: "Holds released", errorTitle: "Unable to release holds" }}
              confirm={{
                title: "Release all holds for this inquiry?",
                description: "Held resources will become available on the Master Schedule immediately.",
                confirmLabel: "Release holds",
              }}
            >
              <input type="hidden" name="inquiryId" value={inquiryId} />
              <PendingSubmitButton pendingLabel="Releasing…" className="rounded-md border border-border px-4 py-2 text-sm font-medium">
                Release hold
              </PendingSubmitButton>
            </SecurityActionForm>
          ) : null}
          {canHold && holdAffected ? (
            <SecurityActionForm
              action={updateInquiryHoldAction}
              notice={{ successTitle: "Resource hold updated", errorTitle: "Unable to update resource hold" }}
              confirm={{
                title: "Update the resource hold?",
                description: "New holds are created first. The current hold stays if the replacement cannot complete.",
                confirmLabel: "Update resource hold",
              }}
            >
              <input type="hidden" name="inquiryId" value={inquiryId} />
              <PendingSubmitButton pendingLabel="Updating…" className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
                Update Resource Hold
              </PendingSubmitButton>
            </SecurityActionForm>
          ) : null}
          {canRelease ? (
            <SecurityActionForm
              action={extendInquiryHoldAction}
              notice={{ successTitle: "Hold extended", errorTitle: "Unable to extend hold" }}
            >
              <input type="hidden" name="inquiryId" value={inquiryId} />
              <PendingSubmitButton pendingLabel="Extending…" className="rounded-md border border-border px-4 py-2 text-sm font-medium">
                Extend Hold
              </PendingSubmitButton>
            </SecurityActionForm>
          ) : null}
          {canRelease ? (
            <SecurityActionForm
              action={expireInquiryHoldNowAction}
              notice={{ successTitle: "Hold expired", errorTitle: "Unable to expire hold" }}
              confirm={{
                title: "Expire this hold now?",
                description:
                  "This runs the same expiry path used after 24 hours. Resources become available immediately. A booked reservation cannot be expired.",
                confirmLabel: "Expire hold now",
                confirmPendingLabel: "Expiring…",
              }}
            >
              <input type="hidden" name="inquiryId" value={inquiryId} />
              <PendingSubmitButton pendingLabel="Expiring…" className="rounded-md border border-border px-4 py-2 text-sm font-medium">
                Expire hold now
              </PendingSubmitButton>
            </SecurityActionForm>
          ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
