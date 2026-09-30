/** @vitest-environment jsdom */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { EmployeeBookingBuilder } from "@/components/layout/employee-manual-booking-form";
import { ScheduleCreateEventDialog } from "@/components/layout/schedule-create-event-dialog";
import { bookingCompletionCopy } from "@/lib/resources/schedule-board";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  unstable_rethrow: (error: unknown) => {
    throw error;
  },
}));

vi.mock("@/server/actions/bookings", () => ({
  createEmployeeManualBookingAction: vi.fn(),
}));

const catalog = {
  locations: [{ id: "loc_1", name: "Main" }],
  attractions: [{ id: "attr_axe", name: "Axe throwing" }],
  defaultLocationId: "loc_1",
};

function hintText(html: string) {
  const match = html.match(/data-schedule-hint[^>]*>([^<]+)/);
  return match?.[1] ?? "";
}

describe("employee booking builder", () => {
  it("keeps the full-page route on the same workflow and stores the hinted start as HH:mm", () => {
    const html = renderToStaticMarkup(
      <EmployeeBookingBuilder
        locations={catalog.locations}
        attractions={catalog.attractions}
        defaultLocationId="loc_1"
        scheduleHint={{
          date: "2026-09-17",
          startTime: "17:00",
          locationId: "loc_1",
          resourceName: "Lane 3",
        }}
      />,
    );
    expect(html).toContain('data-employee-booking-builder="page"');
    expect(html).toContain("Generate plan");
    expect(html).toContain("Food / dining");
    expect(html).toContain("Room / space");
    expect(html).toContain('name="startTime"');
    expect(html).toContain('value="17:00"');
    expect(html).toContain('value="2026-09-17"');
    expect(hintText(html)).toContain("5:00 PM");
    expect(hintText(html)).not.toMatch(/\b(?:[01]\d|2[0-3]):[0-5]\d\b/);
    expect(hintText(html)).toContain("does not reserve that resource");
    expect(html).not.toContain('name="resourceId"');
  });
});

describe("schedule create-event dialog", () => {
  it("opens a slot with a 12-hour hint and does not reserve that resource", () => {
    const html = renderToStaticMarkup(
      <ScheduleCreateEventDialog
        open
        date="2026-09-17"
        locationId="loc_1"
        launch={{ startMinute: 9 * 60, resourceName: "Axe Throwing Lane 1" }}
        locations={catalog.locations}
        attractions={catalog.attractions}
        defaultLocationId="loc_1"
        outcome={null}
        onClose={() => undefined}
        onCreated={() => "stay"}
        onComplete={() => undefined}
      />,
    );
    expect(html).toContain("Create Event");
    expect(html).toContain('data-employee-booking-builder="schedule"');
    expect(html).toContain("Generate plan");
    expect(hintText(html)).toBe(
      "Starting from Axe Throwing Lane 1 at 9:00 AM. This does not reserve that resource. Availability is checked when the plan is generated.",
    );
    expect(hintText(html)).not.toMatch(/\b(?:[01]\d|2[0-3]):[0-5]\d\b/);
    expect(html).toContain('name="startTime"');
    expect(html).toContain('value="09:00"');
    expect(html).not.toContain('name="resourceId"');
    expect(html).not.toContain("Continue to Event Builder");
  });

  it("prefills date and location from the header without inventing a start time or resource", () => {
    const html = renderToStaticMarkup(
      <ScheduleCreateEventDialog
        open
        date="2026-09-17"
        locationId="loc_1"
        launch={{ startMinute: null, resourceName: null }}
        locations={catalog.locations}
        attractions={catalog.attractions}
        defaultLocationId="loc_1"
        outcome={null}
        onClose={() => undefined}
        onCreated={() => "stay"}
        onComplete={() => undefined}
      />,
    );
    expect(html).toContain("Choose a start time");
    expect(html).not.toContain("data-schedule-hint");
    expect(html).not.toContain('value="17:00"');
    expect(html).toContain('value="2026-09-17"');
    expect(html).toContain("Main");
    expect(html).not.toContain('name="resourceId"');
  });

  it("shows pending and confirmed results on the schedule with explicit record links", () => {
    const pending = renderToStaticMarkup(
      <ScheduleCreateEventDialog
        open
        date="2026-09-17"
        locationId="loc_1"
        launch={null}
        locations={catalog.locations}
        attractions={catalog.attractions}
        defaultLocationId="loc_1"
        review={<p>Working plan</p>}
        outcome={{ kind: "pending" }}
        inquiryId="inq_9"
        onClose={() => undefined}
        onCreated={() => "stay"}
        onComplete={() => undefined}
      />,
    );
    expect(pending).toContain(bookingCompletionCopy("pending"));
    expect(pending).toContain("Done");
    expect(pending).toContain("Working plan");
    expect(pending).toContain('href="/app/inquiries/inq_9"');
    expect(pending).not.toContain('href="/app/bookings/');
    expect(pending).not.toContain("Continue to Event Builder");

    const confirmed = renderToStaticMarkup(
      <ScheduleCreateEventDialog
        open
        date="2026-09-17"
        locationId="loc_1"
        launch={null}
        locations={catalog.locations}
        attractions={catalog.attractions}
        defaultLocationId="loc_1"
        review={<p>Confirmed plan</p>}
        outcome={{ kind: "confirmed" }}
        inquiryId="inq_9"
        bookingId="bk_9"
        onClose={() => undefined}
        onCreated={() => "stay"}
        onComplete={() => undefined}
      />,
    );
    expect(confirmed).toContain(bookingCompletionCopy("confirmed"));
    expect(confirmed).toContain('href="/app/bookings/bk_9"');
    expect(confirmed).toContain("Open booking");
    expect(confirmed).toContain('href="/app/inquiries/inq_9"');
    expect(confirmed).not.toContain("/app/bookings/new");
  });
});
