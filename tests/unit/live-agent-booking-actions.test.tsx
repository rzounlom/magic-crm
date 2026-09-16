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
}));

vi.mock("@/server/actions/live-agent", () => ({
  markReadyToFinalizeAction: vi.fn(),
  startWorkingInquiryAction: vi.fn(),
}));

vi.mock("@/server/actions/resource-schedule", () => ({
  placeInquiryHoldAction: vi.fn(),
}));

const blockedHold = {
  inquiryId: "inq_1",
  expectedUpdatedAt: "2026-09-09T12:00:00.000Z",
  booked: false,
  canManage: true,
  canHold: true,
  canConfirm: true,
  assigned: true,
  needsHold: true,
  hasHold: false,
  canPlaceHold: false,
  needsInventory: true,
  confirmBlockers: ["Bowling Lane still needs resource configuration before booking."],
};

describe("live agent booking actions", () => {
  it("keeps hold and confirm at the top while inventory is missing", () => {
    const html = renderToStaticMarkup(<LiveAgentBookingActions {...blockedHold} />);

    expect(html).toContain("Set up inventory");
    expect(html).toContain("/app/admin/resources");
    expect(html).toContain("Place Resource Hold");
    expect(html).toContain("Confirm Booking");
    expect(html).toContain("Set up rooms and lanes");
    expect(html).toContain("Place Hold");
    expect(html).not.toContain("Mark Ready to Finalize");
    expect(html).not.toContain("Mark this inquiry Ready to Finalize before confirming a booking.");
  });

  it("enables Confirm Booking after a hold without Ready to Finalize", () => {
    const html = renderToStaticMarkup(
      <LiveAgentBookingActions
        inquiryId="inq_1"
        expectedUpdatedAt="2026-09-09T12:00:00.000Z"
        booked={false}
        canManage
        canHold
        canConfirm
        assigned
        needsHold
        hasHold
        canPlaceHold={false}
        needsInventory={false}
        confirmBlockers={[]}
      />,
    );

    expect(html).toContain("Confirm this booking");
    expect(html).toContain("Resources are currently held");
    expect(html).toContain("Resources Held");
    expect(html).toContain("Confirm Booking");
    expect(html).toContain('type="submit"');
    expect(html).not.toContain("Mark Ready to Finalize");
    expect(html).not.toContain("cursor-not-allowed rounded-md bg-primary");
  });

  it("uses pending labels that disable duplicate booking mutations", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src/components/layout/live-agent-booking-actions.tsx"),
      "utf8",
    );
    expect(source).toContain('pendingLabel="Starting…"');
    expect(source).toContain('pendingLabel="Placing hold…"');
    expect(source).toContain('pendingLabel="Confirming…"');
    expect(source).toContain('confirmPendingLabel: "Confirming…"');
  });
});
