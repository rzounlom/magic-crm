/** @vitest-environment jsdom */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { EmployeeSelectedPlanResourceCheck } from "@/components/layout/employee-selected-plan-resource-check";
import { PLAN_AVAILABILITY_STATUSES, RESOURCE_RESERVATION_STATUSES } from "@/types/resource-schedule";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  unstable_rethrow: (error: unknown) => {
    throw error;
  },
}));

vi.mock("@/server/actions/live-agent", () => ({
  checkInquiryAvailabilityAction: vi.fn(),
  applyWorkingPlanStartTimeAction: vi.fn(),
}));

vi.mock("@/server/actions/resource-schedule", () => ({
  expireInquiryHoldNowAction: vi.fn(),
  extendInquiryHoldAction: vi.fn(),
  releaseInquiryHoldsAction: vi.fn(),
  updateInquiryHoldAction: vi.fn(),
}));

const pendingLive = {
  requirements: [
    {
      knowledgeItemId: "axe",
      knowledgeItemName: "Axe Throwing",
      resourceTypeId: "type_axe",
      resourceTypeSlug: "axe-throwing-lane",
      resourceTypeName: "Axe Throwing Lane",
      quantityRule: "PER_GUESTS" as const,
      quantity: 3,
      guestsPerUnit: 8,
      durationMinutes: 60,
      inventoryConfigured: true,
      requiresStaffConfiguration: false,
      windowStartTime: "18:30",
      windowEndTime: "19:30",
    },
    {
      knowledgeItemId: "bowl",
      knowledgeItemName: "Bowling",
      resourceTypeId: "type_bowl",
      resourceTypeSlug: "bowling-lane",
      resourceTypeName: "Bowling Lane",
      quantityRule: "PER_GUESTS" as const,
      quantity: 4,
      guestsPerUnit: 5,
      durationMinutes: 60,
      inventoryConfigured: true,
      requiresStaffConfiguration: false,
      windowStartTime: "19:30",
      windowEndTime: "20:30",
    },
  ],
  result: {
    validated: true,
    available: true,
    note: "Available",
    types: [
      {
        resourceTypeSlug: "axe-throwing-lane",
        resourceTypeName: "Axe Throwing Lane",
        requestedQuantity: 3,
        availableQuantity: 7,
        inventoryConfigured: true,
        conflict: false,
        requiresStaffConfiguration: false,
      },
      {
        resourceTypeSlug: "bowling-lane",
        resourceTypeName: "Bowling Lane",
        requestedQuantity: 4,
        availableQuantity: 8,
        inventoryConfigured: true,
        conflict: false,
        requiresStaffConfiguration: false,
      },
    ],
  },
};

