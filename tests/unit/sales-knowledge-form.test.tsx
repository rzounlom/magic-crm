/** @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SalesKnowledgeForm } from "@/components/layout/sales-knowledge-form";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  unstable_rethrow: (error: unknown) => {
    throw error;
  },
}));

afterEach(() => {
  cleanup();
});

describe("sales knowledge form", () => {
  it("groups fields and exposes save action for editable mode", () => {
    render(<SalesKnowledgeForm action={vi.fn()} />);
    expect(screen.getByText("Offering")).toBeTruthy();
    expect(screen.getByText("Pricing & capacity")).toBeTruthy();
    expect(screen.getByRole("textbox", { name: /^Name/ })).toBeTruthy();
    expect(screen.getByRole("textbox", { name: /^Price text/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save knowledge" })).toBeTruthy();
    expect(screen.queryByText(/Saving requires manage permission/i)).toBeNull();
  });

  it("hides save and disables controls in read-only mode", () => {
    render(
      <SalesKnowledgeForm
        action={vi.fn()}
        readOnly
        values={{
          id: "k1",
          type: "PACKAGE",
          name: "Party Package",
          shortDescription: "Short",
          details: "Details",
          priceText: "$100",
          durationMinutes: 120,
          minGuests: 10,
          maxGuests: 20,
          waiverRequired: true,
          active: true,
          salesNotes: null,
          customerFacingNotes: null,
        }}
      />,
    );
    expect(screen.getByRole("textbox", { name: /^Name/ })).toHaveProperty("disabled", true);
    expect(screen.queryByRole("button", { name: "Save knowledge" })).toBeNull();
    expect(screen.getByRole("status").textContent).toMatch(/manage permission/i);
  });
});
