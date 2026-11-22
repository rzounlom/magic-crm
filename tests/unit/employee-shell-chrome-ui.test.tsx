/** @vitest-environment jsdom */

import { readFileSync } from "node:fs";
import path from "node:path";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AppOverflowMenu } from "@/components/layout/app-overflow-menu";
import { EmployeeSidebar } from "@/components/layout/employee-sidebar";
import { EmployeeTopBar } from "@/components/layout/employee-top-bar";
import { OrganizationLocationContext } from "@/components/layout/organization-location-context";
import type { EmployeeNavItemId } from "@/lib/ui/employee-navigation";

vi.mock("next/navigation", () => ({
  usePathname: () => "/app/inquiries",
}));

afterEach(() => {
  cleanup();
});

function renderTopBar(options: {
  publicInquiryHref?: string | null;
  organizationName?: string;
  locationName?: string | null;
}) {
  return renderToStaticMarkup(
    <EmployeeTopBar
      publicInquiryHref={options.publicInquiryHref ?? null}
      organizationName={options.organizationName ?? "Riverside Fun Center"}
      locationName={options.locationName === undefined ? "North Campus" : options.locationName}
      organizationSwitcher={<span>OrgSwitcher</span>}
      userButton={<span>Account</span>}
    />,
  );
}

describe("EmployeeTopBar", () => {
  it("shows ambient org/location without a bordered chip control", () => {
    const html = renderTopBar({});
    expect(html).toContain("data-employee-context");
    expect(html).toContain("Riverside Fun Center");
    expect(html).toContain("North Campus");
    expect(html).not.toContain("border-border-subtle bg-surface px-2.5");
    expect(html).toContain("Account");
    expect(html).toContain("OrgSwitcher");
  });

  it("does not render a primary Public Inquiry button", () => {
    const html = renderTopBar({ publicInquiryHref: "/inquire/fun-center-a" });
    expect(html).not.toContain(">Public Inquiry<");
    expect(html).toContain("data-employee-overflow");
    expect(html).toContain("Account");
  });

  it("keeps UserButton when the organization name is long", () => {
    const html = renderTopBar({
      organizationName: "Riverside Fun Center North Campus Events And Parties",
    });
    expect(html).toContain("Account");
    expect(html).toContain("Riverside Fun Center North Campus Events And Parties");
  });

  it("does not gate the UserButton on application permissions", () => {
    const controls = readFileSync(
      path.join(process.cwd(), "src/components/layout/employee-organization-controls.tsx"),
      "utf8",
    );
    const shell = readFileSync(
      path.join(process.cwd(), "src/components/layout/employee-shell.tsx"),
      "utf8",
    );
    const topBar = readFileSync(
      path.join(process.cwd(), "src/components/layout/employee-top-bar.tsx"),
      "utf8",
    );

    for (const source of [controls, shell, topBar]) {
      expect(source).not.toContain("hasPermission");
      expect(source).not.toContain("SECURITY_GROUPS");
      expect(source).not.toContain("crm.inquiries.view");
    }

    expect(shell).toContain("EmployeeSidebar");
    expect(shell).toContain("EmployeeTopBar");
    expect(shell).toContain("userButton={<EmployeeUserButton />}");
  });
});

describe("EmployeeSidebar", () => {
  it("groups Primary, Tools, and Settings with permission filtering", () => {
    const html = renderToStaticMarkup(
      <EmployeeSidebar
        visibleNavIds={
          [
            "overview",
            "inquiries",
            "bookings",
            "schedule",
            "salesKnowledge",
            "resources",
            "team",
            "security",
            "catalogSync",
          ] as EmployeeNavItemId[]
        }
      />,
    );
    expect(html).toContain('aria-label="Primary"');
    expect(html).toContain('aria-label="Tools"');
    expect(html).toContain('aria-label="Settings"');
    expect(html.indexOf('href="/app/inquiries"')).toBeLessThan(html.indexOf('href="/app/bookings"'));
    expect(html.indexOf("Sales knowledge")).toBeLessThan(html.indexOf("Resources"));
    expect(html.indexOf("Team")).toBeLessThan(html.indexOf("Security"));
    expect(html.indexOf("Security")).toBeLessThan(html.indexOf("Catalog sync"));
  });

  it("hides unauthorized destinations", () => {
    const html = renderToStaticMarkup(
      <EmployeeSidebar visibleNavIds={["overview", "inquiries"] as EmployeeNavItemId[]} />,
    );
    expect(html).toContain("Inquiries");
    expect(html).not.toContain("Security");
    expect(html).not.toContain("Sales knowledge");
  });
});

describe("OrganizationLocationContext", () => {
  it("renders read-only location text", () => {
    const html = renderToStaticMarkup(
      <OrganizationLocationContext organizationName="Venue Co" locationName="Main Location" />,
    );
    expect(html).toContain("Venue Co");
    expect(html).toContain("Main Location");
    expect(html).not.toContain("<button");
  });
});

describe("AppOverflowMenu", () => {
  it("exposes Public inquiry as a working new-tab menu item", () => {
    render(<AppOverflowMenu publicInquiryHref="/inquire/alpha" />);
    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    const link = screen.getByRole("menuitem", { name: /public inquiry/i });
    expect(link.getAttribute("href")).toBe("/inquire/alpha");
    expect(link.getAttribute("target")).toBe("_blank");
  });

  it("renders nothing when there are no overflow actions", () => {
    const { container } = render(<AppOverflowMenu publicInquiryHref={null} />);
    expect(container.innerHTML).toBe("");
  });
});
