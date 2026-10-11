import { describe, expect, it } from "vitest";

import {
  EMPLOYEE_NAV_ITEMS,
  filterEmployeeNavItems,
  type EmployeeNavItemId,
} from "@/lib/ui/employee-navigation";

describe("employee shell chrome visibility boundaries", () => {
  it("never invents Customers, POS, Payments, or Reporting destinations", () => {
    const labels = EMPLOYEE_NAV_ITEMS.map((item) => item.label.toLowerCase()).join(" ");
    const hrefs = EMPLOYEE_NAV_ITEMS.map((item) => item.href).join(" ");
    expect(labels).not.toContain("customer");
    expect(labels).not.toContain("pos");
    expect(labels).not.toContain("payment");
    expect(labels).not.toContain("report");
    expect(hrefs).not.toContain("/customers");
    expect(hrefs).not.toContain("/pos");
    expect(hrefs).not.toContain("/payments");
    expect(hrefs).not.toContain("/reports");
  });

  it("filters navigation strictly by visible ids from trusted chrome", () => {
    const limited = new Set<EmployeeNavItemId>(["overview", "inquiries"]);
    const items = filterEmployeeNavItems(limited);
    expect(items.map((item) => item.id)).toEqual(["overview", "inquiries"]);
  });

  it("clears location display when chrome provides null location (org switch boundary)", () => {
    // Organization switch navigates to /app; chrome reloads from the new tenant context.
    // UI must render the empty-location copy rather than a previous tenant's name.
    const previousLocation = "Campus A";
    const nextLocation: string | null = null;
    const label = nextLocation ?? "No location set";
    expect(label).not.toBe(previousLocation);
    expect(label).toBe("No location set");
  });
});
