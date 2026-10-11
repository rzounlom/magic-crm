/** @vitest-environment jsdom */

import { readFileSync } from "node:fs";
import path from "node:path";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PUBLIC_INQUIRY_PENDING_COPY } from "@/components/layout/public-inquiry-pending";
import { PLANNER_FRAME_CLASS } from "@/components/layout/public-content";
import { PublicIntakeWizard } from "@/components/layout/public-intake-wizard";
import { notify } from "@/lib/ui/notify";
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

function press(name: RegExp | string) {
  fireEvent.click(screen.getByRole("button", { name }));
}

async function choose(user: ReturnType<typeof userEvent.setup>, name: RegExp | string) {
  await user.click(screen.getByRole("button", { name }));
}

function setGuestCount(guests: string) {
  fireEvent.change(screen.getByLabelText("Guest count"), { target: { value: guests } });
}

function revealPreferences(guests = "20") {
  press("Birthday Party");
  expect(screen.queryByRole("heading", { name: "Experience" })).toBeNull();
  setGuestCount(guests);
  press("Mix of Kids & Adults");
  expect(screen.getByRole("heading", { name: "Experience" })).toBeTruthy();
  expect(screen.getByRole("heading", { name: "Your event" })).toBeTruthy();
  press("Continue");
  expect(screen.getByRole("heading", { name: "Event preferences" })).toBeTruthy();
}

function revealContact() {
  press("Food: Yes");
  press("Private space: Yes");
  press("$1,500–$3,000");
  press("3 hours");
  expect(screen.getByLabelText("Event date")).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Event date"), { target: { value: "2026-10-15" } });
  fireEvent.change(screen.getByLabelText("Hour"), { target: { value: "6" } });
  fireEvent.change(screen.getByLabelText("Minute"), { target: { value: "00" } });
  fireEvent.change(screen.getByLabelText("AM/PM"), { target: { value: "PM" } });
  expect(screen.getByRole("heading", { name: "How can we reach you?" })).toBeTruthy();
}

function fillContactFields() {
  fireEvent.change(screen.getByLabelText("First name"), { target: { value: "Ada" } });
  fireEvent.change(screen.getByLabelText("Last name"), { target: { value: "Lovelace" } });
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "ada@example.com" } });
}

