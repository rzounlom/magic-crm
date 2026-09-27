/** @vitest-environment jsdom */

import { readFileSync } from "node:fs";
import path from "node:path";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PublicIntakeWizard } from "@/components/layout/public-intake-wizard";
import {
  PUBLIC_INQUIRY_PENDING_COPY,
} from "@/components/layout/public-inquiry-pending";
import type { SecurityActionResult } from "@/types/security-action";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  unstable_rethrow: (error: unknown) => {
    throw error;
  },
}));

vi.mock("@/lib/ui/notify", () => ({
  notify: { error: vi.fn(), success: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

vi.mock("@/server/actions/public-inquiry", () => ({
  submitPublicInquiryAction: vi.fn(),
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
});

const ALPHA = [
  { id: "bowl", name: "Bowling" },
  { id: "axe", name: "Axe Throwing" },
];

const BETA = [
  { id: "tramp", name: "Trampoline Park" },
  { id: "arcade", name: "Arcade" },
];

async function choose(user: ReturnType<typeof userEvent.setup>, name: RegExp | string) {
  await user.click(screen.getByRole("button", { name }));
}

async function continuePlanner(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Continue" }));
}

async function reachAttractions(user: ReturnType<typeof userEvent.setup>) {
  await choose(user, "Birthday Party");
  await continuePlanner(user);
  await user.type(screen.getByLabelText("Guest count"), "4");
  await continuePlanner(user);
  await choose(user, "Mostly Adults");
  await continuePlanner(user);
}

describe("public intake wizard", () => {
  it("renders only the attractions passed in and does not hardcode a venue catalog", async () => {
    const source = readFileSync(
      path.join(process.cwd(), "src/components/layout/public-intake-wizard.tsx"),
      "utf8",
    );
    expect(source).not.toMatch(/Bowling|Axe Throwing|Laser Tag|Mini Golf|Generations/);

    const user = userEvent.setup();
    const { unmount } = render(<PublicIntakeWizard organizationSlug="alpha" attractions={ALPHA} />);
    await reachAttractions(user);
    expect(screen.getByRole("button", { name: "Bowling" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Trampoline Park" })).toBeNull();
    unmount();

    render(<PublicIntakeWizard organizationSlug="beta" attractions={BETA} />);
    await reachAttractions(user);
    expect(screen.getByRole("button", { name: "Trampoline Park" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Bowling" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Axe Throwing" })).toBeNull();
  });

  it("keeps later answers, shows a 12-hour review, and edits an earlier step", async () => {
    const user = userEvent.setup();
    render(<PublicIntakeWizard organizationSlug="alpha" attractions={ALPHA} />);

    await choose(user, "Birthday Party");
    await continuePlanner(user);
    await user.type(screen.getByLabelText("Guest count"), "20");
    await continuePlanner(user);
    await choose(user, "Mostly Adults");
    await continuePlanner(user);
    await choose(user, "Bowling");
    await choose(user, "Axe Throwing");
    expect(screen.getByRole("button", { name: /Bowling/ })).toHaveProperty("ariaPressed", "true");
    expect(screen.getByRole("button", { name: /Axe Throwing/ })).toHaveProperty("ariaPressed", "true");
    await continuePlanner(user);
    await choose(user, "Yes");
    await continuePlanner(user);
    await choose(user, "Yes");
    await continuePlanner(user);
    await choose(user, "$1,500–$3,000");
    await continuePlanner(user);
    fireEvent.change(screen.getByLabelText("Event date"), { target: { value: "2026-09-26" } });
    await user.selectOptions(screen.getByLabelText("Hour"), "5");
    await user.selectOptions(screen.getByLabelText("Minute"), "00");
    await user.selectOptions(screen.getByLabelText("AM/PM"), "PM");
    await continuePlanner(user);

    expect(screen.getByRole("heading", { name: "Review your event" })).toBe(document.activeElement);
    expect(screen.getByText("September 26, 2026 at 5:00 PM")).toBeTruthy();
    expect(screen.queryByText("17:00")).toBeNull();
    expect(screen.getByText("Bowling, Axe Throwing")).toBeTruthy();
    expect(screen.getByText("$1,500–$3,000")).toBeTruthy();
    expect(screen.queryByText(/per guest/i)).toBeNull();
    expect(screen.queryByText(/Beverages/i)).toBeNull();
    expect(screen.getByRole("button", { name: "Build my event options" })).toBeTruthy();
    expect(screen.getByText(/does not book your event/i)).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByLabelText("Hour")).toHaveProperty("value", "5");
    await continuePlanner(user);
    expect(screen.getAllByText("Yes").length).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: "Edit Guests" }));
    const guests = screen.getByLabelText("Guest count");
    expect(guests).toHaveProperty("value", "20");
    await user.clear(guests);
    await user.type(guests, "22");
    await continuePlanner(user);
    expect(screen.getByRole("button", { name: /Mostly Adults/ })).toHaveProperty("ariaPressed", "true");
  });

  it("allows continuing with no attractions and confirms before start over clears answers", async () => {
    const user = userEvent.setup();
    render(<PublicIntakeWizard organizationSlug="alpha" attractions={ALPHA} />);

    await choose(user, "Corporate Event");
    await continuePlanner(user);
    await user.type(screen.getByLabelText("Guest count"), "8");
    await continuePlanner(user);
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByLabelText("Guest count")).toHaveProperty("value", "8");
    await continuePlanner(user);
    await choose(user, "Mix of Kids & Adults");
    await continuePlanner(user);
    expect(screen.getByText(/continue without selecting any/i)).toBeTruthy();
    await continuePlanner(user);
    expect(screen.getByRole("heading", { name: "Would you like food included?" })).toBeTruthy();
    const scroll = document.querySelector("[data-planner-scroll]");
    const actions = document.querySelector("[data-planner-actions]");
    expect(scroll?.contains(screen.getByRole("button", { name: "Yes" }))).toBe(true);
    expect(scroll?.contains(actions)).toBe(false);
    expect(actions?.textContent).toMatch(/Back/);
    expect(actions?.textContent).toMatch(/Continue/);

    await user.click(screen.getByRole("button", { name: "Start over" }));
    const dialog = screen.getByRole("dialog", { name: "Start over?" });
    expect(within(dialog).getByText(/current plan will be discarded/i)).toBeTruthy();
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("heading", { name: "Would you like food included?" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Start over" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Start over" }));
    expect(screen.getByRole("heading", { name: "What are you planning?" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Corporate Event" })).toHaveProperty("ariaPressed", "false");
    expect(screen.queryByDisplayValue("8")).toBeNull();
  });

  it("shows a guest-count error and a pending state without accepting a second submit", async () => {
    const user = userEvent.setup();
    let resolveAction: ((result: SecurityActionResult) => void) | undefined;
    const action = vi.fn(
      () =>
        new Promise<SecurityActionResult>((resolve) => {
          resolveAction = resolve;
        }),
    );
    render(<PublicIntakeWizard organizationSlug="alpha" attractions={[]} action={action} />);

    await continuePlanner(user);
    expect(screen.getByRole("alert").textContent).toMatch(/event type/i);

    await choose(user, "Birthday Party");
    await continuePlanner(user);
    await continuePlanner(user);
    expect(screen.getByRole("alert").textContent).toMatch(/whole number/i);

    await user.type(screen.getByLabelText("Guest count"), "12");
    await continuePlanner(user);
    await choose(user, "Mostly Kids / Youth");
    await continuePlanner(user);
    await continuePlanner(user);
    await choose(user, "No");
    await continuePlanner(user);
    await choose(user, "No preference");
    await continuePlanner(user);
    await choose(user, /Flexible/);
    await continuePlanner(user);
    fireEvent.change(screen.getByLabelText("Event date"), { target: { value: "2026-10-15" } });
    await user.selectOptions(screen.getByLabelText("Hour"), "5");
    await user.selectOptions(screen.getByLabelText("Minute"), "00");
    await user.selectOptions(screen.getByLabelText("AM/PM"), "PM");
    await continuePlanner(user);
    expect(screen.getByText("We'll recommend options")).toBeTruthy();

    await user.type(screen.getByLabelText("First name"), "Ada");
    await user.type(screen.getByLabelText("Last name"), "Lovelace");
    await user.type(screen.getByLabelText("Email"), "ada@example.com");

    const submitPromise = user.click(screen.getByRole("button", { name: "Build my event options" }));
    await screen.findByRole("button", { name: PUBLIC_INQUIRY_PENDING_COPY });
    expect(screen.getByRole("status").textContent).toContain(PUBLIC_INQUIRY_PENDING_COPY);
    expect(document.querySelector("[data-planner-shell]")).toHaveProperty("ariaBusy", "true");
    await waitFor(() => {
      expect(action).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByLabelText("First name")).toHaveProperty("disabled", true);

    await user.click(screen.getByRole("button", { name: PUBLIC_INQUIRY_PENDING_COPY }));
    expect(action).toHaveBeenCalledTimes(1);

    resolveAction?.({ ok: false, message: "Try again later." });
    await submitPromise;
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Build my event options" })).toHaveProperty("disabled", false);
      expect(document.querySelector("[data-planner-shell]")).toHaveProperty("ariaBusy", "false");
    });
  });
});
