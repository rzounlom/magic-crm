import { formatEventLocalTime } from "@/lib/inquiries/tenant-datetime";
import { SCHEDULE_SLOT_MINUTES } from "@/types/resource-schedule";

export const SCHEDULE_FOCUS_ALL = "all";
export const SCHEDULE_FOCUS_HOLDS = "holds";
export const SCHEDULE_FOCUS_BOOKED = "booked";

/** Hint for the existing event builder. It does not reserve a resource. */
export function eventBuilderPath(input: {
  date: string;
  startTime?: string | null;
  locationId?: string | null;
  resourceTypeId?: string | null;
  resourceId?: string | null;
  resourceName?: string | null;
}): string {
  const params = new URLSearchParams();
  params.set("date", input.date);
  if (input.startTime) {
    params.set("start", input.startTime);
  }
  if (input.locationId) {
    params.set("locationId", input.locationId);
  }
  if (input.resourceTypeId) {
    params.set("resourceTypeId", input.resourceTypeId);
  }
  if (input.resourceId) {
    params.set("resourceId", input.resourceId);
  }
  if (input.resourceName) {
    params.set("resourceName", input.resourceName);
  }
  return `/app/bookings/new?${params.toString()}`;
}

export function blockPlacement(input: {
  startMinute: number;
  endMinute: number;
  dayStart: number;
  dayEnd: number;
  slotMinutes?: number;
  slotWidth: number;
}): { left: number; width: number } | null {
  const slotMinutes = input.slotMinutes ?? SCHEDULE_SLOT_MINUTES;
  const start = Math.max(input.startMinute, input.dayStart);
  const end = Math.min(input.endMinute, input.dayEnd);
  if (end <= start || slotMinutes <= 0) {
    return null;
  }
  return {
    left: ((start - input.dayStart) / slotMinutes) * input.slotWidth,
    width: ((end - start) / slotMinutes) * input.slotWidth,
  };
}

export function scheduleDisplayName(record: {
  customerGroupName: string | null;
  customerFirstName: string | null;
  customerLastName: string | null;
} | null): string {
  if (!record) {
    return "Held";
  }
  if (record.customerGroupName?.trim()) {
    return record.customerGroupName.trim();
  }
  const name = [record.customerFirstName, record.customerLastName].filter(Boolean).join(" ").trim();
  return name || "Inquiry";
}

/** Resources with at least one reservation on the selected day, not occupancy at one time. */
export function occupancySummary(resourceTypeName: string, occupied: number, total: number): string {
  return `${resourceTypeName}: ${occupied} of ${total} have bookings today`;
}

export function scheduleStartHint(resourceName: string, startTime?: string | null): string {
  const clock = startTime ? formatEventLocalTime(startTime) : null;
  const when = clock ? ` at ${clock}` : "";
  return `Starting from ${resourceName}${when}. This does not reserve that resource. Availability is checked when the plan is generated.`;
}

export function readBookingBuilderSearchHint(search: {
  date?: string;
  start?: string;
  locationId?: string;
  resourceName?: string;
}): {
  date?: string;
  startTime?: string;
  locationId?: string;
  resourceName?: string;
} {
  return {
    date: /^\d{4}-\d{2}-\d{2}$/.test(search.date ?? "") ? search.date : undefined,
    startTime: /^\d{2}:\d{2}$/.test(search.start ?? "") ? search.start : undefined,
    locationId: search.locationId,
    resourceName: search.resourceName?.slice(0, 120),
  };
}

/** Schedule URL that keeps the employee on the board after create, save, or confirm. */
export function schedulePath(input: { date: string; focus?: string | null; builder?: string | null }): string {
  const params = new URLSearchParams({ date: input.date });
  if (input.focus && input.focus !== SCHEDULE_FOCUS_ALL) {
    params.set("focus", input.focus);
  }
  if (input.builder) {
    params.set("builder", input.builder);
  }
  return `/app/schedule?${params.toString()}`;
}

export function inquiryIdFromBuilderRedirect(href: string): string | null {
  const match = href.match(/\/app\/inquiries\/([^/?#]+)/);
  return match?.[1] ?? null;
}

export function bookingCompletionCopy(kind: "pending" | "confirmed"): string {
  if (kind === "pending") {
    return "Pending booking saved. It appears with pending bookings for this day and does not occupy resources.";
  }
  return "Booking confirmed. The schedule shows the allocated resources. You are still on Master Schedule.";
}

export function occupancyCount(resourceIds: string[], reservedResourceIds: Iterable<string>): { occupied: number; total: number } {
  const reserved = new Set(reservedResourceIds);
  return {
    occupied: resourceIds.filter((id) => reserved.has(id)).length,
    total: resourceIds.length,
  };
}
