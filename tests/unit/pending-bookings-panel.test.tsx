/** @vitest-environment jsdom */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PendingBookingsPanel } from "@/components/layout/pending-bookings-panel";

describe("pending bookings panel", () => {
  it("lists unpaid requests without occupancy language", () => {
    const html = renderToStaticMarkup(
      <PendingBookingsPanel
        bookings={[
          {
            id: "bk_pending",
            inquiryId: "inq_1",
            bookingNumber: "FUN-2026-00007",
            eventDate: new Date("2026-10-15T00:00:00.000Z"),
            startTime: "18:00",
            endTime: "21:00",
            guestCount: 24,
            totalCents: 500000,
            depositRequiredCents: 150000,
            currency: "USD",
            customerGroupName: "Apex Robotics",
            customerFirstName: "Ada",
            customerLastName: "Lovelace",
            selectedEventPlanId: "plan_1",
            availabilityConflictAt: null,
            paymentConfirmedExternallyAt: null,
            planTitle: "Recommended",
          },
        ]}
      />,
    );

    expect(html).toContain("Pending bookings");
    expect(html).toContain("Apex Robotics");
    expect(html).toContain("Recommended");
    expect(html).toContain("Pending payment");
    expect(html).toContain("do not occupy lanes");
    expect(html).toContain("/app/bookings/bk_pending");
    expect(html).toContain("/app/inquiries/inq_1");
    expect(html).not.toContain("BOOKED");
    expect(html).not.toContain("Legacy Hold");
  });
});
