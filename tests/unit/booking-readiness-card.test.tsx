import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/actions/resource-schedule", () => ({
  placeInquiryHoldAction: vi.fn(),
}));

vi.mock("@/server/actions/hours-exceptions", () => ({
  authorizePlaceHoldHoursExceptionAction: vi.fn(),
  revokePlaceHoldHoursExceptionAction: vi.fn(),
  authorizeConfirmHoursExceptionAction: vi.fn(),
  revokeConfirmHoursExceptionAction: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: {} }));

import { BookingReadinessCard } from "@/components/layout/booking-readiness-card";
import { ConfirmationReadinessPanel } from "@/components/layout/confirmation-readiness-panel";
import { HoldReadinessPanel } from "@/components/layout/hold-readiness-panel";
import { CONFIRMATION_READINESS_STATES } from "@/types/confirmation-readiness";
import { HOLD_READINESS_STATES } from "@/types/hold-readiness";

describe("BookingReadinessCard", () => {
  it("keeps PLACE_HOLD and CONFIRM_BOOKING purpose labels distinct", () => {
    const hold = renderToStaticMarkup(
      <BookingReadinessCard
        id="hold-readiness"
        purpose="PLACE_HOLD"
        title="Proposal HOLD readiness"
        headline="Ready with exception"
        detail="HOLD may be attempted."
        tone="info"
        eventDateLabel="Oct 15, 2026"
        eventTimeLabel="6:00 PM–9:00 PM"
        locationLabel="Main · America/Chicago"
        operatingHoursStatus="OUTSIDE_HOURS"
        blockers={[
          {
            code: "OUTSIDE_HOURS",
            message: "Outside verified hours",
            overridableWithHoursException: true,
          },
        ]}
      />,
    );
    const confirm = renderToStaticMarkup(
      <BookingReadinessCard
        id="confirmation-readiness"
        purpose="CONFIRM_BOOKING"
        title="Confirmation readiness"
        headline="Blocked"
        detail="Resource conflict."
        tone="danger"
        eventDateLabel="Oct 15, 2026"
        eventTimeLabel="6:00 PM–9:00 PM"
        locationLabel="Main · America/Chicago"
        operatingHoursStatus="WITHIN_HOURS"
        blockers={[
          {
            code: "RESOURCE_CONFLICT",
            message: "Lane 1 is occupied",
            overridableWithHoursException: false,
          },
        ]}
      />,
    );

    expect(hold).toContain("Purpose: PLACE_HOLD");
    expect(hold).toContain('data-readiness-purpose="PLACE_HOLD"');
    expect(hold).toContain("Outside verified hours");
    expect(hold).toContain("(hours exception may apply)");
    expect(confirm).toContain("Purpose: CONFIRM_BOOKING");
    expect(confirm).toContain('data-readiness-purpose="CONFIRM_BOOKING"');
    expect(confirm).toContain("Lane 1 is occupied");
    expect(confirm).toContain("(not overridable by hours exception)");
    expect(hold).not.toContain("Purpose: CONFIRM_BOOKING");
    expect(confirm).not.toContain("Purpose: PLACE_HOLD");
    expect(hold).toContain("Outside operating hours");
    expect(hold).not.toContain(">OUTSIDE_HOURS<");
    expect(confirm).toContain("Within operating hours");
  });

  it("humanizes HOURS_UNCONFIGURED for staff without hiding the raw title", () => {
    const html = renderToStaticMarkup(
      <BookingReadinessCard
        id="hold-readiness"
        purpose="PLACE_HOLD"
        title="Proposal HOLD readiness"
        headline="Inventory setup required"
        detail="Add numbered inventory."
        tone="warning"
        eventDateLabel="Nov 22, 2026"
        eventTimeLabel="2:00 PM–4:00 PM"
        locationLabel="Main · UTC"
        operatingHoursStatus="HOURS_UNCONFIGURED"
        blockers={[]}
      />,
    );
    expect(html).toContain("Not configured for this location");
    expect(html).toContain('title="HOURS_UNCONFIGURED"');
    expect(html).not.toContain(">HOURS_UNCONFIGURED<");
  });
});

