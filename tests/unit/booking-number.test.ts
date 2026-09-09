import { describe, expect, it } from "vitest";

import { bookingNumberPrefix, formatBookingNumber } from "@/lib/bookings/booking-number";

describe("booking number", () => {
  it("uses the first three alphanumeric characters of the organization slug", () => {
    expect(bookingNumberPrefix("fun-center")).toBe("FUN");
    expect(bookingNumberPrefix("ab")).toBe("ABX");
    expect(bookingNumberPrefix("***")).toBe("XXX");
  });

  it("formats a tenant-safe public reference instead of a database id", () => {
    expect(formatBookingNumber("FUN", 2026, 421)).toBe("FUN-2026-00421");
  });
});
