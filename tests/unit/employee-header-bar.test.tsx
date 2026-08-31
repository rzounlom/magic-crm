import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { EmployeeHeaderBar } from "@/components/layout/employee-header-bar";

function renderHeader(options: { showSecurityNav: boolean; organizationName?: string }) {
  return renderToStaticMarkup(
    <EmployeeHeaderBar
      securityNav={options.showSecurityNav ? <span>Security</span> : null}
      organizationSwitcher={
        <span>{options.organizationName ?? "Generations Adventureplex"}</span>
      }
      userButton={<span>Account</span>}
    />,
  );
}

describe("EmployeeHeaderBar", () => {
  it("renders the UserButton slot for an authenticated employee", () => {
    const html = renderHeader({ showSecurityNav: false });
    expect(html).toContain("Account");
    expect(html).toContain("MagicCRM");
  });

  it("shows Security, organization switcher, and UserButton for an admin", () => {
    const html = renderHeader({ showSecurityNav: true });
    expect(html).toContain("Security");
    expect(html).toContain("Generations Adventureplex");
    expect(html).toContain("Account");
    expect(html.indexOf("Security")).toBeLessThan(html.indexOf("Generations Adventureplex"));
    expect(html.indexOf("Generations Adventureplex")).toBeLessThan(html.indexOf("Account"));
  });

  it("hides Security for a non-admin but keeps organization switcher and UserButton", () => {
    const html = renderHeader({ showSecurityNav: false });
    expect(html).not.toContain("Security");
    expect(html).toContain("Generations Adventureplex");
    expect(html).toContain("Account");
  });

  it("keeps UserButton when Security nav is absent", () => {
    const withoutSecurity = renderHeader({ showSecurityNav: false });
    const withSecurity = renderHeader({ showSecurityNav: true });
    expect(withoutSecurity).toContain("Account");
    expect(withSecurity).toContain("Account");
  });

  it("keeps UserButton when the organization name is long", () => {
    const html = renderHeader({
      showSecurityNav: true,
      organizationName: "Generations Adventureplex North Campus Events And Parties",
    });
    expect(html).toContain("Account");
    expect(html).toContain("Generations Adventureplex North Campus Events And Parties");
    expect(html).toContain("min-w-0");
    expect(html).toContain("shrink-0");
  });

  it("does not gate the UserButton on security_groups.view", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src/components/layout/employee-organization-controls.tsx"),
      "utf8",
    );
    expect(source).toContain("UserButton");
    expect(source).not.toContain("SECURITY_GROUPS");
    expect(source).not.toContain("hasPermission");
    expect(source).not.toContain("security_groups.view");
  });
});
