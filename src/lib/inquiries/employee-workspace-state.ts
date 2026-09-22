import { BOOKING_STATUSES } from "@/types/booking";
import { RESOURCE_RESERVATION_STATUSES } from "@/types/resource-schedule";

export const EMPLOYEE_WORKSPACE_STATES = {
  UNCLAIMED_PENDING_BOOKING: "UNCLAIMED_PENDING_BOOKING",
  WORKING_PENDING_BOOKING: "WORKING_PENDING_BOOKING",
  PAYMENT_CONFLICT: "PAYMENT_CONFLICT",
  CONFIRMED_BOOKING: "CONFIRMED_BOOKING",
  CANCELLED_BOOKING: "CANCELLED_BOOKING",
  LEGACY_HOLD: "LEGACY_HOLD",
} as const;

export type EmployeeWorkspaceState =
  (typeof EMPLOYEE_WORKSPACE_STATES)[keyof typeof EMPLOYEE_WORKSPACE_STATES];

export type WorkspaceReservation = {
  status?: string | null;
  releasedAt?: Date | null;
};

export function isLegacyHoldReservation(row: WorkspaceReservation): boolean {
  return row.status === RESOURCE_RESERVATION_STATUSES.HOLD && !row.releasedAt;
}

export function isAllocatedBookingReservation(row: WorkspaceReservation): boolean {
  return row.status === RESOURCE_RESERVATION_STATUSES.BOOKED && !row.releasedAt;
}

export function isReleasedBookingReservation(row: WorkspaceReservation): boolean {
  return row.status === RESOURCE_RESERVATION_STATUSES.BOOKED && Boolean(row.releasedAt);
}

export function deriveEmployeeWorkspaceState(input: {
  assignedUserProfileId: string | null;
  bookingStatus: string | null | undefined;
  paymentConflict?: boolean;
  hasLegacyHold?: boolean;
}): EmployeeWorkspaceState {
  if (input.bookingStatus === BOOKING_STATUSES.CANCELLED) {
    return EMPLOYEE_WORKSPACE_STATES.CANCELLED_BOOKING;
  }
  if (input.bookingStatus === BOOKING_STATUSES.CONFIRMED) {
    return EMPLOYEE_WORKSPACE_STATES.CONFIRMED_BOOKING;
  }
  if (input.paymentConflict) {
    return EMPLOYEE_WORKSPACE_STATES.PAYMENT_CONFLICT;
  }
  if (!input.bookingStatus && input.hasLegacyHold) {
    return EMPLOYEE_WORKSPACE_STATES.LEGACY_HOLD;
  }
  if (input.assignedUserProfileId) {
    return EMPLOYEE_WORKSPACE_STATES.WORKING_PENDING_BOOKING;
  }
  return EMPLOYEE_WORKSPACE_STATES.UNCLAIMED_PENDING_BOOKING;
}

export function displayPlanTitle(title: string): string {
  return title.replace(/\s+\(working\)$/i, "").trim();
}
