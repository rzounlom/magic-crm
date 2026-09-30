import { formatActivityLine } from "@/lib/event-planner/activity-display";
import { formatEventDuration } from "@/lib/event-planner/labels";
import { formatMoneyFromCents, perPersonCents } from "@/lib/event-planner/money";
import { readEventPlanPayload } from "@/lib/event-planner/payload";
import { displayPlanTitle } from "@/lib/inquiries/employee-workspace-state";
import { formatItineraryLine } from "@/lib/inquiries/tenant-datetime";
import { isSampleItinerarySegment } from "@/server/catalog/scheduling-behavior";

export function EmployeePlanSnapshot({
  title,
  planTitle,
  estimatedTotalCents,
  currency,
  durationMinutes,
  payload,
  comparisonNote,
}: {
  title: string;
  planTitle?: string | null;
  estimatedTotalCents: number | null;
  currency: string;
  durationMinutes?: number | null;
  payload: unknown;
  comparisonNote?: string | null;
}) {
  const plan = readEventPlanPayload(payload);
  const total = estimatedTotalCents ?? 0;
  const perPerson = plan.guestCount ? perPersonCents(total, plan.guestCount) : null;
  return (
    <section className="rounded-md border border-border px-5 py-5">
      <h2 className="text-lg font-semibold">{title}</h2>
      {planTitle ? <p className="mt-1 text-sm text-foreground/70">{displayPlanTitle(planTitle)}</p> : null}
      {comparisonNote ? <p className="mt-2 text-sm text-foreground/60">{comparisonNote}</p> : null}
      <p className="mt-3 text-2xl font-semibold">
        {total > 0 ? formatMoneyFromCents(total, currency) : "Pricing to confirm"}
      </p>
      {perPerson != null && total > 0 ? (
        <p className="text-xs text-foreground/60">{formatMoneyFromCents(perPerson, currency)} per person</p>
      ) : null}
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-foreground/60">Guests</dt>
          <dd className="mt-1">{plan.guestCount || "—"}</dd>
        </div>
        <div>
          <dt className="text-foreground/60">Event duration</dt>
          <dd className="mt-1">{formatEventDuration(durationMinutes ?? plan.durationMinutes)}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-foreground/60">Activities</dt>
          <dd className="mt-1">
            {plan.activities.length > 0
              ? plan.activities
                  .map((activity) =>
                    formatActivityLine(activity, {
                      guestCount: plan.guestCount,
                      itinerary: plan.itinerary,
                    }),
                  )
                  .join("; ")
              : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-foreground/60">Dining</dt>
          <dd className="mt-1">{plan.dining.label || "—"}</dd>
        </div>
        {plan.beverages && plan.beverages.length > 0 ? (
          <div>
            <dt className="text-foreground/60">Beverages</dt>
            <dd className="mt-1">{plan.beverages.map((item) => item.name).join(", ")}</dd>
          </div>
        ) : null}
        <div>
          <dt className="text-foreground/60">Room / space</dt>
          <dd className="mt-1">
            {plan.spaces.length > 0 ? plan.spaces.map((space) => space.name).join(", ") : "None specified"}
          </dd>
        </div>
      </dl>
      {plan.itinerary && plan.itinerary.length > 0 ? (
        <div className="mt-4 text-sm">
          <p className="text-foreground/60">Sample Itinerary</p>
          <ul className="mt-1 list-disc pl-5 text-foreground/80">
            {plan.itinerary.filter(isSampleItinerarySegment).map((segment) => (
              <li key={`${segment.startTime}-${segment.label}`}>
                {formatItineraryLine(`${segment.startTime}–${segment.endTime} ${segment.label}`)}
              </li>
            ))}
          </ul>
        </div>
      ) : plan.schedule.length > 0 ? (
        <div className="mt-4 text-sm">
          <p className="text-foreground/60">Sample Itinerary</p>
          <ul className="mt-1 list-disc pl-5 text-foreground/80">
            {plan.schedule.map((line) => (
              <li key={line}>{formatItineraryLine(line)}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
