import { describe, expect, it } from "vitest";

import {
  calendarDateInTimeZone,
  eventLocalSlotDate,
  eventLocalToUtc,
  FALLBACK_TIME_ZONE,
  formatEventLocalDate,
  formatEventLocalDateTime,
  formatEventLocalTime,
  formatItineraryLine,
  formatItineraryRange,
  formatItineraryTime,
  formatOrganizationTimestamp,
  formatTenantTimestamp,
  isValidIanaTimeZone,
  occupancyInstants,
  resolveOrganizationTimeZone,
  resolveSchedulingTimeZone,
  resolveTenantTimezone,
  tenantLocalDayBounds,
} from "@/lib/inquiries/tenant-datetime";
import { weekdayKeyFromIsoDate } from "@/server/catalog/pricing";

describe("tenant date/time display", () => {
  it("formats an event-local date and 19:00 without shifting the calendar day", () => {
    const storedDate = new Date("2026-09-11T00:00:00.000Z");
    expect(formatEventLocalDate(storedDate)).toBe("Sep 11, 2026");
    expect(formatEventLocalTime("19:00")).toBe("7:00 PM");
    expect(formatEventLocalDateTime({ date: storedDate, time: "19:00" })).toBe(
      "Sep 11, 2026 at 7:00 PM",
    );
  });

  it("formats itinerary wall-clock times in 12-hour display without UTC conversion", () => {
    expect(formatItineraryTime("00:00")).toBe("12:00 AM");
    expect(formatItineraryTime("09:30")).toBe("9:30 AM");
    expect(formatItineraryTime("12:00")).toBe("12:00 PM");
    expect(formatItineraryTime("17:30")).toBe("5:30 PM");
    expect(formatItineraryTime("23:45")).toBe("11:45 PM");
    expect(formatItineraryRange("17:30", "18:30")).toBe("5:30 PM–6:30 PM");
    expect(formatItineraryLine("17:30–18:30 Fajita Bar")).toBe("5:30 PM–6:30 PM Fajita Bar");
    expect(formatItineraryLine("18:30–19:00 Axe Throwing")).toBe("6:30 PM–7:00 PM Axe Throwing");
    expect(formatItineraryRange("18:30", "19:30")).toBe("6:30 PM–7:30 PM");
    expect(formatItineraryRange("19:30", "20:30")).toBe("7:30 PM–8:30 PM");
    expect(formatItineraryTime("17:30")).not.toBe("1:30 PM");
  });

  it("formats date only, time only, and missing values", () => {
    expect(formatEventLocalDateTime({ date: "2026-09-11", time: null })).toBe("Sep 11, 2026");
    expect(formatEventLocalDateTime({ date: null, time: "19:00" })).toBe("7:00 PM");
    expect(formatEventLocalDateTime({ date: null, time: null })).toBe("Not specified");
  });

  it("does not treat an event-local wall clock as a UTC instant", () => {
    const storedDate = new Date("2026-09-11T00:00:00.000Z");
    const shiftedIfConverted = new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "America/Los_Angeles",
    }).format(storedDate);
    expect(formatEventLocalDate(storedDate)).toBe("Sep 11, 2026");
    expect(formatEventLocalDate(storedDate)).not.toBe(shiftedIfConverted);
    expect(formatEventLocalTime("19:00")).not.toBe("3:00 PM");
    expect(formatEventLocalTime("19:00")).not.toBe("11:00 PM");
  });

  it("converts timestamps into the organization timezone", () => {
    const instant = new Date("2026-09-17T01:30:00.000Z");
    expect(formatOrganizationTimestamp(instant, "America/Indiana/Indianapolis")).toBe(
      "Sep 16, 2026 at 9:30 PM",
    );
    expect(formatTenantTimestamp(instant, "America/New_York")).toBe("Sep 16, 2026 at 9:30 PM");
    expect(formatOrganizationTimestamp(instant, "America/Los_Angeles")).toBe(
      "Sep 16, 2026 at 6:30 PM",
    );
  });

  it("does not let one tenant timezone rewrite another tenant's timestamp", () => {
    const instant = new Date("2026-09-11T23:00:00.000Z");
    const tenantA = formatOrganizationTimestamp(instant, "America/New_York");
    const tenantB = formatOrganizationTimestamp(instant, "America/Los_Angeles");
    expect(tenantA).not.toBe(tenantB);
    expect(tenantA).toContain("7:00 PM");
    expect(tenantB).toContain("4:00 PM");
  });

  it("validates IANA timezones and does not treat the literal IANA as a zone", () => {
    expect(isValidIanaTimeZone("America/Indiana/Indianapolis")).toBe(true);
    expect(isValidIanaTimeZone("America/Chicago")).toBe(true);
    expect(isValidIanaTimeZone("UTC")).toBe(true);
    expect(isValidIanaTimeZone("IANA")).toBe(false);
    expect(isValidIanaTimeZone("")).toBe(false);
    expect(isValidIanaTimeZone(null)).toBe(false);
    expect(resolveOrganizationTimeZone("IANA")).toBe(FALLBACK_TIME_ZONE);
    expect(resolveOrganizationTimeZone("America/New_York")).toBe("America/New_York");
    expect(resolveOrganizationTimeZone(null)).toBe(FALLBACK_TIME_ZONE);
    expect(resolveTenantTimezone({ organizationTimezone: "IANA" })).toBe("UTC");
    expect(
      resolveTenantTimezone({
        locationTimezone: "IANA",
        organizationTimezone: "America/Chicago",
      }),
    ).toBe("America/Chicago");
    const instant = new Date("2026-09-11T23:00:00.000Z");
    expect(formatOrganizationTimestamp(instant, "IANA")).toBe(
      formatOrganizationTimestamp(instant, "UTC"),
    );
  });

  it("converts tenant-local 7:00 PM into a UTC instant, not 19:00Z", () => {
    const startsAt = eventLocalToUtc({
      date: "2026-09-17",
      minuteOfDay: 19 * 60,
      timeZone: "America/New_York",
    });
    expect(startsAt.toISOString()).toBe("2026-09-17T23:00:00.000Z");
    expect(startsAt.toISOString()).not.toBe("2026-09-17T19:00:00.000Z");
    const window = occupancyInstants({
      slotDate: "2026-09-17",
      startMinute: 19 * 60,
      endMinute: 21 * 60,
      timeZone: "America/New_York",
    });
    expect(window.endsAt.toISOString()).toBe("2026-09-18T01:00:00.000Z");
  });

  it("uses the tenant timezone for calendar-day schedule stamps", () => {
    const lateUtc = new Date("2026-09-18T02:00:00.000Z");
    expect(calendarDateInTimeZone(lateUtc, "America/New_York")).toBe("2026-09-17");
    expect(calendarDateInTimeZone(lateUtc, "America/Indiana/Indianapolis")).toBe("2026-09-17");
    expect(calendarDateInTimeZone(lateUtc, "UTC")).toBe("2026-09-18");
  });

  it("resolves a tenant-local schedule date as that civil day, not the UTC calendar day", () => {
    expect(eventLocalSlotDate("2026-09-17").toISOString()).toBe("2026-09-17T00:00:00.000Z");
    const indianapolis = tenantLocalDayBounds("2026-09-17", "America/Indiana/Indianapolis");
    expect(indianapolis.start.toISOString()).toBe("2026-09-17T04:00:00.000Z");
    expect(indianapolis.nextStart.toISOString()).toBe("2026-09-18T04:00:00.000Z");
    const utcDay = tenantLocalDayBounds("2026-09-17", "UTC");
    expect(utcDay.start.toISOString()).toBe("2026-09-17T00:00:00.000Z");
  });

  it("keeps occupancy instants DST-safe around the spring-forward gap", () => {
    const before = eventLocalToUtc({
      date: "2026-03-08",
      minuteOfDay: 90,
      timeZone: "America/New_York",
    });
    const after = eventLocalToUtc({
      date: "2026-03-08",
      minuteOfDay: 210,
      timeZone: "America/New_York",
    });
    expect(before.toISOString()).toBe("2026-03-08T06:30:00.000Z");
    expect(after.toISOString()).toBe("2026-03-08T07:30:00.000Z");
  });

  it("prefers a valid location timezone over the organization timezone, including UTC", () => {
    expect(
      resolveSchedulingTimeZone({
        locationTimeZone: "UTC",
        organizationTimeZone: "America/Indiana/Indianapolis",
      }),
    ).toBe("UTC");
    expect(
      resolveSchedulingTimeZone({
        locationTimeZone: "America/Indiana/Indianapolis",
        organizationTimeZone: "UTC",
      }),
    ).toBe("America/Indiana/Indianapolis");
    expect(
      resolveSchedulingTimeZone({
        locationTimeZone: null,
        organizationTimeZone: "America/Chicago",
      }),
    ).toBe("America/Chicago");
  });

  it("does not globally reject UTC as a legitimate scheduling zone", () => {
    const utcWindow = occupancyInstants({
      slotDate: "2026-10-15",
      startMinute: 18 * 60,
      endMinute: 20 * 60,
      timeZone: "UTC",
    });
    expect(utcWindow.startsAt.toISOString()).toBe("2026-10-15T18:00:00.000Z");
  });

  it("converts Indiana venue-local clocks to the correct UTC instants (EDT offset)", () => {
    const indiana = occupancyInstants({
      slotDate: "2026-10-15",
      startMinute: 18 * 60,
      endMinute: 20 * 60,
      timeZone: "America/Indiana/Indianapolis",
    });
    const asUtc = occupancyInstants({
      slotDate: "2026-10-15",
      startMinute: 18 * 60,
      endMinute: 20 * 60,
      timeZone: "UTC",
    });
    expect(indiana.startsAt.toISOString()).toBe("2026-10-15T22:00:00.000Z");
    expect(asUtc.startsAt.toISOString()).toBe("2026-10-15T18:00:00.000Z");
    expect(
      (asUtc.startsAt.getTime() - indiana.startsAt.getTime()) / 60000,
    ).toBe(-240);
  });

  it("keeps near-midnight Indiana events on the correct UTC calendar day", () => {
    const late = occupancyInstants({
      slotDate: "2026-10-18",
      startMinute: 23 * 60,
      endMinute: 25 * 60,
      timeZone: "America/Indiana/Indianapolis",
    });
    expect(late.startsAt.toISOString()).toBe("2026-10-19T03:00:00.000Z");
    expect(late.endsAt.toISOString()).toBe("2026-10-19T05:00:00.000Z");
  });

  it("keeps legacy permissive eventLocalToUtc fold for historical compatibility only", () => {
    // R2D.2: new writes must use resolveStrictEventLocalToUtc (rejects gap/ambiguity).
    const gap = eventLocalToUtc({
      date: "2026-03-08",
      minuteOfDay: 2 * 60 + 30,
      timeZone: "America/Indiana/Indianapolis",
    });
    const pre = eventLocalToUtc({
      date: "2026-03-08",
      minuteOfDay: 90,
      timeZone: "America/Indiana/Indianapolis",
    });
    expect(gap.toISOString()).toBe(pre.toISOString());
    const ambiguous = eventLocalToUtc({
      date: "2026-11-01",
      minuteOfDay: 90,
      timeZone: "America/Indiana/Indianapolis",
    });
    expect(ambiguous.toISOString()).toBe("2026-11-01T05:30:00.000Z");
  });

  it("keeps promotion weekdays on the civil event date across time zones", () => {
    expect(weekdayKeyFromIsoDate("2026-10-15", "UTC")).toBe("thu");
    expect(weekdayKeyFromIsoDate("2026-10-15", "America/Indiana/Indianapolis")).toBe("thu");
    expect(weekdayKeyFromIsoDate("2026-10-16", "UTC")).toBe("fri");
    // A Thursday 6pm Indiana event is still Friday in UTC, but promo weekday stays thu.
    const indiana = eventLocalToUtc({
      date: "2026-10-15",
      minuteOfDay: 18 * 60,
      timeZone: "America/Indiana/Indianapolis",
    });
    expect(indiana.toISOString()).toBe("2026-10-15T22:00:00.000Z");
    expect(weekdayKeyFromIsoDate("2026-10-15")).toBe("thu");
    expect(indiana.toISOString().slice(0, 10)).toBe("2026-10-15");
  });

  it("isolates multi-tenant and multi-location timezone conversion", () => {
    const indiana = eventLocalToUtc({
      date: "2026-10-15",
      minuteOfDay: 18 * 60,
      timeZone: "America/Indiana/Indianapolis",
    });
    const pacific = eventLocalToUtc({
      date: "2026-10-15",
      minuteOfDay: 18 * 60,
      timeZone: "America/Los_Angeles",
    });
    const utcTenant = eventLocalToUtc({
      date: "2026-10-15",
      minuteOfDay: 18 * 60,
      timeZone: "UTC",
    });
    expect(indiana.toISOString()).toBe("2026-10-15T22:00:00.000Z");
    expect(pacific.toISOString()).toBe("2026-10-16T01:00:00.000Z");
    expect(utcTenant.toISOString()).toBe("2026-10-15T18:00:00.000Z");
    expect(indiana.toISOString()).not.toBe(pacific.toISOString());
    expect(utcTenant.toISOString()).not.toBe(indiana.toISOString());
  });
});
