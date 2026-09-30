/** @vitest-environment jsdom */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { MasterScheduleBoard } from "@/components/layout/master-schedule-board";
import { blockPlacement, bookingCompletionCopy, eventBuilderPath, inquiryIdFromBuilderRedirect, occupancyCount, occupancySummary, readBookingBuilderSearchHint, schedulePath, scheduleStartHint } from "@/lib/resources/schedule-board";
import { RESOURCE_RESERVATION_STATUSES } from "@/types/resource-schedule";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  unstable_rethrow: (error: unknown) => {
    throw error;
  },
}));

vi.mock("@/server/actions/resource-schedule", () => ({
  releaseHoldAction: vi.fn(),
}));

vi.mock("@/server/actions/bookings", () => ({
  createEmployeeManualBookingAction: vi.fn(),
  confirmBookingAction: vi.fn(),
}));

const groups = [
  {
    id: "type_bowl",
    name: "Bowling",
    resources: [
      { id: "lane_1", name: "Lane 1", resourceTypeId: "type_bowl" },
      { id: "lane_2", name: "Lane 2", resourceTypeId: "type_bowl" },
    ],
  },
];

describe("schedule board helpers", () => {
  it("builds an event-builder hint that does not reserve the resource", () => {
    const href = eventBuilderPath({
      date: "2026-11-18",
      startTime: "17:00",
      locationId: "loc_1",
      resourceTypeId: "type_bowl",
      resourceId: "lane_3",
      resourceName: "Lane 3",
    });
    expect(href).toContain("/app/bookings/new?");
    expect(href).toContain("date=2026-11-18");
    expect(href).toContain("start=17%3A00");
    expect(href).toContain("locationId=loc_1");
    expect(href).toContain("resourceId=lane_3");
    expect(href).not.toContain("reserve");
    expect(href).not.toContain("skipAvailability");
  });

  it("places a block from exact start and end minutes", () => {
    expect(
      blockPlacement({
        startMinute: 17 * 60,
        endMinute: 19 * 60,
        dayStart: 8 * 60,
        dayEnd: 22 * 60,
        slotWidth: 72,
      }),
    ).toEqual({ left: 18 * 72, width: 4 * 72 });
  });

  it("counts resources that have a reservation today", () => {
    expect(occupancyCount(["lane_1", "lane_2", "lane_3"], ["lane_1", "lane_1"])).toEqual({
      occupied: 1,
      total: 3,
    });
  });

  it("formats the event-builder hint in 12-hour time without claiming all-day occupancy", () => {
    const hint = scheduleStartHint("Lane 3", "17:00");
    expect(hint).toBe(
      "Starting from Lane 3 at 5:00 PM. This does not reserve that resource. Availability is checked when the plan is generated.",
    );
    expect(hint).not.toMatch(/\b(?:[01]\d|2[0-3]):[0-5]\d\b/);
    expect(occupancySummary("Bowling", 2, 2)).toBe("Bowling: 2 of 2 have bookings today");
    expect(occupancySummary("Party rooms", 1, 3)).toBe("Party rooms: 1 of 3 have bookings today");
    expect(occupancySummary("Bowling", 2, 2)).not.toMatch(/in use today|occupied right now|lanes/i);
  });

  it("keeps a generated inquiry on the schedule and describes pending versus confirmed results", () => {
    const inquiryId = inquiryIdFromBuilderRedirect("/app/inquiries/inq_17");
    expect(schedulePath({ date: "2026-09-17", focus: "all", builder: inquiryId })).toBe(
      "/app/schedule?date=2026-09-17&builder=inq_17",
    );
    expect(schedulePath({ date: "2026-09-17", focus: "type_bowl" })).toBe("/app/schedule?date=2026-09-17&focus=type_bowl");
    expect(readBookingBuilderSearchHint({ date: "2026-09-17", start: "17:00", resourceName: "Lane 3" }).startTime).toBe(
      "17:00",
    );
    expect(bookingCompletionCopy("pending")).toContain("does not occupy resources");
    expect(bookingCompletionCopy("confirmed")).toContain("still on Master Schedule");
    expect(bookingCompletionCopy("pending")).not.toMatch(/\/app\/bookings\//);
    expect(bookingCompletionCopy("confirmed")).not.toMatch(/\/app\/bookings\//);
  });
});

describe("master schedule board", () => {
  it("hides event creation without permission and still shows occupancy", () => {
    const html = renderToStaticMarkup(
      <MasterScheduleBoard
        date="2026-09-17"
        focus="all"
        locationId="loc_1"
        groups={groups}
        reservations={[]}
        slotMinutes={30}
        startMinute={17 * 60}
        endMinute={18 * 60}
        canCreate={false}
        canRelease={false}
        timeZone="America/Indiana/Indianapolis"
      />,
    );
    expect(html).toContain("No scheduled events for this day.");
    expect(html).toContain("Bowling: 0 of 2 have bookings today");
    expect(html).not.toMatch(/\b(?:[01]\d|2[0-3]):[0-5]\d\b/);
    expect(html).not.toContain("Create Event");
    expect(html).not.toContain("Start an event");
    expect(html).not.toContain("data-create-event-dialog");
    expect(html).not.toContain("Continue to Event Builder");
  });

  it("shows each exact resource for a multi-lane booking and distinguishes a hold", () => {
    const html = renderToStaticMarkup(
      <MasterScheduleBoard
        date="2026-09-17"
        focus="all"
        locationId="loc_1"
        groups={groups}
        reservations={[
          {
            id: "booked_1",
            resourceId: "lane_1",
            status: RESOURCE_RESERVATION_STATUSES.BOOKED,
            startMinute: 17 * 60,
            endMinute: 18 * 60,
            inquiryId: "inq_1",
            bookingId: "bk_1",
            expiresAt: null,
            inquiry: {
              id: "inq_1",
              customerGroupName: "Acme",
              customerFirstName: "Ada",
              customerLastName: "Smith",
              eventType: "Birthday Party",
              guestCount: 20,
              customerNotes: null,
              selectedEventPlanId: null,
            },
            booking: {
              id: "bk_1",
              bookingNumber: "GEN-1",
              customerGroupName: "Acme",
              customerFirstName: "Ada",
              customerLastName: "Smith",
              guestCount: 20,
              selectedEventPlanId: null,
            },
          },
          {
            id: "booked_2",
            resourceId: "lane_2",
            status: RESOURCE_RESERVATION_STATUSES.BOOKED,
            startMinute: 17 * 60,
            endMinute: 18 * 60,
            inquiryId: "inq_1",
            bookingId: "bk_1",
            expiresAt: null,
            inquiry: null,
            booking: {
              id: "bk_1",
              bookingNumber: "GEN-1",
              customerGroupName: "Acme",
              customerFirstName: "Ada",
              customerLastName: "Smith",
              guestCount: 20,
              selectedEventPlanId: null,
            },
          },
          {
            id: "hold_1",
            resourceId: "lane_2",
            status: RESOURCE_RESERVATION_STATUSES.HOLD,
            startMinute: 18 * 60,
            endMinute: 19 * 60,
            inquiryId: "inq_2",
            bookingId: null,
            expiresAt: "2026-09-18T17:00:00.000Z",
            inquiry: {
              id: "inq_2",
              customerGroupName: null,
              customerFirstName: "Bea",
              customerLastName: "Ng",
              eventType: null,
              guestCount: 8,
              customerNotes: null,
              selectedEventPlanId: null,
            },
            booking: null,
          },
        ]}
        slotMinutes={60}
        startMinute={17 * 60}
        endMinute={19 * 60}
        canCreate
        canRelease
        timeZone="America/Indiana/Indianapolis"
      />,
    );
    expect(html).toContain("Create Event");
    expect(html).toContain("Start an event at 5:00 PM on Lane 1");
    expect(html).toContain(">Booked<");
    expect(html).toContain(">Hold<");
    expect(html).toContain("Acme");
    expect(html).toContain("Bea Ng");
    expect(html).toContain("Bowling: 2 of 2 have bookings today");
    expect(html).not.toMatch(/\b(?:[01]\d|2[0-3]):[0-5]\d\b/);
    expect(html).not.toContain("Legacy Hold");
    expect(html).not.toContain("Continues");
    expect(html).not.toContain("Continue to Event Builder");
  });

  it("renders the shared booking workflow in the schedule modal and keeps record links explicit", () => {
    const html = renderToStaticMarkup(
      <MasterScheduleBoard
        date="2026-09-17"
        focus="type_bowl"
        locationId="loc_1"
        groups={groups}
        reservations={[]}
        slotMinutes={30}
        startMinute={9 * 60}
        endMinute={10 * 60}
        canCreate
        canRelease={false}
        timeZone="America/Indiana/Indianapolis"
        builderInquiryId="inq_9"
        bookingCatalog={{
          locations: [{ id: "loc_1", name: "Main" }],
          attractions: [{ id: "attr_bowl", name: "Bowling" }],
          defaultLocationId: "loc_1",
        }}
        review={<p>Working plan</p>}
      />,
    );
    expect(html).toContain("data-create-event-dialog");
    expect(html).toContain("Create Event");
    expect(html).toContain("Working plan");
    expect(html).toContain('href="/app/inquiries/inq_9"');
    expect(html).toContain("Open inquiry");
    expect(html).not.toContain("Continue to Event Builder");
    expect(html).not.toContain("/app/bookings/new");
    expect(html).toContain("Start an event at 9:00 AM on Lane 1");
  });
});
