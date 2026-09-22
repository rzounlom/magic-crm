/** @vitest-environment jsdom */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { MasterScheduleGrid } from "@/components/layout/master-schedule-grid";
import { RESOURCE_RESERVATION_STATUSES } from "@/types/resource-schedule";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  unstable_rethrow: (error: unknown) => {
    throw error;
  },
}));

vi.mock("@/server/actions/resource-schedule", () => ({
  placeManualHoldAction: vi.fn(),
  releaseHoldAction: vi.fn(),
}));

describe("master schedule grid", () => {
  it("renders available cells as non-interactive text", () => {
    const html = renderToStaticMarkup(
      <MasterScheduleGrid
        date="2026-09-17"
        resourceTypeId="type_lane"
        resources={[{ id: "lane_1", name: "Bowling Lane 1" }]}
        reservations={[]}
        slotMinutes={60}
        startMinute={17 * 60}
        endMinute={18 * 60}
        canHold
        canRelease
        timeZone="America/Indiana/Indianapolis"
      />,
    );

    expect(html).toContain("Available");
    expect(html).not.toContain('href="/app/schedule?date=2026-09-17');
    expect(html).not.toContain("hover:bg-muted");
    expect(html).not.toContain('role="button"');
    expect(html).toContain(">Available</span>");
    expect(html).not.toContain("Place hold");
    expect(html).not.toContain("Place a temporary HOLD");
  });

  it("keeps HOLD and BOOKED navigation when a destination exists", () => {
    const html = renderToStaticMarkup(
      <MasterScheduleGrid
        date="2026-09-17"
        resourceTypeId="type_lane"
        resources={[{ id: "lane_1", name: "Bowling Lane 1" }]}
        reservations={[
          {
            id: "hold_1",
            resourceId: "lane_1",
            status: RESOURCE_RESERVATION_STATUSES.HOLD,
            startMinute: 17 * 60,
            endMinute: 18 * 60,
            inquiryId: "inq_1",
            expiresAt: new Date("2026-09-16T23:15:00.000Z"),
            bookingId: null,
            inquiry: {
              id: "inq_1",
              customerGroupName: "Smith",
              customerFirstName: "Ada",
              customerLastName: "Smith",
            },
            booking: null,
          },
        ]}
        slotMinutes={60}
        startMinute={17 * 60}
        endMinute={18 * 60}
        canHold
        canRelease
        timeZone="America/Indiana/Indianapolis"
      />,
    );

    expect(html).toContain("Legacy Hold");
    expect(html).toContain('href="/app/inquiries/inq_1"');
    expect(html).toContain("Open inquiry");
    expect(html).toContain("5:00 PM");
  });

  it("occupies two 30-minute cells for a 60-minute booking and labels the continuation", () => {
    const html = renderToStaticMarkup(
      <MasterScheduleGrid
        date="2026-10-15"
        resourceTypeId="type_axe"
        resources={[{ id: "axe_1", name: "Axe Throwing Lane 1" }]}
        reservations={[
          {
            id: "booked_1",
            resourceId: "axe_1",
            status: RESOURCE_RESERVATION_STATUSES.BOOKED,
            startMinute: 18 * 60 + 30,
            endMinute: 19 * 60 + 30,
            inquiryId: "inq_1",
            bookingId: "bk_1",
            inquiry: {
              id: "inq_1",
              customerGroupName: "Acme Manufacturing",
              customerFirstName: "Ada",
              customerLastName: "Lovelace",
            },
            booking: {
              id: "bk_1",
              bookingNumber: "GEN-2026-00021",
              customerGroupName: "Acme Manufacturing",
              customerFirstName: "Ada",
              customerLastName: "Lovelace",
            },
          },
        ]}
        slotMinutes={30}
        startMinute={18 * 60 + 30}
        endMinute={20 * 60}
        canHold={false}
        canRelease={false}
        timeZone="America/Indiana/Indianapolis"
      />,
    );
    expect(html).toContain("Confirmed");
    expect(html).toContain("Acme Manufacturing");
    expect(html).toContain("GEN-2026-00021");
    expect(html).toContain("6:30 PM–7:30 PM");
    expect(html).toContain("Continues");
    expect(html.match(/Available/g)?.length).toBe(1);
  });
});
