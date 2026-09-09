import { localEventWindow, minutesToClock, parseClockToMinutes } from "@/server/resources/time-window";
import type { EventPlanPayload } from "@/types/event-planner";
import type { PlanResourceRequirement } from "@/types/resource-schedule";
import { RESOURCE_RESERVATION_STATUSES } from "@/types/resource-schedule";

export type CoverageHold = {
  id: string;
  status: string;
  expiresAt: Date | null;
  releasedAt: Date | null;
  startMinute: number;
  endMinute: number;
  resource: { resourceType: { id: string; name: string } };
};

export function activeUnexpiredHolds(holds: CoverageHold[], now = new Date()): CoverageHold[] {
  return holds.filter(
    (row) =>
      row.status === RESOURCE_RESERVATION_STATUSES.HOLD &&
      !row.releasedAt &&
      (!row.expiresAt || row.expiresAt.getTime() > now.getTime()),
  );
}

export function holdCoverageErrors(
  payload: EventPlanPayload,
  requirements: PlanResourceRequirement[],
  holds: CoverageHold[],
  now = new Date(),
): string[] {
  const window = localEventWindow({
    date: payload.eventDate,
    startTime: payload.startTime,
    durationMinutes: payload.durationMinutes,
  });
  if (!window) {
    return ["A date and start time are required before confirming a booking."];
  }
  const finite = requirements.filter((row) => row.quantity != null && row.quantity > 0);
  if (finite.length === 0) {
    return [];
  }
  const active = activeUnexpiredHolds(holds, now);
  const used = new Set<string>();
  const errors: string[] = [];
  for (const requirement of finite) {
    if (!requirement.resourceTypeId) {
      errors.push(`${requirement.resourceTypeName} still needs resource configuration before booking.`);
      continue;
    }
    const requiredWindow = requirementWindow(requirement, window);
    const matching = active.filter(
      (hold) =>
        !used.has(hold.id) &&
        hold.resource.resourceType.id === requirement.resourceTypeId &&
        hold.startMinute === requiredWindow.startMinute &&
        hold.endMinute === requiredWindow.endMinute,
    );
    if (matching.length < (requirement.quantity ?? 0)) {
      errors.push(
        `${requirement.resourceTypeName} requires ${requirement.quantity} held unit(s) from ${minutesToClock(requiredWindow.startMinute)}–${minutesToClock(requiredWindow.endMinute)}; ${matching.length} currently held.`,
      );
      continue;
    }
    for (const hold of matching.slice(0, requirement.quantity ?? 0)) {
      used.add(hold.id);
    }
  }
  return errors;
}

function requirementWindow(
  requirement: PlanResourceRequirement,
  fallback: { slotDate: string; startMinute: number; endMinute: number },
) {
  if (!requirement.windowStartTime || !requirement.windowEndTime) {
    return fallback;
  }
  const startMinute = parseClockToMinutes(requirement.windowStartTime);
  const endMinute = parseClockToMinutes(requirement.windowEndTime);
  if (startMinute == null || endMinute == null || endMinute <= startMinute) {
    return fallback;
  }
  return { slotDate: fallback.slotDate, startMinute, endMinute };
}
