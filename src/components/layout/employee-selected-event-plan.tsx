import { formatEventDuration } from "@/lib/event-planner/labels";
import { formatMoneyFromCents, perPersonCents } from "@/lib/event-planner/money";
import { readEventPlanPayload } from "@/lib/event-planner/payload";
import { CUSTOMER_SELECTED_PLAN_BANNER } from "@/lib/inquiries/ready-for-human-reason";
import { formatEventLocalDateTime, formatOrganizationTimestamp } from "@/lib/inquiries/tenant-datetime";
import { EVENT_PLAN_TIER_TITLES, type EventPlanTier } from "@/types/event-planner";
import { PLAN_AVAILABILITY_STATUS_LABELS, PLAN_AVAILABILITY_STATUSES } from "@/types/resource-schedule";

type PlanRecord = {
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

export function EmployeeSelectedEventPlan({
  plan,
  desiredDate,
  desiredStartTime,
  selectedAt,
  timeZone,
}: {
  plan: PlanRecord;
  desiredDate: Date | null;
  desiredStartTime: string | null;
  selectedAt?: Date | null;
  timeZone?: string;
}) {
  const payload = readEventPlanPayload(plan.payload);
  const total = plan.estimatedTotalCents ?? 0;
  const perPerson = payload.guestCount ? perPersonCents(total, payload.guestCount) : null;
  const tierTitle =
    plan.tier in EVENT_PLAN_TIER_TITLES
      ? EVENT_PLAN_TIER_TITLES[plan.tier as EventPlanTier]
      : plan.title;

  return (
    <section className="mt-8 rounded-md border border-primary/40 bg-primary/5 px-5 py-5">
      <p className="text-xs font-semibold tracking-[0.18em] text-primary uppercase">
        {CUSTOMER_SELECTED_PLAN_BANNER}
      </p>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold">{plan.title}</h2>
          <p className="mt-1 text-sm text-foreground/70">{tierTitle}</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-semibold">
            {total > 0 ? formatMoneyFromCents(total, plan.currency) : "Pricing to confirm"}
          </p>
          {perPerson != null && total > 0 ? (
            <p className="mt-1 text-xs text-foreground/60">
              {formatMoneyFromCents(perPerson, plan.currency)} per person
            </p>
          ) : null}
        </div>
      </div>
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-foreground/60">Requested date / time</dt>
          <dd className="mt-1">
            {formatEventLocalDateTime({ date: desiredDate, time: desiredStartTime })}
          </dd>
        </div>
        <div>
          <dt className="text-foreground/60">Guests</dt>
          <dd className="mt-1">{payload.guestCount || "—"}</dd>
        </div>
        <div>
          <dt className="text-foreground/60">Plan activities</dt>
          <dd className="mt-1">
            {payload.activities.length > 0
              ? payload.activities
                  .map((activity) =>
                    activity.quantity > 1 && activity.unitLabel
                      ? `${activity.name} (${activity.quantity} ${activity.unitLabel}s)`
                      : activity.name,
                  )
                  .join(", ")
              : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-foreground/60">Plan dining</dt>
          <dd className="mt-1">{payload.dining.label}</dd>
        </div>
        <div>
          <dt className="text-foreground/60">Room / space</dt>
          <dd className="mt-1">
            {payload.spaces.length > 0 ? payload.spaces.map((space) => space.name).join(", ") : "None specified"}
          </dd>
        </div>
        <div>
          <dt className="text-foreground/60">Event length</dt>
          <dd className="mt-1">{formatEventDuration(plan.durationMinutes ?? payload.durationMinutes)}</dd>
        </div>
        <div>
          <dt className="text-foreground/60">Finite resources needed</dt>
          <dd className="mt-1">
            {payload.resourceRequirements && payload.resourceRequirements.length > 0
              ? payload.resourceRequirements
                  .map((row) => {
                    const qty = row.quantity != null ? `${row.quantity} ` : "";
                    const config = row.inventoryConfigured ? "" : " (inventory not configured)";
                    return `${qty}${row.resourceTypeName}${config}`;
                  })
                  .join("; ")
              : "None mapped yet — confirm on the Resource Schedule"}
          </dd>
        </div>
        <div>
          <dt className="text-foreground/60">Availability validated</dt>
          <dd className="mt-1">{plan.availabilityValidated ? "Yes" : "No — confirm before booking"}</dd>
        </div>
        <div>
          <dt className="text-foreground/60">Plan availability</dt>
          <dd className="mt-1">
            {plan.availabilityStatus && plan.availabilityStatus in PLAN_AVAILABILITY_STATUS_LABELS
              ? PLAN_AVAILABILITY_STATUS_LABELS[plan.availabilityStatus as keyof typeof PLAN_AVAILABILITY_STATUS_LABELS]
              : PLAN_AVAILABILITY_STATUS_LABELS[PLAN_AVAILABILITY_STATUSES.NOT_VALIDATED]}
          </dd>
        </div>
        <div>
          <dt className="text-foreground/60">Selection timestamp</dt>
          <dd className="mt-1">
            {selectedAt && timeZone ? formatOrganizationTimestamp(selectedAt, timeZone) : selectedAt ? selectedAt.toISOString() : "—"}
          </dd>
        </div>
      </dl>
      {payload.schedule.length > 0 ? (
        <div className="mt-4 text-sm">
          <p className="text-foreground/60">Proposed schedule</p>
          <ul className="mt-1 list-disc pl-5 text-foreground/80">
            {payload.schedule.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <p className="mt-4 text-sm text-foreground/70">{plan.customerFacingReason}</p>
      {plan.availabilityNote ? (
        <p className="mt-3 text-sm text-foreground/70">{plan.availabilityNote}</p>
      ) : null}
      <p className="mt-4 text-xs text-foreground/55">
        Selection is customer intent only. Inventory is not reserved. Confirm availability before a
        deposit or booking. Proposal, deposit, and booking tools are not available yet.
      </p>
    </section>
  );
}
