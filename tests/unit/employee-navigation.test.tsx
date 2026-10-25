/** @vitest-environment jsdom */

import { readFileSync } from "node:fs";
import path from "node:path";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EmployeeMobileNav } from "@/components/layout/employee-mobile-nav";
import { ModuleNavLink } from "@/components/ui/module-nav-link";
import {
  EMPLOYEE_NAV_ITEMS,
  isEmployeeNavActive,
  mobileMoreNavItems,
  mobilePrimaryNavItems,
} from "@/lib/ui/employee-navigation";
import { PERMISSIONS } from "@/types/permissions";

const pathnameRef = { current: "/app/inquiries" };

vi.mock("next/navigation", () => ({
  usePathname: () => pathnameRef.current,
}));

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute("open");
  };
});

afterEach(() => {
  cleanup();
  pathnameRef.current = "/app/inquiries";
});

describe("employee navigation helpers", () => {
  it("maps existing routes to existing permissions", () => {
    const byId = Object.fromEntries(EMPLOYEE_NAV_ITEMS.map((item) => [item.id, item]));
    expect(byId.inquiries.permission).toBe(PERMISSIONS.CRM_INQUIRIES_VIEW);
    expect(byId.bookings.permission).toBe(PERMISSIONS.EVENTS_VIEW);
    expect(byId.schedule.permission).toBe(PERMISSIONS.CALENDAR_VIEW);
    expect(byId.resources.permission).toBe(PERMISSIONS.INVENTORY_MANAGE);
    expect(byId.catalogSync.permission).toBe(PERMISSIONS.CATALOG_MANAGE);
    expect(byId.team.permission).toBe(PERMISSIONS.USERS_VIEW);
    expect(byId.security.permission).toBe(PERMISSIONS.SECURITY_GROUPS_VIEW);
    expect(byId.salesKnowledge.permission).toBe(PERMISSIONS.AI_VIEW);
    expect(byId.overview.permission).toBeNull();
  });

  it("keeps existing route URLs", () => {
    const hrefs = EMPLOYEE_NAV_ITEMS.map((item) => item.href);
    expect(hrefs).toContain("/app");
    expect(hrefs).toContain("/app/inquiries");
    expect(hrefs).toContain("/app/bookings");
    expect(hrefs).toContain("/app/schedule");
    expect(hrefs).toContain("/app/admin/resources");
    expect(hrefs).toContain("/app/admin/catalog-sync");
    expect(hrefs).toContain("/app/admin/team");
    expect(hrefs).toContain("/app/admin/security-groups");
    expect(hrefs).toContain("/app/admin/ai/knowledge");
  });

  it("orders mobile primary destinations Inquiries → Schedule → Bookings", () => {
    const visible = new Set(
      EMPLOYEE_NAV_ITEMS.map((item) => item.id).filter((id) => id !== "overview"),
    );
    expect(mobilePrimaryNavItems(visible).map((item) => item.id)).toEqual([
      "inquiries",
      "schedule",
      "bookings",
    ]);
  });

  it("puts Overview, Catalog, and Settings into More", () => {
    const visible = new Set(EMPLOYEE_NAV_ITEMS.map((item) => item.id));
    const moreIds = mobileMoreNavItems(visible).map((item) => item.id);
    expect(moreIds).toContain("overview");
    expect(moreIds).toContain("salesKnowledge");
    expect(moreIds).toContain("resources");
    expect(moreIds).toContain("catalogSync");
    expect(moreIds).toContain("team");
    expect(moreIds).toContain("security");
    expect(moreIds).not.toContain("inquiries");
  });

  it("treats Overview as exact /app only", () => {
    expect(isEmployeeNavActive("/app", "/app")).toBe(true);
    expect(isEmployeeNavActive("/app/inquiries", "/app")).toBe(false);
    expect(isEmployeeNavActive("/app/inquiries/abc", "/app/inquiries")).toBe(true);
  });
});

describe("ModuleNavLink active route", () => {
  it("sets aria-current for the active module", () => {
    pathnameRef.current = "/app/bookings/new";
    render(<ModuleNavLink href="/app/bookings">Bookings</ModuleNavLink>);
    expect(screen.getByRole("link", { name: "Bookings" }).getAttribute("aria-current")).toBe(
      "page",
    );
  });

  it("does not mark Overview active on nested /app routes", () => {
    pathnameRef.current = "/app/schedule";
    render(<ModuleNavLink href="/app">Overview</ModuleNavLink>);
    expect(screen.getByRole("link", { name: "Overview" }).getAttribute("aria-current")).toBeNull();
  });
});

describe("EmployeeMobileNav", () => {
  it("renders permitted primary links and keeps public intake in More", async () => {
    pathnameRef.current = "/app/schedule";
    render(
      <EmployeeMobileNav
        visibleNavIds={["overview", "inquiries", "schedule", "bookings", "team"]}
        publicInquiryHref="/inquire/alpha"
      />,
    );

    expect(screen.getByRole("navigation", { name: "Primary" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Inquiries" }).getAttribute("href")).toBe(
      "/app/inquiries",
    );
    expect(screen.getByRole("link", { name: "Schedule" }).getAttribute("aria-current")).toBe(
      "page",
    );
    expect(screen.getByRole("link", { name: "Bookings" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Team" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "More" }));
    await waitFor(() => {
      expect(screen.getByRole("dialog", { name: "More" })).toBeTruthy();
    });
    expect(screen.getByRole("link", { name: "Overview" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Team" })).toBeTruthy();
    const publicLink = screen.getByRole("link", { name: /public inquiry/i });
    expect(publicLink.getAttribute("href")).toBe("/inquire/alpha");
    expect(publicLink.getAttribute("target")).toBe("_blank");
  });

  it("omits unauthorized destinations from mobile navigation", () => {
    render(
      <EmployeeMobileNav visibleNavIds={["overview", "inquiries"]} publicInquiryHref={null} />,
    );
    expect(screen.getByRole("link", { name: "Inquiries" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Schedule" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Bookings" })).toBeNull();
  });
});

describe("sticky offset tokens", () => {
  it("defines shared header and mobile nav offset tokens", () => {
    const tokens = readFileSync(path.join(process.cwd(), "src/styles/tokens.css"), "utf8");
    expect(tokens).toContain("--header-offset");
    expect(tokens).toContain("--mobile-nav-offset");
    expect(tokens).toContain("--booking-action-bar-offset");
    const actions = readFileSync(
      path.join(process.cwd(), "src/components/layout/live-agent-booking-actions.tsx"),
      "utf8",
    );
    expect(actions).toContain("top-[var(--header-offset)]");
    expect(actions).toContain("data-booking-mobile-action-bar");
    expect(actions).not.toContain("top-20");
  });
});
