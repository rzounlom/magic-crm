import { describe, expect, it } from "vitest";

import { resolveUserGreetingName } from "@/lib/identity/user-display";
import {
  formatDashboardDateLabel,
  formatDashboardGreeting,
} from "@/lib/ui/employee-dashboard-copy";

describe("employee dashboard helpers", () => {
  it("greets with first name and never leads with email", () => {
    expect(
      resolveUserGreetingName({
        clerkUserId: "user_1",
        firstName: "Alex",
        lastName: "Jones",
        displayName: null,
        email: "alex@example.com",
      }),
    ).toBe("Alex");
    expect(
      resolveUserGreetingName({
        clerkUserId: "user_2",
        firstName: null,
        lastName: null,
        displayName: "Sam Rivera",
        email: "sam@example.com",
      }),
    ).toBe("Sam");
  });

  it("formats greeting and date in the provided timezone", () => {
    const noonUtc = new Date("2026-11-22T17:00:00.000Z");
    expect(formatDashboardGreeting("Alex", "America/New_York", noonUtc)).toBe(
      "Good afternoon, Alex",
    );
    expect(formatDashboardDateLabel("America/New_York", noonUtc)).toContain("Nov");
    expect(formatDashboardDateLabel("America/New_York", noonUtc)).toContain("22");
  });
});
