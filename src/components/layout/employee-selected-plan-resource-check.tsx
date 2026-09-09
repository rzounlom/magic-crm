import { SecurityActionForm } from "@/components/layout/security-action-form";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import { formatEventLocalTime, formatOrganizationTimestamp } from "@/lib/inquiries/tenant-datetime";
import { minutesToClock } from "@/server/resources/time-window";
import { placeInquiryHoldAction, releaseInquiryHoldsAction } from "@/server/actions/resource-schedule";
import { PLAN_AVAILABILITY_STATUS_LABELS, PLAN_AVAILABILITY_STATUSES } from "@/types/resource-schedule";
import type { PlanAvailabilityStatus, ResourceAvailabilityResult, PlanResourceRequirement } from "@/types/resource-schedule";

function groupHeldResources(
  holds: Array<{
    id: string;
    startMinute: number;
    endMinute: number;
    expiresAt: Date | null;
    resource: { name: string; resourceType: { name: string } };
  }>,
) {
  const groups = new Map<
    string,
    { key: string; names: string[]; startMinute: number; endMinute: number; expiresAt: Date | null }
  >();
  for (const hold of holds) {
    const key = `${hold.resource.resourceType.name}:${hold.startMinute}:${hold.endMinute}`;
    const existing = groups.get(key);
    if (existing) {
      existing.names.push(hold.resource.name);
      continue;
    }
    groups.set(key, {
      key,
      names: [hold.resource.name],
      startMinute: hold.startMinute,
      endMinute: hold.endMinute,
      expiresAt: hold.expiresAt,
    });
  }
  return [...groups.values()];
}

export function EmployeeSelectedPlanResourceCheck({
  inquiryId,
  availabilityStatus,
  live,
  holds,
  canHold,
  canRelease,
  timeZone,
}: {
  inquiryId: string;
  availabilityStatus: string;
  live: { requirements: PlanResourceRequirement[]; result: ResourceAvailabilityResult };
  holds: Array<{
    id: string;
    startMinute: number;
    endMinute: number;
    expiresAt: Date | null;
    resource: { name: string; resourceType: { name: string } };
  }>;
  canHold: boolean;
  canRelease: boolean;
  timeZone: string;
}) {
  const status = (availabilityStatus in PLAN_AVAILABILITY_STATUS_LABELS
    ? availabilityStatus
    : PLAN_AVAILABILITY_STATUSES.NOT_VALIDATED) as PlanAvailabilityStatus;
  const bySlug = new Map(live.result.types.map((row) => [row.resourceTypeSlug, row]));
  const allAvailable =
    live.result.validated && live.result.available && live.requirements.every((row) => row.quantity != null);

  return (
    <section className="mt-8 rounded-md border border-border px-5 py-5">
      <h2 className="text-lg font-semibold">Selected Plan — Resource Check</h2>
      <p className="mt-1 text-sm text-foreground/70">
        Status: {PLAN_AVAILABILITY_STATUS_LABELS[status]}. Inquiry status is unchanged. This is not a booking.
      </p>
      {live.requirements.length === 0 ? (
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
            return (
              <li key={`${requirement.knowledgeItemId}-${requirement.resourceTypeSlug}`}>
                <p className="font-medium">{requirement.resourceTypeName}</p>
                <p className="text-foreground/70">
                  Required: {required ?? "Unknown"}
                  {available != null ? ` · Currently available: ${available}` : ""}
                  {` · Status: ${label}`}
                </p>
                {requirement.rotationNote ? (
                  <p className="mt-1 text-foreground/60">{requirement.rotationNote}</p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      {holds.length > 0 ? (
        <div className="mt-6 border-t border-border pt-4">
          <h3 className="text-sm font-medium">Resources held</h3>
          <ul className="mt-2 space-y-2 text-sm text-foreground/80">
            {groupHeldResources(holds).map((group) => (
              <li key={group.key}>
                <p className="font-medium">{group.names.join(", ")}</p>
                <p>
                  {formatEventLocalTime(minutesToClock(group.startMinute))}–
                  {formatEventLocalTime(minutesToClock(group.endMinute))}
                  {group.expiresAt ? ` · Hold expires ${formatOrganizationTimestamp(group.expiresAt, timeZone)}` : ""}
                </p>
              </li>
            ))}
          </ul>
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
        </div>
      ) : canHold && allAvailable ? (
        <SecurityActionForm
          action={placeInquiryHoldAction}
          className="mt-6"
          notice={{ successTitle: "Resources held", errorTitle: "Unable to place resource hold" }}
          confirm={{
            title: "Place a temporary resource hold?",
            description: "This holds the required resources for this inquiry. It does not confirm a booking.",
            confirmLabel: "Place resource hold",
          }}
        >
          <input type="hidden" name="inquiryId" value={inquiryId} />
          <PendingSubmitButton
            pendingLabel="Holding…"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Place Resource Hold
          </PendingSubmitButton>
        </SecurityActionForm>
      ) : null}
    </section>
  );
}
