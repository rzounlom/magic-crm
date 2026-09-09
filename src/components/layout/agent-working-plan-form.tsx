import { SecurityActionForm } from "@/components/layout/security-action-form";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import { formatEventDuration } from "@/lib/event-planner/labels";
import { formatMoneyFromCents, perPersonCents } from "@/lib/event-planner/money";
import { readEventPlanPayload } from "@/lib/event-planner/payload";
import { summarizePlanChanges } from "@/lib/inquiries/plan-diff";
import { saveAgentWorkingPlanAction, suggestAlternativesAction } from "@/server/actions/live-agent";
import { SALES_KNOWLEDGE_TYPES } from "@/types/inquiry";

export function AgentWorkingPlanForm({
  inquiryId,
  expectedUpdatedAt,
  selectedPayload,
  working,
  knowledge,
  currency,
  guestMix,
}: {
  inquiryId: string;
  expectedUpdatedAt: string;
  selectedPayload: unknown;
  working: {
    estimatedTotalCents: number | null;
    currency: string;
    durationMinutes: number | null;
    payload: unknown;
  };
  knowledge: Array<{ id: string; name: string; type: string; maxGuests: number | null }>;
  currency: string;
  guestMix: string | null;
}) {
  const payload = readEventPlanPayload(working.payload);
  const selected = readEventPlanPayload(selectedPayload);
  const changes = summarizePlanChanges(selected, payload, working.currency || currency);
  const attractions = knowledge.filter((item) => item.type === SALES_KNOWLEDGE_TYPES.ATTRACTION);
  const diningItems = knowledge.filter((item) => item.type === SALES_KNOWLEDGE_TYPES.FOOD_BEVERAGE);
  const spaces = knowledge.filter(
    (item) => item.type === SALES_KNOWLEDGE_TYPES.ADD_ON || item.type === SALES_KNOWLEDGE_TYPES.PACKAGE,
  );
  const selectedActivityIds = new Set(payload.activities.map((row) => row.knowledgeItemId));
  const total = working.estimatedTotalCents ?? 0;
  const perPerson = payload.guestCount ? perPersonCents(total, payload.guestCount) : null;
  const rotations = payload.rotations ?? [];

  return (
    <section className="rounded-md border border-border px-5 py-5">
      <h2 className="text-lg font-semibold">Current Agent Version</h2>
      <p className="mt-1 text-sm text-foreground/70">
        Separate from the customer&apos;s original selection. Saving recalculates price from sales knowledge and
        rechecks the Master Schedule.
      </p>
      <p className="mt-3 text-2xl font-semibold">
        {total > 0 ? formatMoneyFromCents(total, working.currency || currency) : "Pricing to confirm"}
      </p>
      {perPerson != null && total > 0 ? (
        <p className="text-xs text-foreground/60">{formatMoneyFromCents(perPerson, working.currency || currency)} per person</p>
      ) : null}
      {changes.length > 0 ? (
        <div className="mt-4 rounded-md bg-muted/60 px-3 py-3 text-sm">
          <p className="font-medium">Changes from customer selection</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {changes.map((change) => (
              <li key={`${change.label}-${change.detail}`}>
                {change.label}: {change.detail}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="mt-3 text-sm text-foreground/60">Matches the customer-selected plan until you edit it.</p>
      )}

      <SecurityActionForm
        action={saveAgentWorkingPlanAction}
        className="mt-5 space-y-4"
        notice={{ successTitle: "Working version saved", errorTitle: "Unable to save working version" }}
      >
        <input type="hidden" name="inquiryId" value={inquiryId} />
        <input type="hidden" name="expectedUpdatedAt" value={expectedUpdatedAt} />
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="text-foreground/70">Event date</span>
            <input
              type="date"
              name="eventDate"
              required
              defaultValue={payload.eventDate ?? ""}
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            <span className="text-foreground/70">Start time</span>
            <input
              type="time"
              name="startTime"
              required
              defaultValue={payload.startTime ?? ""}
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            <span className="text-foreground/70">Duration (minutes)</span>
            <input
              type="number"
              name="durationMinutes"
              min={30}
              step={15}
              required
              defaultValue={payload.durationMinutes || working.durationMinutes || 180}
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            <span className="text-foreground/70">Guest count</span>
            <input
              type="number"
              name="guestCount"
              min={1}
              max={500}
              required
              defaultValue={payload.guestCount}
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"
            />
          </label>
        </div>
        {guestMix ? <p className="text-xs text-foreground/55">Guest mix stays {guestMix.replaceAll("_", " ")}.</p> : null}

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Activities</legend>
          {attractions.map((item) => {
            const current = payload.activities.find((row) => row.knowledgeItemId === item.id);
            return (
              <label key={item.id} className="flex flex-wrap items-center gap-3 text-sm">
                <input type="checkbox" name="activityIds" value={item.id} defaultChecked={selectedActivityIds.has(item.id)} />
                <span className="flex-1">{item.name}</span>
                <input
                  type="number"
                  name={`quantity_${item.id}`}
                  min={1}
                  defaultValue={current?.quantity ?? 1}
                  className="w-20 rounded-md border border-border bg-background px-2 py-1"
                />
              </label>
            );
          })}
        </fieldset>

        <label className="block text-sm">
          <span className="text-foreground/70">Dining</span>
          <select
            name="diningKnowledgeItemId"
            defaultValue={payload.dining.knowledgeItemId ?? ""}
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"
          >
            <option value="">Keep current ({payload.dining.label})</option>
            {diningItems.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm">
          <span className="text-foreground/70">Room / space</span>
          <select
            name="spaceKnowledgeItemId"
            defaultValue={payload.spaces[0]?.knowledgeItemId ?? ""}
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"
          >
            <option value="">None / to confirm</option>
            {spaces.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
                {item.maxGuests ? ` (max ${item.maxGuests})` : ""}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm">
          <span className="text-foreground/70">Proposed schedule</span>
          <textarea
            name="schedule"
            rows={4}
            defaultValue={payload.schedule.join("\n")}
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"
          />
        </label>

        <div>
          <p className="text-sm font-medium">Rotations</p>
          <p className="mt-1 text-xs text-foreground/60">
            Optional. One assignment per line, like <code>Group A: Bowling</code>. Availability uses each segment&apos;s
            window.
          </p>
          {[0, 1, 2].map((index) => {
            const rotation = rotations[index];
            return (
              <div key={index} className="mt-3 grid gap-2 rounded-md border border-border px-3 py-3 sm:grid-cols-2">
                <label className="text-sm">
                  <span className="text-foreground/70">Start</span>
                  <input
                    type="time"
                    name={`rotationStart_${index}`}
                    defaultValue={rotation?.startTime ?? ""}
                    className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5"
                  />
                </label>
                <label className="text-sm">
                  <span className="text-foreground/70">End</span>
                  <input
                    type="time"
                    name={`rotationEnd_${index}`}
                    defaultValue={rotation?.endTime ?? ""}
                    className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5"
                  />
                </label>
                <label className="text-sm sm:col-span-2">
                  <span className="text-foreground/70">Assignments</span>
                  <textarea
                    name={`rotationAssignments_${index}`}
                    rows={3}
                    defaultValue={(rotation?.assignments ?? [])
                      .map((row) => `${row.groupLabel}: ${row.activityName}`)
                      .join("\n")}
                    className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5"
                  />
                </label>
              </div>
            );
          })}
        </div>

        <p className="text-xs text-foreground/55">Current duration {formatEventDuration(payload.durationMinutes)}.</p>
        <PendingSubmitButton
          pendingLabel="Saving…"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Save working version
        </PendingSubmitButton>
      </SecurityActionForm>

      <SecurityActionForm
        action={suggestAlternativesAction}
        className="mt-4"
        notice={{ successTitle: "Closest available times", errorTitle: "No nearby times found" }}
      >
        <input type="hidden" name="inquiryId" value={inquiryId} />
        <PendingSubmitButton pendingLabel="Checking…" className="rounded-md border border-border px-4 py-2 text-sm font-medium">
          Suggest closest available alternative
        </PendingSubmitButton>
      </SecurityActionForm>
    </section>
  );
}
