/** @vitest-environment jsdom */

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { TeamSectionTabs } from "@/components/layout/team-section-tabs";

afterEach(() => {
  cleanup();
});

describe("team section tabs", () => {
  it("marks the active section and shows invite when manage is allowed", () => {
    render(<TeamSectionTabs active="employees" canManage />);
    const nav = screen.getByRole("navigation", { name: "Team sections" });
    expect(within(nav).getByRole("link", { name: "Employees" }).getAttribute("aria-current")).toBe(
      "page",
    );
    expect(
      within(nav).getByRole("link", { name: "Pending invitations" }).getAttribute("aria-current"),
    ).toBeNull();
    expect(screen.getByRole("link", { name: "Invite employee" }).getAttribute("href")).toBe(
      "/app/admin/team/invite",
    );
  });

  it("hides invite CTA without manage permission", () => {
    render(<TeamSectionTabs active="invitations" canManage={false} />);
    expect(screen.queryByRole("link", { name: "Invite employee" })).toBeNull();
    expect(
      screen.getByRole("link", { name: "Pending invitations" }).getAttribute("aria-current"),
    ).toBe("page");
  });
});