describe("employee rooms and lanes", () => {
  it("shows pending requirements in 12-hour time without labeling them booked", () => {
    const html = renderToStaticMarkup(
      <EmployeeSelectedPlanResourceCheck
        inquiryId="inq_1"
        availabilityStatus={PLAN_AVAILABILITY_STATUSES.AVAILABLE}
        live={pendingLive}
        holds={[]}
        canHold={false}
        canRelease={false}
        timeZone="America/Indiana/Indianapolis"
        canCheckAvailability
        mode="pending"
      />,
    );
    expect(html).toContain("3 required");
    expect(html).toContain("4 required");
    expect(html).toContain("6:30 PM–7:30 PM");
    expect(html).toContain("7:30 PM–8:30 PM");
    expect(html).toContain("7 currently available");
    expect(html).toContain("8 currently available");
    expect(html).toContain("Available. All required resources are currently free at the selected time.");
    expect(html).toContain("Check Availability");
    expect(html).not.toContain("Legacy hold");
    expect(html).not.toContain("18:30");
  });

  it("shows allocated resource names after confirmation instead of availability", () => {
    const html = renderToStaticMarkup(
      <EmployeeSelectedPlanResourceCheck
        inquiryId="inq_1"
        availabilityStatus={PLAN_AVAILABILITY_STATUSES.AVAILABLE}
        live={pendingLive}
        holds={[]}
        allocations={[
          {
            id: "r1",
            status: RESOURCE_RESERVATION_STATUSES.BOOKED,
            startMinute: 18 * 60 + 30,
            endMinute: 19 * 60 + 30,
            resource: {
              name: "Axe Throwing Lane 1",
              resourceType: { name: "Axe Throwing Lane", slug: "axe-throwing-lane" },
            },
          },
          {
            id: "r2",
            status: RESOURCE_RESERVATION_STATUSES.BOOKED,
            startMinute: 18 * 60 + 30,
            endMinute: 19 * 60 + 30,
            resource: {
              name: "Axe Throwing Lane 2",
              resourceType: { name: "Axe Throwing Lane", slug: "axe-throwing-lane" },
            },
          },
          {
            id: "r3",
            status: RESOURCE_RESERVATION_STATUSES.BOOKED,
            startMinute: 18 * 60 + 30,
            endMinute: 19 * 60 + 30,
            resource: {
              name: "Axe Throwing Lane 3",
              resourceType: { name: "Axe Throwing Lane", slug: "axe-throwing-lane" },
            },
          },
          {
            id: "b1",
            status: RESOURCE_RESERVATION_STATUSES.BOOKED,
            startMinute: 19 * 60 + 30,
            endMinute: 20 * 60 + 30,
            resource: {
              name: "Bowling Lane 1",
              resourceType: { name: "Bowling Lane", slug: "bowling-lane" },
            },
          },
        ]}
        inventoryCounts={[
          { resourceTypeName: "Axe Throwing Lane", resourceTypeSlug: "axe-throwing-lane", activeQuantity: 7 },
          { resourceTypeName: "Bowling Lane", resourceTypeSlug: "bowling-lane", activeQuantity: 8 },
        ]}
        canHold={false}
        canRelease={false}
        timeZone="America/Indiana/Indianapolis"
        mode="confirmed"
      />,
    );
    expect(html).toContain("Resources booked for this event.");
    expect(html).toContain("Axe Throwing Lane 1");
    expect(html).toContain("3 allocated of 7 total");
    expect(html).toContain("1 allocated of 8 total");
    expect(html).toContain("6:30 PM–7:30 PM");
    expect(html).not.toContain("Available. All required resources are currently free at the selected time.");
    expect(html).not.toContain("Check Availability");
    expect(html).not.toContain("Legacy hold");
  });

  it("does not label current BOOKED rows as a legacy hold", () => {
    const html = renderToStaticMarkup(
      <EmployeeSelectedPlanResourceCheck
        inquiryId="inq_1"
        availabilityStatus={PLAN_AVAILABILITY_STATUSES.AVAILABLE}
        live={pendingLive}
        holds={[]}
        allocations={[
          {
            id: "r1",
            status: RESOURCE_RESERVATION_STATUSES.BOOKED,
            startMinute: 18 * 60 + 30,
            endMinute: 19 * 60 + 30,
            resource: { name: "Axe Throwing Lane 1", resourceType: { name: "Axe Throwing Lane" } },
          },
        ]}
        canHold={false}
        canRelease={false}
        timeZone="UTC"
        mode="confirmed"
      />,
    );
    expect(html).not.toContain("Legacy hold");
    expect(html).toContain("Axe Throwing Lane 1");
  });

  it("shows released copy after cancellation", () => {
    const html = renderToStaticMarkup(
      <EmployeeSelectedPlanResourceCheck
        inquiryId="inq_1"
        availabilityStatus={PLAN_AVAILABILITY_STATUSES.AVAILABLE}
        live={null}
        holds={[]}
        allocations={[
          {
            id: "r1",
            status: RESOURCE_RESERVATION_STATUSES.BOOKED,
            releasedAt: new Date("2026-09-22T12:00:00.000Z"),
            startMinute: 18 * 60 + 30,
            endMinute: 19 * 60 + 30,
            resource: { name: "Axe Throwing Lane 1", resourceType: { name: "Axe Throwing Lane" } },
          },
        ]}
        canHold={false}
        canRelease={false}
        timeZone="UTC"
        mode="cancelled"
      />,
    );
    expect(html).toContain("Booking cancelled. Resources released.");
    expect(html).toContain("1 released");
    expect(html).not.toContain("Check Availability");
    expect(html).not.toContain("Available. All required resources are currently free");
  });
});
