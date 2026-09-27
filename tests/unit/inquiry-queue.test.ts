import { describe, expect, it } from "vitest";

import { bookingEventHasEnded, inquiryListWhere } from "@/server/inquiries/inquiry-queue";
import { BOOKING_STATUSES } from "@/types/booking";
import { INQUIRY_LIST_VIEWS } from "@/types/inquiry";

const NOW = new Date("2026-09-27T18:00:00.000Z");

describe("historical inquiry queue", () => {
  it("treats a confirmed event as historical at the exact end instant", () => {
    expect(
      bookingEventHasEnded({
        status: BOOKING_STATUSES.CONFIRMED,
        endsAt: NOW,
        now: NOW,
      }),
    ).toBe(true);
    expect(
      bookingEventHasEnded({
        status: BOOKING_STATUSES.CONFIRMED,
        endsAt: new Date(NOW.getTime() + 1),
        now: NOW,
      }),
    ).toBe(false);
  });

  it("keeps future, cancelled, pending, and unknown rows in the active queue", () => {
    expect(
      bookingEventHasEnded({
        status: BOOKING_STATUSES.CONFIRMED,
        endsAt: new Date("2026-10-01T18:00:00.000Z"),
        now: NOW,
      }),
    ).toBe(false);
    expect(
      bookingEventHasEnded({
        status: BOOKING_STATUSES.CANCELLED,
        endsAt: new Date("2026-09-01T18:00:00.000Z"),
        now: NOW,
      }),
    ).toBe(false);
    expect(
      bookingEventHasEnded({
        status: BOOKING_STATUSES.PENDING_PAYMENT,
        endsAt: new Date("2026-09-01T18:00:00.000Z"),
        now: NOW,
      }),
    ).toBe(false);
    expect(
      bookingEventHasEnded({
        status: BOOKING_STATUSES.CONFIRMED,
        endsAt: null,
        eventDate: null,
        now: NOW,
      }),
    ).toBe(false);
  });

  it("uses the organization calendar date only when endsAt is missing", () => {
    expect(
      bookingEventHasEnded({
        status: BOOKING_STATUSES.COMPLETED,
        endsAt: null,
        eventDate: "2026-09-26",
        timeZone: "UTC",
        now: NOW,
      }),
    ).toBe(true);
    expect(
      bookingEventHasEnded({
        status: BOOKING_STATUSES.CONFIRMED,
        endsAt: null,
        eventDate: "2026-09-27",
        timeZone: "UTC",
        now: NOW,
      }),
    ).toBe(false);
  });

  it("scopes the active and history filters to one organization", () => {
    const active = inquiryListWhere({
      organizationId: "org_a",
      view: INQUIRY_LIST_VIEWS.ACTIVE,
      now: NOW,
      timeZone: "UTC",
    });
    const archived = inquiryListWhere({
      organizationId: "org_a",
      view: INQUIRY_LIST_VIEWS.ARCHIVED,
      now: NOW,
      timeZone: "UTC",
    });
    expect(active.organizationId).toBe("org_a");
    expect(active.archivedAt).toBeNull();
    expect(archived.organizationId).toBe("org_a");
    expect(archived.OR).toBeTruthy();
  });
});
