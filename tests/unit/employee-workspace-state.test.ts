import { describe, expect, it } from "vitest";

import {
  classifyWorkspaceReservations,
  formatRequirementClockRange,
  formatReservationClockRange,
  groupAllocatedResources,
} from "@/lib/bookings/allocated-resources";
import {
  deriveEmployeeWorkspaceState,
  displayPlanTitle,
  EMPLOYEE_WORKSPACE_STATES,
} from "@/lib/inquiries/employee-workspace-state";
import { reservationCoversSlot } from "@/lib/resources/schedule-cells";
import { BOOKING_STATUSES } from "@/types/booking";
import { RESOURCE_RESERVATION_STATUSES } from "@/types/resource-schedule";

describe("employee workspace state", () => {
  it("derives pending, confirmed, cancelled, and legacy-hold states from persisted data", () => {
    expect(
      deriveEmployeeWorkspaceState({
        assignedUserProfileId: null,
        bookingStatus: BOOKING_STATUSES.PENDING_PAYMENT,
      }),
    ).toBe(EMPLOYEE_WORKSPACE_STATES.UNCLAIMED_PENDING_BOOKING);
    expect(
      deriveEmployeeWorkspaceState({
        assignedUserProfileId: "user_1",
        bookingStatus: BOOKING_STATUSES.PENDING_PAYMENT,
      }),
    ).toBe(EMPLOYEE_WORKSPACE_STATES.WORKING_PENDING_BOOKING);
    expect(
      deriveEmployeeWorkspaceState({
        assignedUserProfileId: "user_1",
        bookingStatus: BOOKING_STATUSES.PENDING_PAYMENT,
        paymentConflict: true,
      }),
    ).toBe(EMPLOYEE_WORKSPACE_STATES.PAYMENT_CONFLICT);
    expect(
      deriveEmployeeWorkspaceState({
        assignedUserProfileId: "user_1",
        bookingStatus: BOOKING_STATUSES.CONFIRMED,
        hasLegacyHold: true,
      }),
    ).toBe(EMPLOYEE_WORKSPACE_STATES.CONFIRMED_BOOKING);
    expect(
      deriveEmployeeWorkspaceState({
        assignedUserProfileId: "user_1",
        bookingStatus: BOOKING_STATUSES.CANCELLED,
      }),
    ).toBe(EMPLOYEE_WORKSPACE_STATES.CANCELLED_BOOKING);
    expect(
      deriveEmployeeWorkspaceState({
        assignedUserProfileId: "user_1",
        bookingStatus: null,
        hasLegacyHold: true,
      }),
    ).toBe(EMPLOYEE_WORKSPACE_STATES.LEGACY_HOLD);
  });

  it("does not classify BOOKED allocation rows as legacy holds", () => {
    const classified = classifyWorkspaceReservations([
      {
        id: "r1",
        status: RESOURCE_RESERVATION_STATUSES.BOOKED,
        releasedAt: null,
        startMinute: 18 * 60 + 30,
        endMinute: 19 * 60 + 30,
        resource: { name: "Axe Throwing Lane 1", resourceType: { name: "Axe Throwing Lane" } },
      },
    ]);
    expect(classified.legacyHolds).toHaveLength(0);
    expect(classified.allocated).toHaveLength(1);
  });

  it("formats requirement and reservation windows in 12-hour time", () => {
    expect(formatRequirementClockRange("18:30", "19:30")).toBe("6:30 PM–7:30 PM");
    expect(formatRequirementClockRange("19:30", "20:30")).toBe("7:30 PM–8:30 PM");
    expect(formatReservationClockRange(18 * 60 + 30, 19 * 60 + 30)).toBe("6:30 PM–7:30 PM");
  });

  it("groups allocated names and inventory totals", () => {
    const groups = groupAllocatedResources(
      [
        {
          id: "a1",
          status: RESOURCE_RESERVATION_STATUSES.BOOKED,
          startMinute: 18 * 60 + 30,
          endMinute: 19 * 60 + 30,
          resource: { name: "Axe Throwing Lane 1", resourceType: { name: "Axe Throwing Lane", slug: "axe-throwing-lane" } },
        },
        {
          id: "a2",
          status: RESOURCE_RESERVATION_STATUSES.BOOKED,
          startMinute: 18 * 60 + 30,
          endMinute: 19 * 60 + 30,
          resource: { name: "Axe Throwing Lane 2", resourceType: { name: "Axe Throwing Lane", slug: "axe-throwing-lane" } },
        },
        {
          id: "a3",
          status: RESOURCE_RESERVATION_STATUSES.BOOKED,
          startMinute: 18 * 60 + 30,
          endMinute: 19 * 60 + 30,
          resource: { name: "Axe Throwing Lane 3", resourceType: { name: "Axe Throwing Lane", slug: "axe-throwing-lane" } },
        },
      ],
      [{ resourceTypeName: "Axe Throwing Lane", resourceTypeSlug: "axe-throwing-lane", activeQuantity: 7 }],
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]?.allocatedQuantity).toBe(3);
    expect(groups[0]?.activeQuantity).toBe(7);
    expect(groups[0]?.names).toEqual([
      "Axe Throwing Lane 1",
      "Axe Throwing Lane 2",
      "Axe Throwing Lane 3",
    ]);
  });

  it("strips stored working titles for display", () => {
    expect(displayPlanTitle("Recommended (working)")).toBe("Recommended");
  });
});

describe("schedule cells", () => {
  it("covers two 30-minute cells for a 60-minute reservation and leaves the end cell free", () => {
    const window = { startMinute: 18 * 60 + 30, endMinute: 19 * 60 + 30 };
    expect(reservationCoversSlot({ ...window, slotStart: 18 * 60 + 30, slotMinutes: 30 })).toBe(true);
    expect(reservationCoversSlot({ ...window, slotStart: 19 * 60, slotMinutes: 30 })).toBe(true);
    expect(reservationCoversSlot({ ...window, slotStart: 19 * 60 + 30, slotMinutes: 30 })).toBe(false);
  });
});
