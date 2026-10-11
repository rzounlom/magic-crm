/** @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  AdminBackLink,
  AdminChoiceRow,
  AdminFormSection,
  AdminSectionHeader,
  FormActionBar,
} from "@/components/layout/admin-form-chrome";

afterEach(() => {
  cleanup();
});

describe("admin form chrome", () => {
  it("renders back link, section header, form section, and action bar contracts", () => {
    render(
      <div>
        <AdminBackLink href="/app/admin/resources">Back to resources</AdminBackLink>
        <AdminSectionHeader title="Finite resources" description="Tenant-configured units." />
        <AdminFormSection title="Details" description="Grouped fields.">
          <p>Body</p>
        </AdminFormSection>
        <FormActionBar>
          <button type="submit">Save</button>
        </FormActionBar>
      </div>,
    );

    expect(screen.getByRole("link", { name: "Back to resources" }).getAttribute("href")).toBe(
      "/app/admin/resources",
    );
    expect(screen.getByRole("heading", { level: 2, name: "Finite resources" })).toBeTruthy();
    expect(screen.getByText("Tenant-configured units.")).toBeTruthy();
    expect(document.querySelector("[data-admin-form-section]")).toBeTruthy();
    expect(document.querySelector("[data-form-action-bar]")).toBeTruthy();
  });

  it("marks selected choice rows without relying on color alone", () => {
    const { container } = render(
      <AdminChoiceRow selected>
        <label>
          <input type="checkbox" defaultChecked />
          View users
        </label>
      </AdminChoiceRow>,
    );
    const row = container.querySelector("[data-admin-choice-row]");
    expect(row?.getAttribute("data-selected")).toBe("true");
    expect(row?.className).toContain("has-[:checked]");
    expect(row?.textContent).toContain("View users");
  });
});