describe("Hold and confirmation readiness panels", () => {
  it("surfaces active HOLD expiry and expired HOLD messaging", () => {
    const active = renderToStaticMarkup(
      <HoldReadinessPanel
        canHold
        readiness={{
          inquiryId: "inq_1",
          state: HOLD_READINESS_STATES.ALREADY_HELD,
          headline: "HOLD active",
          detail: "Resources are held.",
          locationId: "loc_1",
          locationName: "Main",
          timeZone: "America/Chicago",
          eventDate: "2026-10-15",
          startTime: "18:00",
          endTime: "21:00",
          startMinute: 18 * 60,
          endMinute: 21 * 60,
          operatingHoursStatus: "WITHIN_HOURS",
          blockers: [],
          activeException: null,
          activeHold: {
            resourceCount: 2,
            resourceLabels: ["Lane 1", "Room A"],
            expiresAt: "2026-10-11T18:00:00.000Z",
            expired: false,
          },
          resourceAssignments: [],
          canAuthorizeHoursException: false,
          canRevokeHoursException: false,
          canHoldWithCurrentException: false,
          holdAttemptAllowed: false,
        }}
      />,
    );
    expect(active).toContain("Purpose: PLACE_HOLD");
    expect(active).toContain("Expires");
    expect(active).toContain("24-hour proposal HOLD");
    expect(active).toContain("Lane 1");

    const expired = renderToStaticMarkup(
      <HoldReadinessPanel
        readiness={{
          inquiryId: "inq_1",
          state: HOLD_READINESS_STATES.NEEDS_FINAL_VALIDATION,
          headline: "HOLD expired",
          detail: "Place a new HOLD if needed.",
          locationId: "loc_1",
          locationName: "Main",
          timeZone: "America/Chicago",
          eventDate: "2026-10-15",
          startTime: "18:00",
          endTime: "21:00",
          startMinute: 18 * 60,
          endMinute: 21 * 60,
          operatingHoursStatus: "WITHIN_HOURS",
          blockers: [],
          activeException: null,
          activeHold: {
            resourceCount: 0,
            resourceLabels: [],
            expiresAt: "2026-10-10T18:00:00.000Z",
            expired: true,
          },
          resourceAssignments: [],
          canAuthorizeHoursException: false,
          canRevokeHoursException: false,
          canHoldWithCurrentException: false,
          holdAttemptAllowed: true,
        }}
      />,
    );
    expect(expired).toContain("previous HOLD has expired");
    expect(expired).toContain("Expired");
  });

  it("keeps confirmation panel payment-neutral and purpose-labeled", () => {
    const html = renderToStaticMarkup(
      <ConfirmationReadinessPanel
        readiness={{
          inquiryId: "inq_1",
          bookingId: null,
          bookingNumber: null,
          bookingStatus: "PENDING_PAYMENT",
          bookingHref: null,
          state: CONFIRMATION_READINESS_STATES.NEEDS_FINAL_VALIDATION,
          headline: "Ready to attempt confirmation",
          detail: "Final confirmation rechecks availability.",
          locationId: "loc_1",
          locationName: "Main",
          timeZone: "America/Chicago",
          eventDate: "2026-10-15",
          startTime: "18:00",
          endTime: "21:00",
          startMinute: 18 * 60,
          endMinute: 21 * 60,
          operatingHoursStatus: "WITHIN_HOURS",
          blockers: [],
          activeException: null,
          canAuthorizeHoursException: false,
          canRevokeHoursException: false,
          canConfirmWithCurrentException: false,
          confirmAttemptAllowed: true,
        }}
      />,
    );
    expect(html).toContain("Purpose: CONFIRM_BOOKING");
    expect(html).toContain("Pending confirmation");
    expect(html).not.toContain("payment collected");
    expect(html).not.toContain("Purpose: PLACE_HOLD");
  });
});
