/** @vitest-environment jsdom */

import { readFileSync } from "node:fs";
import path from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ResourceTypeForm } from "@/components/layout/resource-type-form";
import { KnowledgeRequirementForm } from "@/components/layout/knowledge-requirement-form";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  unstable_rethrow: (error: unknown) => {
    throw error;
  },
}));

afterEach(() => {
  cleanup();
});

describe("admin catalog and settings presentation contracts", () => {
  it("keeps Catalog/Settings eyebrows and ButtonLink CTAs on list pages", () => {
    const knowledge = readFileSync(
      path.join(process.cwd(), "src/app/app/admin/ai/knowledge/page.tsx"),
      "utf8",
    );
    const resources = readFileSync(
      path.join(process.cwd(), "src/app/app/admin/resources/page.tsx"),
      "utf8",
    );
    const team = readFileSync(path.join(process.cwd(), "src/app/app/admin/team/page.tsx"), "utf8");
    const security = readFileSync(
      path.join(process.cwd(), "src/app/app/admin/security-groups/page.tsx"),
      "utf8",
    );

    expect(knowledge).toContain('eyebrow="Catalog"');
    expect(knowledge).toContain("Sales knowledge");
    expect(knowledge).toContain("ButtonLink");
    expect(resources).toContain('eyebrow="Catalog"');
    expect(resources).toContain("Badge");
    expect(team).toContain('eyebrow="Settings"');
    expect(security).toContain('eyebrow="Settings"');
    expect(security).toContain("ButtonLink");
    expect(security).toContain("Badge");
  });

  it("keeps permission matrix scroll region and exact permission keys on security detail", () => {
    const detail = readFileSync(
      path.join(process.cwd(), "src/app/app/admin/security-groups/[id]/page.tsx"),
      "utf8",
    );
    expect(detail).toContain('data-permission-matrix');
    expect(detail).toContain("PERMISSION_CATALOG");
    expect(detail).toContain("entry.key");
    expect(detail).toContain("defaultChecked={selected}");
    expect(detail).toContain("disabled={locked || !canManage}");
    expect(detail).not.toContain("window.confirm");
  });

  it("labels resource type form fields accessibly", () => {
    render(<ResourceTypeForm action={vi.fn()} />);
    expect(screen.getByRole("textbox", { name: /^Name/ })).toBeTruthy();
    expect(screen.getByRole("combobox", { name: /^Scheduling mode/ })).toBeTruthy();
    expect(screen.getByRole("spinbutton", { name: /^Slot minutes/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Create resource type" })).toBeTruthy();
  });

  it("presents knowledge requirement links without inventing inventory", () => {
    render(
      <KnowledgeRequirementForm
        action={vi.fn()}
        resourceTypeId="rt1"
        knowledgeItems={[{ id: "k1", name: "Party Package", type: "PACKAGE" }]}
        existing={[]}
      />,
    );
    expect(screen.getByRole("heading", { name: "Sales knowledge requirements" })).toBeTruthy();
    expect(screen.getByText("No offerings are linked yet.")).toBeTruthy();
    expect(screen.getByRole("combobox", { name: /^Offering/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save requirement" })).toBeTruthy();
  });

  it("does not rewrite public intake or invent POS routes in admin chrome", () => {
    const chrome = readFileSync(
      path.join(process.cwd(), "src/components/layout/admin-form-chrome.tsx"),
      "utf8",
    );
    expect(chrome).not.toContain("/app/pos");
    expect(chrome).not.toContain("Generations");
    expect(chrome).not.toContain("/inquire/");
  });
});
