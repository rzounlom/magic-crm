/** @vitest-environment jsdom */

import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { useState } from "react";

import { EmployeeInquiryTabs } from "@/components/layout/employee-inquiry-tabs";

afterEach(() => {
  cleanup();
});

function QuoteDraftPanel() {
  const [reason, setReason] = useState("");
  return (
    <div data-testid="quote-panel">
      <label>
        Edit reason
        <input
          name="editReason"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </label>
    </div>
  );
}

function renderTabs() {
  return render(
    <EmployeeInquiryTabs
      panels={{
        overview: <div data-testid="overview-panel">Overview content</div>,
        quote: <QuoteDraftPanel />,
        recommendations: <div data-testid="recommendations-panel">Recommendations content</div>,
        activity: <div data-testid="activity-panel">Activity content</div>,
      }}
    />,
  );
}

function expectSelected(name: RegExp) {
  const tab = screen.getByRole("tab", { name });
  expect(tab.getAttribute("aria-selected")).toBe("true");
  expect(tab.tabIndex).toBe(0);
  return tab;
}

function expectNotSelected(name: RegExp) {
  const tab = screen.getByRole("tab", { name });
  expect(tab.getAttribute("aria-selected")).toBe("false");
  expect(tab.tabIndex).toBe(-1);
  return tab;
}

describe("EmployeeInquiryTabs keyboard navigation", () => {
  it("defaults to Overview with correct aria-selected and tabIndex", () => {
    renderTabs();
    expectSelected(/^Overview$/i);
    expectNotSelected(/Staff quote/i);
    expect(
      (screen.getByTestId("overview-panel").closest("[role=tabpanel]") as HTMLElement | null)?.hidden,
    ).toBe(false);
    expect(
      (screen.getByTestId("quote-panel").closest("[role=tabpanel]") as HTMLElement | null)?.hidden,
    ).toBe(true);
  });

  it("moves with ArrowRight / ArrowLeft and wraps at the ends", async () => {
    const user = userEvent.setup();
    renderTabs();
    const overview = screen.getByRole("tab", { name: /^Overview$/i });
    overview.focus();

    await user.keyboard("{ArrowRight}");
    const quote = expectSelected(/Staff quote/i);
    expect(document.activeElement).toBe(quote);

    await user.keyboard("{ArrowLeft}");
    expect(document.activeElement).toBe(expectSelected(/^Overview$/i));

    await user.keyboard("{ArrowLeft}");
    const activity = expectSelected(/Activity & notes/i);
    expect(document.activeElement).toBe(activity);

    await user.keyboard("{ArrowRight}");
    expectSelected(/^Overview$/i);
  });

  it("supports Home and End", async () => {
    const user = userEvent.setup();
    renderTabs();
    screen.getByRole("tab", { name: /^Overview$/i }).focus();

    await user.keyboard("{End}");
    expectSelected(/Activity & notes/i);

    await user.keyboard("{Home}");
    expectSelected(/^Overview$/i);
  });

  it("preserves unsaved quote edits when switching tabs", async () => {
    const user = userEvent.setup();
    renderTabs();

    await user.click(screen.getByRole("tab", { name: /Staff quote/i }));
    const input = within(screen.getByTestId("quote-panel")).getByRole("textbox", {
      name: /Edit reason/i,
    });
    await user.type(input, "Phase 10N preserve check");

    await user.click(screen.getByRole("tab", { name: /^Overview$/i }));
    expect(
      (screen.getByTestId("quote-panel").closest("[role=tabpanel]") as HTMLElement | null)?.hidden,
    ).toBe(true);

    await user.click(screen.getByRole("tab", { name: /Staff quote/i }));
    expect(
      (
        within(screen.getByTestId("quote-panel")).getByRole("textbox", {
          name: /Edit reason/i,
        }) as HTMLInputElement
      ).value,
    ).toBe("Phase 10N preserve check");
  });
});