describe("public intake wizard", () => {
  it("uses progressive stages instead of an 11-step wizard", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src/components/layout/public-intake-wizard.tsx"),
      "utf8",
    );
    const css = readFileSync(path.join(process.cwd(), "src/app/globals.css"), "utf8");
    expect(source).not.toMatch(/Step \d+ of/);
    expect(source).not.toMatch(/of 11/);
    expect(source).not.toMatch(/Bowling|Axe Throwing|Laser Tag|Mini Golf|Generations/);
    expect(source).not.toContain("max-w-272");
    expect(source).not.toContain("ring-2");
    expect(PLANNER_FRAME_CLASS).toContain("max-w-3xl");
    expect(PLANNER_FRAME_CLASS).toContain("px-4");
    expect(css).toMatch(/\.choice-grid[\s\S]*gap:\s*1rem/);
    expect(css).toMatch(/\.choice-card\[aria-pressed="true"\][\s\S]*box-shadow:\s*inset/);
    expect(css).not.toMatch(/\.choice-card[\s\S]{0,240}ring-/);

    render(<PublicIntakeWizard organizationSlug="alpha" attractions={ALPHA} />);
    const progress = screen.getByRole("list", { name: "Planner progress" });
    expect(within(progress).getByText("Event")).toBeTruthy();
    expect(within(progress).getByText("Experience")).toBeTruthy();
    expect(within(progress).getByText("Preferences")).toBeTruthy();
    expect(within(progress).getByText("Date & Time")).toBeTruthy();
    expect(within(progress).getByText("Contact")).toBeTruthy();
    expect(within(progress).getByText("Review")).toBeTruthy();
    expect(within(progress).getByText("Event").className).toContain("rounded-full");
    expect(within(progress).getByText("Event").getAttribute("aria-current")).toBe("step");
    expect(screen.queryByText(/Step \d+ of 11/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
    expect(document.querySelector("[data-planner-shell]")?.className).not.toContain("max-w-272");
    expect(document.querySelector("[data-choice-grid]")?.className).toContain("choice-grid");
    expect(screen.getByRole("button", { name: "Start over" }).className).toContain("min-h-11");
  });

  it("groups guests with the event and food with private space", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<PublicIntakeWizard organizationSlug="alpha" attractions={ALPHA} />);
    const event = document.getElementById("planner-section-event");
    await choose(user, "Birthday Party");
    expect(event?.contains(screen.getByLabelText("Guest count"))).toBe(true);
    expect(event?.contains(screen.getByRole("button", { name: "Mix of Kids & Adults" }))).toBe(true);
    expect(screen.queryByRole("heading", { name: "Experience" })).toBeNull();

    await user.type(screen.getByLabelText("Guest count"), "20");
    await choose(user, "Mix of Kids & Adults");
    expect(screen.getByRole("button", { name: "Bowling" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Trampoline Park" })).toBeNull();
    await choose(user, "Bowling");
    await choose(user, "Axe Throwing");
    expect(screen.getByRole("button", { name: /Bowling/ })).toHaveProperty("ariaPressed", "true");
    const selected = screen.getByRole("button", { name: /Bowling/ });
    expect(selected.className).toContain("choice-card");
    expect(selected.className).toContain("cursor-pointer");
    await user.click(screen.getByRole("button", { name: "Continue" }));

    const preferences = document.getElementById("planner-section-preferences");
    expect(preferences?.contains(screen.getByRole("button", { name: "Food: Yes" }))).toBe(true);
    expect(preferences?.contains(screen.getByRole("button", { name: "Private space: Yes" }))).toBe(true);
    expect(screen.queryAllByRole("button", { name: "Continue" })).toHaveLength(0);
    unmount();

    render(<PublicIntakeWizard organizationSlug="beta" attractions={BETA} />);
    await choose(user, "Birthday Party");
    await user.type(screen.getByLabelText("Guest count"), "8");
    await choose(user, "Mostly Adults");
    expect(screen.getByRole("button", { name: "Trampoline Park" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Bowling" })).toBeNull();
  });

  it("keeps compatible later answers and a 12-hour review after edits", () => {
    render(<PublicIntakeWizard organizationSlug="alpha" attractions={ALPHA} />);
    revealPreferences();
    press("Bowling");
    press("Axe Throwing");
    revealContact();

    const eventDate = screen.getByLabelText("Event date");
    expect(eventDate.className).toContain("cursor-pointer");
    expect(document.querySelector(".time-group")).toBeTruthy();
    expect(document.querySelector('input[name="startTime"]')).toHaveProperty("value", "18:00");
    fillContactFields();
    press("Review your event");

    expect(screen.getByRole("heading", { name: "Review your event" })).toBeTruthy();
    expect(screen.getByText("October 15, 2026 at 6:00 PM")).toBeTruthy();
    expect(screen.queryByText("18:00")).toBeNull();
    expect(screen.getByText("Bowling, Axe Throwing")).toBeTruthy();
    expect(screen.getByText("3 hours")).toBeTruthy();
    expect(screen.getByText("$1,500–$3,000")).toBeTruthy();
    expect(screen.getByText("20 guests")).toBeTruthy();
    expect(screen.getByText("Mix of Kids & Adults")).toBeTruthy();
    expect(screen.getByText(/Ada Lovelace/)).toBeTruthy();
    expect(screen.getByText(/ada@example.com/)).toBeTruthy();
    expect(screen.queryByLabelText("First name")).toBeNull();
    expect(document.querySelector('input[name="desiredDurationMinutes"]')).toHaveProperty("value", "180");
    expect(screen.getByRole("button", { name: "Build my event options" })).toBeTruthy();
    expect(screen.getByText(/does not book your event/i)).toBeTruthy();

    press("Edit Event length");
    expect(screen.getByRole("button", { name: /3 hours/ })).toHaveProperty("ariaPressed", "true");
    expect(screen.getByRole("button", { name: /Bowling/ })).toHaveProperty("ariaPressed", "true");
    press("2 hours");
    press("Review your event");
    expect(screen.getByText("2 hours")).toBeTruthy();
    expect(document.querySelector('input[name="desiredDurationMinutes"]')).toHaveProperty("value", "120");
    expect(screen.getByText("Bowling, Axe Throwing")).toBeTruthy();

    press("Edit Guests");
    const guests = screen.getByLabelText("Guest count");
    expect(guests).toHaveProperty("value", "20");
    fireEvent.change(guests, { target: { value: "22" } });
    press("Review your event");
    expect(screen.getByText("22 guests")).toBeTruthy();
    expect(screen.getByText("2 hours")).toBeTruthy();
    expect(screen.getByText(/Ada Lovelace/)).toBeTruthy();
  });

  it("focuses the review section after commit when opening review", async () => {
    render(<PublicIntakeWizard organizationSlug="alpha" attractions={ALPHA} />);
    revealPreferences();
    revealContact();
    fillContactFields();
    press("Review your event");
    await waitFor(() => {
      expect(document.getElementById("planner-section-review")).toBe(document.activeElement);
    });
  });

  it("clears the planner only after start over is confirmed", async () => {
    const user = userEvent.setup();
    render(<PublicIntakeWizard organizationSlug="alpha" attractions={ALPHA} />);
    await choose(user, "Corporate Event");
    await user.type(screen.getByLabelText("Guest count"), "8");
    await choose(user, "Mix of Kids & Adults");
    expect(screen.getByText(/continue without selecting any/i)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByRole("heading", { name: "Event preferences" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Start over" }));
    const dialog = screen.getByRole("dialog", { name: "Start over?" });
    expect(within(dialog).getByText(/current plan will be discarded/i)).toBeTruthy();
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("heading", { name: "Event preferences" })).toBeTruthy();
    expect(screen.getByLabelText("Guest count")).toHaveProperty("value", "8");

    await user.click(screen.getByRole("button", { name: "Start over" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Start over" }));
    expect(screen.getByRole("heading", { name: "Your event" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Corporate Event" })).toHaveProperty("ariaPressed", "false");
    expect(screen.queryByDisplayValue("8")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Experience" })).toBeNull();
  });

  it("keeps guest count to digits and validates contact before review", async () => {
    const user = userEvent.setup();
    render(<PublicIntakeWizard organizationSlug="alpha" attractions={[]} />);
    await choose(user, "Birthday Party");
    const guests = screen.getByLabelText("Guest count");
    expect(guests.className).toContain("w-full");
    await user.type(guests, "2a0b");
    expect(guests).toHaveProperty("value", "20");
    await user.clear(guests);
    await user.type(guests, "1234");
    expect(guests).toHaveProperty("value", "123");
    await user.clear(guests);
    await user.type(guests, "12");
    await choose(user, "Mostly Kids / Youth");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await choose(user, "Food: No");
    await choose(user, "Private space: No preference");
    await choose(user, "Flexible / show me options");
    await choose(user, "Flexible / recommend for me");
    fireEvent.change(screen.getByLabelText("Event date"), { target: { value: "2026-10-15" } });
    await user.selectOptions(screen.getByLabelText("Hour"), "5");
    await user.selectOptions(screen.getByLabelText("Minute"), "00");
    await user.selectOptions(screen.getByLabelText("AM/PM"), "PM");
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Review your event" })).toBeTruthy();
    });
    await user.click(screen.getByRole("button", { name: "Review your event" }));
    expect(screen.getByRole("textbox", { name: /first name/i }).getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByText("Enter a first name.")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Review your event" })).toBeNull();

    fillContactFields();
    await user.click(screen.getByRole("button", { name: "Review your event" }));
    expect(screen.getByText("We'll recommend options")).toBeTruthy();
    expect(screen.getByText("Flexible / recommend for me")).toBeTruthy();
    expect(document.querySelector('input[name="desiredDurationMinutes"]')).toHaveProperty("value", "");
    expect(document.querySelector('input[name="startTime"]')).toHaveProperty("value", "17:00");
    expect(screen.getByText("October 15, 2026 at 5:00 PM")).toBeTruthy();
  });

  it("blocks a second build and restores a usable error state", async () => {
    const user = userEvent.setup();
    let resolveAction: ((result: SecurityActionResult) => void) | undefined;
    const action = vi.fn(
      () =>
        new Promise<SecurityActionResult>((resolve) => {
          resolveAction = resolve;
        }),
    );
    render(<PublicIntakeWizard organizationSlug="alpha" attractions={ALPHA} action={action} />);
    revealPreferences();
    revealContact();
    fillContactFields();
    await user.click(screen.getByRole("button", { name: "Review your event" }));

    const submitPromise = user.click(screen.getByRole("button", { name: "Build my event options" }));
    await screen.findByRole("button", { name: PUBLIC_INQUIRY_PENDING_COPY });
    expect(screen.getByRole("status").textContent).toContain(PUBLIC_INQUIRY_PENDING_COPY);
    expect(document.querySelector("[data-planner-shell]")).toHaveProperty("ariaBusy", "true");
    await waitFor(() => {
      expect(action).toHaveBeenCalledTimes(1);
    });

    await user.click(screen.getByRole("button", { name: PUBLIC_INQUIRY_PENDING_COPY }));
    expect(action).toHaveBeenCalledTimes(1);

    resolveAction?.({ ok: false, message: "Try again later." });
    await submitPromise;
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Build my event options" })).toHaveProperty("disabled", false);
      expect(document.querySelector("[data-planner-shell]")).toHaveProperty("ariaBusy", "false");
    });
    expect(notify.error).toHaveBeenCalledWith(
      expect.objectContaining({ description: "Try again later." }),
    );
  });

  it("requires an attraction when the tenant profile says a mixed group must choose one", async () => {
    const user = userEvent.setup();
    render(
      <PublicIntakeWizard
        organizationSlug="alpha"
        attractions={ALPHA}
        attractionRequiredGuestMixes={["mixed_ages"]}
      />,
    );
    await choose(user, "Birthday Party");
    await user.type(screen.getByLabelText("Guest count"), "20");
    await choose(user, "Mix of Kids & Adults");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByRole("alert").textContent).toContain("Choose at least one attraction.");
    expect(screen.queryByRole("heading", { name: "Event preferences" })).toBeNull();
    await choose(user, "Bowling");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByRole("heading", { name: "Event preferences" })).toBeTruthy();
  });
});
