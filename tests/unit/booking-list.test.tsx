/** @vitest-environment jsdom */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { BookingDetail } from "@/components/layout/booking-detail";
import { BookingList, bookingResourceSummary } from "@/components/layout/booking-list";
import { BOOKING_LIST_FILTERS, BOOKING_STATUSES } from "@/types/booking";
import { RESOURCE_RESERVATION_STATUSES } from "@/types/resource-schedule";

describe("booking list and detail", () => {
  it("summarizes booked resource types", () => {
    expect(
      bookingResourceSummary([
        { resource: { name: "Bowling Lane 1", resourceType: { name: "Bowling Lane" } } },
        { resource: { name: "Bowling Lane 2", resourceType: { name: "Bowling Lane" } } },
        { resource: { name: "Party Room A", resourceType: { name: "Party Room" } } },
      ]),
    ).toBe("Bowling Lane, Party Room");
  });

  it("lists confirmed bookings with operational fields", () => {
    const html = renderToStaticMarkup(
      <BookingList
        filter={BOOKING_LIST_FILTERS.UPCOMING}
        search=""
        bookings={[
          {
            id: "bk_1",
            bookingNumber: "FUN-2026-00421",
            status: BOOKING_STATUSES.CONFIRMED,
            eventDate: new Date("2026-10-15T00:00:00.000Z"),
            startTime: "18:00",
            endTime: "21:00",
            guestCount: 75,
            eventType: "Corporate Event",
            totalCents: 485000,
            currency: "USD",
            customerGroupName: "Apex Robotics",
            customerFirstName: "Ada",
            customerLastName: "Lovelace",
            confirmedBy: {
              firstName: "Jane",
              lastName: "Smith",
              displayName: "Jane Smith",
              email: "jane@example.com",
            },
            reservations: [{ resource: { name: "Bowling Lane 1", resourceType: { name: "Bowling Lane" } } }],
          },
        ]}
      />,
    );

    expect(html).toContain("FUN-2026-00421");
    expect(html).toContain("Apex Robotics");
    expect(html).toContain("75 guests");
    expect(html).toContain("Corporate Event");
    expect(html).toContain("Bowling Lane");
    expect(html).toContain("Confirmed");
    expect(html).toContain("Jane Smith");
    expect(html).toContain("/app/bookings/bk_1");
  });

  it("renders a read-only booking from the agent working version", () => {
    const html = renderToStaticMarkup(
      <BookingDetail
        timeZone="UTC"
        booking={{
          id: "bk_1",
          bookingNumber: "FUN-2026-00421",
          status: BOOKING_STATUSES.CONFIRMED,
          eventDate: new Date("2026-10-15T00:00:00.000Z"),
          startTime: "18:00",
          endTime: "21:00",
          guestCount: 80,
          eventType: "Corporate Event",
          eventGoal: "Employee Appreciation",
          diningLabel: "Catered Slider Bar",
          subtotalCents: 510000,
          taxCents: 0,
          totalCents: 510000,
          currency: "USD",
          customerGroupName: "Apex Robotics",
          customerFirstName: "Ada",
          customerLastName: "Lovelace",
          customerEmail: "ada@example.com",
          customerPhone: "5556543333",
          customerNotes: "Need a quiet room.",
          internalNotes: "Called customer",
          confirmedAt: new Date("2026-09-09T16:00:00.000Z"),
          payload: {
            guestCount: 80,
            eventDate: "2026-10-15",
            startTime: "18:00",
            durationMinutes: 180,
            activities: [
              { knowledgeItemId: "kart", name: "Go-Karts", quantity: 1, priceCents: 200000 },
              { knowledgeItemId: "bowl", name: "Bowling", quantity: 4, priceCents: 80000 },
            ],
            dining: { label: "Catered Slider Bar", priceCents: 150000 },
            spaces: [{ knowledgeItemId: "room", name: "Party Room A", priceCents: 80000 }],
            schedule: ["Go-Karts first, then bowling."],
            pricingComplete: true,
          },
          confirmedBy: {
            firstName: "Jane",
            lastName: "Smith",
            displayName: "Jane Smith",
            email: "jane@example.com",
          },
          lineItems: [
            {
              id: "li_1",
              kind: "ACTIVITY",
              name: "Go-Karts",
              quantity: 1,
              unitPriceCents: 200000,
              totalCents: 200000,
              startTime: "18:00",
              endTime: null,
            },
          ],
          reservations: [
            {
              id: "res_1",
              status: RESOURCE_RESERVATION_STATUSES.BOOKED,
              startMinute: 18 * 60,
              endMinute: 21 * 60,
              resource: { name: "Bowling Lane 1", resourceType: { name: "Bowling Lane" } },
            },
          ],
          inquiry: {
            id: "inq_1",
            selectedEventPlanId: "plan_selected",
            agentWorkingPlanId: "plan_working",
            customerSelectedAt: new Date("2026-09-09T12:00:00.000Z"),
          },
        }}
      />,
    );

    expect(html).toContain("FUN-2026-00421");
    expect(html).toContain("Go-Karts");
    expect(html).toContain("Catered Slider Bar");
    expect(html).toContain("Party Room A");
    expect(html).toContain("BOOKED");
    expect(html).toContain("read-only after confirmation");
    expect(html).toContain("No deposit or payment has been recorded");
    expect(html).toContain("/app/inquiries/inq_1");
    expect(html).toContain("80");
  });
});
