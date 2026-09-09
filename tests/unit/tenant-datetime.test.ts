import { describe, expect, it } from "vitest";

import {
  formatEventLocalDate,
  formatEventLocalDateTime,
  formatEventLocalTime,
  formatOrganizationTimestamp,
  resolveOrganizationTimeZone,
} from "@/lib/inquiries/tenant-datetime";

describe("tenant date/time display", () => {
  it("formats an event-local date and 19:00 without shifting the calendar day", () => {
    const storedDate = new Date("2026-09-11T00:00:00.000Z");
    expect(formatEventLocalDate(storedDate)).toBe("Sep 11, 2026");
    expect(formatEventLocalTime("19:00")).toBe("7:00 PM");
    expect(formatEventLocalDateTime({ date: storedDate, time: "19:00" })).toBe(
      "Sep 11, 2026 at 7:00 PM",
    );
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
    const instant = new Date("2026-09-11T23:00:00.000Z");
    expect(formatOrganizationTimestamp(instant, "America/New_York")).toBe("Sep 11, 2026 at 7:00 PM");
    expect(formatOrganizationTimestamp(instant, "America/Los_Angeles")).toBe(
      "Sep 11, 2026 at 4:00 PM",
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

  it("falls back to UTC when the stored timezone is not a valid IANA zone", () => {
    const instant = new Date("2026-09-11T23:00:00.000Z");
    expect(resolveOrganizationTimeZone("IANA")).toBe("UTC");
    expect(resolveOrganizationTimeZone("America/New_York")).toBe("America/New_York");
    expect(formatOrganizationTimestamp(instant, "IANA")).toBe(
      formatOrganizationTimestamp(instant, "UTC"),
    );
  });
});
