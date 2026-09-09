import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { EmployeeHeaderBar } from "@/components/layout/employee-header-bar";
import { PublicInquiryLink } from "@/components/layout/public-inquiry-link";

function renderHeader(options: {
  showInquiriesNav?: boolean;
  showBookingsNav?: boolean;
  showScheduleNav?: boolean;
  showTeamNav?: boolean;
  showSecurityNav: boolean;
  showKnowledgeNav?: boolean;
  publicInquiryHref?: string;
  organizationName?: string;
}) {
  return renderToStaticMarkup(
    <EmployeeHeaderBar
      inquiriesNav={options.showInquiriesNav === false ? null : <span>Inquiries</span>}
      bookingsNav={options.showBookingsNav ? <span>Bookings</span> : null}
      scheduleNav={options.showScheduleNav ? <span>Schedule</span> : null}
      teamNav={options.showTeamNav ? <span>Team</span> : null}
      securityNav={options.showSecurityNav ? <span>Security</span> : null}
      knowledgeNav={options.showKnowledgeNav ? <span>AI Knowledge</span> : null}
      publicInquiryAction={
        options.publicInquiryHref ? <PublicInquiryLink href={options.publicInquiryHref} /> : null
      }
      organizationSwitcher={
        <span>{options.organizationName ?? "Generations Adventureplex"}</span>
      }
      userButton={<span>Account</span>}
    />,
  );
}

function accountSlotIndex(html: string) {
  return html.indexOf('data-employee-account');
}

describe("EmployeeHeaderBar", () => {
  it("shows Bookings between Inquiries and Schedule", () => {
    const html = renderHeader({
      showBookingsNav: true,
      showScheduleNav: true,
      showSecurityNav: false,
    });
    expect(html).toContain("Bookings");
    expect(html.indexOf("Inquiries")).toBeLessThan(html.indexOf("Bookings"));
    expect(html.indexOf("Bookings")).toBeLessThan(html.indexOf("Schedule"));
  });

  it("renders the UserButton slot for an authenticated employee", () => {
    const html = renderHeader({ showSecurityNav: false });
    expect(html).toContain("Account");
    expect(html).toContain("MagicCRM");
    expect(html).toContain('data-employee-account');
  });

  it("shows Team before Security for an administrator", () => {
    const html = renderHeader({ showTeamNav: true, showSecurityNav: true });
    expect(html).toContain("Inquiries");
    expect(html).toContain("Team");
    expect(html).toContain("Security");
    expect(html.indexOf("Inquiries")).toBeLessThan(html.indexOf("Team"));
    expect(html.indexOf("Team")).toBeLessThan(html.indexOf("Security"));
    expect(html.indexOf("Security")).toBeLessThan(html.indexOf("Generations Adventureplex"));
  });

  it("hides Security for a non-admin but keeps organization switcher and UserButton", () => {
    const html = renderHeader({ showSecurityNav: false });
    expect(html).not.toContain("Security");
    expect(html).toContain("Generations Adventureplex");
    expect(html).toContain("Account");
  });

  it("keeps UserButton when Security nav is absent or present", () => {
    const withoutSecurity = renderHeader({ showSecurityNav: false });
    const withSecurity = renderHeader({ showSecurityNav: true });
    expect(withoutSecurity).toContain("Account");
    expect(withSecurity).toContain("Account");
    expect(accountSlotIndex(withoutSecurity)).toBeGreaterThan(-1);
    expect(accountSlotIndex(withSecurity)).toBeGreaterThan(-1);
  });

  it("keeps UserButton when Inquiries and AI Knowledge nav are present", () => {
    const html = renderHeader({
      showInquiriesNav: true,
      showKnowledgeNav: true,
      showSecurityNav: true,
    });
    expect(html).toContain("Inquiries");
    expect(html).toContain("AI Knowledge");
    expect(html).toContain("Account");
    expect(html.indexOf("AI Knowledge")).toBeLessThan(accountSlotIndex(html));
  });

  it("renders a new-tab Public Inquiry action without displacing UserButton", () => {
    const html = renderHeader({
      showInquiriesNav: true,
      showTeamNav: true,
      showSecurityNav: true,
      showKnowledgeNav: true,
      publicInquiryHref: "/inquire/fun-center-a",
      organizationName: "Riverside Fun Center North Campus Events And Parties",
    });
    expect(html).toContain("Public Inquiry");
    expect(html).toContain('href="/inquire/fun-center-a"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain("noopener noreferrer");
    expect(html).toContain("Account");
    expect(html).toContain('data-employee-account');
    expect(html.indexOf("Public Inquiry")).toBeLessThan(accountSlotIndex(html));
    expect(html).not.toContain("generations");
  });

  it("keeps UserButton when the organization name is long", () => {
    const html = renderHeader({
      showInquiriesNav: true,
      showTeamNav: true,
      showSecurityNav: true,
      showKnowledgeNav: true,
      organizationName: "Generations Adventureplex North Campus Events And Parties",
    });
    expect(html).toContain("Account");
    expect(html).toContain("Generations Adventureplex North Campus Events And Parties");
    expect(html).toContain("min-w-0");
    expect(html).toContain("shrink-0");
    expect(html.indexOf("Generations Adventureplex North Campus Events And Parties")).toBeLessThan(
      accountSlotIndex(html),
    );
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
});
