import { formatMoneyFromCents } from "@/lib/event-planner/money";
import type { EventPlanPayload } from "@/types/event-planner";

export type PlanChange = {
  label: string;
  detail: string;
};

export function summarizePlanChanges(
  selected: EventPlanPayload,
  working: EventPlanPayload,
  currency = "USD",
): PlanChange[] {
  const changes: PlanChange[] = [];
  if (selected.guestCount !== working.guestCount) {
    const delta = working.guestCount - selected.guestCount;
    changes.push({
      label: "Guest count",
      detail: `${delta > 0 ? "+" : ""}${delta}`,
    });
  }
  if (selected.durationMinutes !== working.durationMinutes) {
    const delta = working.durationMinutes - selected.durationMinutes;
    changes.push({
      label: "Duration",
      detail: `${delta > 0 ? "+" : ""}${delta} minutes`,
    });
  }
  if ((selected.eventDate ?? "") !== (working.eventDate ?? "")) {
    changes.push({ label: "Date", detail: `${selected.eventDate ?? "—"} → ${working.eventDate ?? "—"}` });
  }
  if ((selected.startTime ?? "") !== (working.startTime ?? "")) {
    changes.push({ label: "Start time", detail: `${selected.startTime ?? "—"} → ${working.startTime ?? "—"}` });
  }
  const selectedActivities = new Set(selected.activities.map((row) => row.name));
  const workingActivities = new Set(working.activities.map((row) => row.name));
  for (const name of workingActivities) {
    if (!selectedActivities.has(name)) {
      changes.push({ label: "Activity added", detail: name });
    }
  }
  for (const name of selectedActivities) {
    if (!workingActivities.has(name)) {
      changes.push({ label: "Activity removed", detail: name });
    }
  }
  if (selected.dining.label !== working.dining.label) {
    changes.push({ label: "Dining", detail: `${selected.dining.label} → ${working.dining.label}` });
  }
  const selectedSpaces = selected.spaces.map((row) => row.name).join(", ") || "None";
  const workingSpaces = working.spaces.map((row) => row.name).join(", ") || "None";
  if (selectedSpaces !== workingSpaces) {
    changes.push({ label: "Space", detail: `${selectedSpaces} → ${workingSpaces}` });
  }
  const selectedTotal = planPayloadTotal(selected);
  const workingTotal = planPayloadTotal(working);
  if (selectedTotal !== workingTotal) {
    const delta = workingTotal - selectedTotal;
    changes.push({
      label: "Estimate",
      detail: `${delta > 0 ? "+" : "−"}${formatMoneyFromCents(Math.abs(delta), currency)}`,
    });
  }
  return changes;
}

export function planPayloadTotal(payload: EventPlanPayload): number {
  return (
    payload.activities.reduce((sum, row) => sum + (row.priceCents || 0), 0) +
    (payload.dining.priceCents || 0) +
    payload.spaces.reduce((sum, row) => sum + (row.priceCents || 0), 0)
  );
}

export function workingPlanAffectsHold(selected: EventPlanPayload, working: EventPlanPayload): boolean {
  if (
    selected.eventDate !== working.eventDate ||
    selected.startTime !== working.startTime ||
    selected.durationMinutes !== working.durationMinutes
  ) {
    return true;
  }
  const selectedKeys = (selected.resourceRequirements ?? []).map(requirementKey).sort().join("|");
  const workingKeys = (working.resourceRequirements ?? []).map(requirementKey).sort().join("|");
  return selectedKeys !== workingKeys;
}

export function workingPlanAffectsExistingHolds(
  working: EventPlanPayload,
  holds: Array<{ startMinute: number; endMinute: number }>,
): boolean {
  if (holds.length === 0) {
    return false;
  }
  const requiredQty = (working.resourceRequirements ?? []).reduce((sum, row) => sum + (row.quantity ?? 0), 0);
  if (requiredQty > 0 && requiredQty !== holds.length) {
    return true;
  }
  const requirementWindows = [
    ...new Set(
      (working.resourceRequirements ?? [])
        .map((row) => {
          if (!row.windowStartTime || !row.windowEndTime) {
            return null;
          }
          const start = clockToMinutes(row.windowStartTime);
          const end = clockToMinutes(row.windowEndTime);
          if (start == null || end == null) {
            return null;
          }
          return `${start}-${end}`;
        })
        .filter((value): value is string => Boolean(value)),
    ),
  ].sort();
  const holdWindows = [...new Set(holds.map((row) => `${row.startMinute}-${row.endMinute}`))].sort();
  if (requirementWindows.length > 0) {
    return requirementWindows.join("|") !== holdWindows.join("|");
  }
  const start = clockToMinutes(working.startTime);
  if (start == null || !working.durationMinutes) {
    return false;
  }
  return holdWindows.join("|") !== `${start}-${start + working.durationMinutes}`;
}

function clockToMinutes(value: string | null | undefined): number | null {
  const match = /^(\d{1,2}):(\d{2})/.exec(value?.trim() ?? "");
  if (!match) {
    return null;
  }
  return Number(match[1]) * 60 + Number(match[2]);
}

function requirementKey(requirement: {
  resourceTypeSlug: string;
  quantity: number | null;
  windowStartTime?: string | null;
  windowEndTime?: string | null;
}): string {
  return [
    requirement.resourceTypeSlug,
    requirement.quantity ?? "x",
    requirement.windowStartTime ?? "",
    requirement.windowEndTime ?? "",
  ].join(":");
}
