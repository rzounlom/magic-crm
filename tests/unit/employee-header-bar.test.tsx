import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { EmployeeHeaderBar } from "@/components/layout/employee-header-bar";
import type { EmployeeNavItemId } from "@/lib/ui/employee-navigation";

vi.mock("next/navigation", () => ({
  usePathname: () => "/app/inquiries",
}));

function renderHeader(options: {
  visibleNavIds?: EmployeeNavItemId[];
  publicInquiryHref?: string;
  organizationName?: string;
  locationName?: string | null;
}) {
  return renderToStaticMarkup(
    <EmployeeHeaderBar
      visibleNavIds={
        options.visibleNavIds ?? ["overview", "inquiries", "bookings", "schedule", "team", "security"]
      }
      publicInquiryHref={options.publicInquiryHref ?? null}
      organizationName={options.organizationName ?? "Riverside Fun Center"}
      locationName={options.locationName === undefined ? "North Campus" : options.locationName}
      organizationSwitcher={<span>OrgSwitcher</span>}
      userButton={<span>Account</span>}
    />,
  );
}

function accountSlotIndex(html: string) {
  return html.indexOf("data-employee-account");
}

describe("EmployeeHeaderBar", () => {
  it("groups Bookings & Events with Inquiries before Bookings before Schedule", () => {
    const html = renderHeader({
      visibleNavIds: ["overview", "inquiries", "bookings", "schedule"],
    });
    expect(html).toContain('aria-label="Bookings &amp; Events"');
    expect(html.indexOf('href="/app/inquiries"')).toBeLessThan(html.indexOf('href="/app/bookings"'));
    expect(html.indexOf('href="/app/bookings"')).toBeLessThan(html.indexOf('href="/app/schedule"'));
  });

  it("renders the UserButton slot for an authenticated employee", () => {
    const html = renderHeader({});
    expect(html).toContain("Account");
    expect(html).toContain("MagicCRM");
    expect(html).toContain("data-employee-account");
  });

  it("shows Team before Security under Settings for an administrator", () => {
    const html = renderHeader({
      visibleNavIds: ["overview", "inquiries", "team", "security"],
    });
    expect(html).toContain("Inquiries");
    expect(html).toContain("Team");
    expect(html).toContain("Security");
    expect(html).toContain('aria-label="Settings"');
    expect(html.indexOf("Team")).toBeLessThan(html.indexOf("Security"));
    expect(html.indexOf("Security")).toBeLessThan(html.indexOf("OrgSwitcher"));
  });

  it("hides Security for a non-admin but keeps organization switcher and UserButton", () => {
    const html = renderHeader({
      visibleNavIds: ["overview", "inquiries"],
    });
    expect(html).not.toContain(">Security<");
    expect(html).toContain("OrgSwitcher");
    expect(html).toContain("Account");
  });

  it("shows trusted location context without inventing a location", () => {
    const withLocation = renderHeader({ locationName: "North Campus" });
    expect(withLocation).toContain("data-employee-context");
    expect(withLocation).toContain("North Campus");
    expect(withLocation).toContain("Riverside Fun Center");

    const withoutLocation = renderHeader({ locationName: null });
    expect(withoutLocation).toContain("No location set");
  });

  it("renders Catalog labels for sales knowledge and resources", () => {
    const html = renderHeader({
      visibleNavIds: ["overview", "salesKnowledge", "resources"],
    });
    expect(html).toContain("Sales knowledge");
    expect(html).toContain("Resources");
    expect(html).toContain('aria-label="Catalog"');
    expect(html).not.toContain("AI Knowledge");
  });

  it("renders a new-tab Public Inquiry action without displacing UserButton", () => {
    const html = renderHeader({
      visibleNavIds: ["overview", "inquiries", "team", "security", "salesKnowledge"],
      publicInquiryHref: "/inquire/fun-center-a",
      organizationName: "Riverside Fun Center North Campus Events And Parties",
    });
    expect(html).toContain("Public Inquiry");
    expect(html).toContain('href="/inquire/fun-center-a"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain("noopener noreferrer");
    expect(html).toContain("Account");
    expect(html).toContain("data-employee-account");
    expect(html.indexOf("Public Inquiry")).toBeLessThan(accountSlotIndex(html));
    expect(html).not.toContain("generations");
  });

  it("keeps UserButton when the organization name is long", () => {
    const html = renderHeader({
      organizationName: "Riverside Fun Center North Campus Events And Parties",
    });
    expect(html).toContain("Account");
    expect(html).toContain("Riverside Fun Center North Campus Events And Parties");
    expect(html).toContain("min-w-0");
    expect(html).toContain("shrink-0");
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
    const header = readFileSync(
      path.join(process.cwd(), "src/components/layout/employee-header-bar.tsx"),
      "utf8",
    );

    for (const source of [controls, shell, header]) {
      expect(source).not.toContain("hasPermission");
      expect(source).not.toContain("SECURITY_GROUPS");
      expect(source).not.toContain("security_groups.view");
      expect(source).not.toContain("users.view");
      expect(source).not.toContain("ai.view");
      expect(source).not.toContain("ai.manage");
      expect(source).not.toContain("crm.inquiries.view");
      expect(source).not.toContain("crm.inquiries.manage");
    }

    expect(controls).toContain("UserButton");
    expect(shell).toContain("EmployeeUserButton");
    expect(shell).toContain("userButton={<EmployeeUserButton />}");
  });

  it("keeps desktop module nav hidden below the lg breakpoint via class", () => {
    const html = renderHeader({
      visibleNavIds: ["overview", "inquiries", "bookings", "schedule"],
    });
    expect(html).toContain('aria-label="Modules"');
    expect(html).toContain("hidden");
    expect(html).toContain("lg:flex");
  });
});
