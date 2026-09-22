/** @vitest-environment jsdom */

import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { LiveAgentBookingActions } from "@/components/layout/live-agent-booking-actions";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  unstable_rethrow: (error: unknown) => {
    throw error;
  },
}));

vi.mock("@/server/actions/bookings", () => ({
  confirmBookingAction: vi.fn(),
  cancelBookingAction: vi.fn(),
}));

vi.mock("@/server/actions/live-agent", () => ({
  markReadyToFinalizeAction: vi.fn(),
  startWorkingInquiryAction: vi.fn(),
  savePendingBookingAction: vi.fn(),
}));

vi.mock("@/server/actions/resource-schedule", () => ({
  placeInquiryHoldAction: vi.fn(),
}));

const blockedInventory = {
  inquiryId: "inq_1",
  expectedUpdatedAt: "2026-09-09T12:00:00.000Z",
  booked: false,
  canManage: true,
  canHold: true,
  canConfirm: true,
  assigned: true,
  needsHold: false,
  hasHold: false,
  canPlaceHold: false,
  needsInventory: true,
  confirmBlockers: ["Bowling Lane still needs resource configuration before booking."],
};

describe("live agent booking actions", () => {
  it("keeps confirm at the top while inventory is missing and does not require Place Hold", () => {
    const html = renderToStaticMarkup(<LiveAgentBookingActions {...blockedInventory} />);

    expect(html).toContain("Set up inventory");
    expect(html).toContain("/app/admin/resources");
    expect(html).toContain("Confirm Payment &amp; Book");
    expect(html).toContain("Set up rooms and lanes");
    expect(html).toContain("Check Availability");
    expect(html).not.toContain("Place Hold");
    expect(html).not.toContain("Place Resource Hold");
    expect(html).not.toContain("Mark Ready to Finalize");
  });

  it("enables Confirm Payment & Book without a hold", () => {
    const html = renderToStaticMarkup(
      <LiveAgentBookingActions
        inquiryId="inq_1"
        expectedUpdatedAt="2026-09-09T12:00:00.000Z"
        booked={false}
        canManage
        canHold
        canConfirm
        assigned
        needsHold={false}
        hasHold={false}
        canPlaceHold={false}
        needsInventory={false}
        confirmBlockers={[]}
        availabilityChecked
      />,
    );

    expect(html).toContain("Confirm payment and booking");
    expect(html).toContain("Confirm Payment &amp; Book");
    expect(html).toContain("received outside MagicCRM");
    expect(html).toContain('type="submit"');
    expect(html).not.toContain("Place Hold");
    expect(html).not.toContain("Resources are currently held");
  });

  it("uses pending labels that disable duplicate booking mutations", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src/components/layout/live-agent-booking-actions.tsx"),
      "utf8",
    );
    expect(source).toContain('pendingLabel="Starting…"');
    expect(source).toContain('pendingLabel="Confirming…"');
    expect(source).toContain('pendingLabel="Saving…"');
    expect(source).toContain('pendingLabel="Cancelling…"');
    expect(source).toContain('confirmPendingLabel: "Confirming…"');
    expect(source).not.toContain('pendingLabel="Placing hold…"');
  });

  it("lets a payment-conflict pending booking be saved, retried, and cancelled", () => {
    const html = renderToStaticMarkup(
      <LiveAgentBookingActions
        inquiryId="inq_1"
        expectedUpdatedAt="2026-09-09T12:00:00.000Z"
        booked={false}
        bookingHref="/app/bookings/bk_1"
        bookingNumber="FUN-2026-00421"
        canManage
        canHold
        canConfirm
        assigned
        needsHold={false}
        hasHold={false}
        canPlaceHold={false}
        needsInventory={false}
        confirmBlockers={[]}
        pendingPayment
        paymentConflict
        availabilityChecked
        canCancel
      />,
    );

    expect(html).toContain("Payment received — availability conflict");
    expect(html).toContain("Save Pending Booking");
    expect(html).toContain("Confirm Payment &amp; Book");
    expect(html).toContain("Cancel this booking request?");
    expect(html).toContain("Cancel Booking");
  });

  it("shows cancel on a confirmed booking and not save/confirm", () => {
    const html = renderToStaticMarkup(
      <LiveAgentBookingActions
        inquiryId="inq_1"
        expectedUpdatedAt="2026-09-09T12:00:00.000Z"
        booked
        bookingHref="/app/bookings/bk_1"
        bookingNumber="FUN-2026-00421"
        canManage
        canHold
        canConfirm
        assigned
        needsHold={false}
        hasHold={false}
        canPlaceHold={false}
        needsInventory={false}
        confirmBlockers={[]}
        canCancel
      />,
    );

    expect(html).toContain("Cancel this booking?");
    expect(html).toContain("Cancel Booking");
    expect(html).toContain("This event is booked");
    expect(html).not.toContain("Save Pending Booking");
    expect(html).not.toContain("Confirm payment and booking?");
  });
});
