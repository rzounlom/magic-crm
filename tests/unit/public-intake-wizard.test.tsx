/** @vitest-environment jsdom */

import { readFileSync } from "node:fs";
import path from "node:path";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PUBLIC_INQUIRY_PENDING_COPY } from "@/components/layout/public-inquiry-pending";
import { PLANNER_FRAME_CLASS } from "@/components/layout/public-content";
import { PublicIntakeWizard } from "@/components/layout/public-intake-wizard";
import { clearIntakeDraft, intakeDraftStorageKey } from "@/lib/event-planner/intake-draft";
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
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
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

function fillEventAndContinue(guests = "20") {
  press(/Birthday Party/);
  setGuestCount(guests);
  press("Mix of Kids & Adults");
  press("Continue");
}

function fillFunAndContinue() {
  press("Food: Yes");
  press("Private space: Yes");
  press("$1,500–$3,000");
  press("3 hours");
  press("Continue");
}

function fillWhenAndContinue() {
  fireEvent.change(screen.getByLabelText("Event date"), { target: { value: "2026-10-15" } });
  fireEvent.change(screen.getByLabelText("Preferred start time"), { target: { value: "18:00" } });
  press("Continue");
}

function fillContactFields() {
  fireEvent.change(screen.getByLabelText("First name"), { target: { value: "Ada" } });
  fireEvent.change(screen.getByLabelText("Last name"), { target: { value: "Lovelace" } });
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "ada@example.com" } });
}

describe("public intake wizard", () => {
  it("uses a four-step journey instead of progressive six-stage reveal", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src/components/layout/public-intake-wizard.tsx"),
      "utf8",
    );
    const css = readFileSync(path.join(process.cwd(), "src/app/globals.css"), "utf8");
    expect(source).not.toMatch(/Step \d+ of 11/);
    expect(source).not.toMatch(/of 11/);
    expect(source).not.toMatch(/Bowling|Axe Throwing|Laser Tag|Mini Golf|Generations/);
    expect(source).not.toContain("max-w-272");
    expect(source).not.toContain("ring-2");
    expect(PLANNER_FRAME_CLASS).toContain("max-w-3xl");
    expect(css).toMatch(/\.choice-grid[\s\S]*gap:\s*0\.75rem/);
    expect(css).toMatch(/\.choice-grid-compact/);
    expect(css).toMatch(/\.choice-card\[aria-pressed="true"\][\s\S]*box-shadow:\s*inset/);

    render(<PublicIntakeWizard organizationSlug="alpha" attractions={ALPHA} />);
    const progress = screen.getByRole("list", { name: "Planner progress" });
    expect(within(progress).getByText("Event")).toBeTruthy();
    expect(within(progress).getByText("Fun")).toBeTruthy();
    expect(within(progress).getByText("When")).toBeTruthy();
    expect(within(progress).getByText("Details")).toBeTruthy();
    expect(within(progress).queryByText("Experience")).toBeNull();
    expect(within(progress).queryByText("Preferences")).toBeNull();
    expect(within(progress).getByText("Event").getAttribute("aria-current")).toBe("step");
    expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
    expect(screen.getByRole("button", { name: "Continue" })).toBeTruthy();
    const startOver = screen.getByRole("button", { name: "Start over" });
    expect(startOver.className).toContain("text-muted-foreground");
    expect(startOver.className).not.toContain("border-destructive");
    expect(startOver.className).not.toContain("w-full");
  });

  it("keeps Back/Continue navigation and tenant-scoped activities", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<PublicIntakeWizard organizationSlug="alpha" attractions={ALPHA} />);
    await choose(user, /Birthday Party/);
    expect(screen.getByLabelText("Guest count")).toBeTruthy();
    await user.type(screen.getByLabelText("Guest count"), "20");
    await choose(user, "Mix of Kids & Adults");
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(screen.getByRole("heading", { name: "The fun stuff" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Bowling/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Trampoline Park/ })).toBeNull();
    await choose(user, /Bowling/);
    await choose(user, /Axe Throwing/);
    expect(screen.getByRole("button", { name: /Bowling/ })).toHaveProperty("ariaPressed", "true");

    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("heading", { name: "Your event" })).toBeTruthy();
    expect(screen.getByLabelText("Guest count")).toHaveProperty("value", "20");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByRole("button", { name: /Bowling/ })).toHaveProperty("ariaPressed", "true");
    unmount();

    render(<PublicIntakeWizard organizationSlug="beta" attractions={BETA} />);
    await choose(user, /Birthday Party/);
    await user.type(screen.getByLabelText("Guest count"), "8");
    await choose(user, "Mostly Adults");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByRole("button", { name: /Trampoline Park/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Bowling/ })).toBeNull();
  });

  it("keeps a compatible submission payload and 12-hour review summary", () => {
    render(<PublicIntakeWizard organizationSlug="alpha" attractions={ALPHA} />);
    fillEventAndContinue();
    press(/Bowling/);
    press(/Axe Throwing/);
    fillFunAndContinue();
    expect(screen.getByLabelText("Event date").className).toContain("cursor-pointer");
    fillWhenAndContinue();

    expect(screen.getByRole("heading", { name: "Your details" })).toBeTruthy();
    expect(document.querySelector('input[name="startTime"]')).toHaveProperty("value", "18:00");
    expect(screen.getByText("October 15, 2026 at 6:00 PM")).toBeTruthy();
    expect(screen.queryByText("18:00")).toBeNull();
    expect(screen.getByText("Bowling, Axe Throwing")).toBeTruthy();
    expect(screen.getByText("3 hours")).toBeTruthy();
    expect(screen.getByText("$1,500–$3,000")).toBeTruthy();
    expect(screen.getByText("20 guests")).toBeTruthy();
    expect(screen.getByText("Mix of Kids & Adults")).toBeTruthy();
    expect(screen.getByText(/does not book your event/i)).toBeTruthy();
    expect(screen.getByText(/does not reserve activities or collect payment/i)).toBeTruthy();

    fillContactFields();
    expect(screen.getByText(/Ada Lovelace/)).toBeTruthy();
    expect(screen.getByText(/ada@example.com/)).toBeTruthy();
    expect(document.querySelector('input[name="desiredDurationMinutes"]')).toHaveProperty("value", "180");
    expect(screen.getByRole("button", { name: "Build my event options" })).toBeTruthy();
  });

  it("keeps compatible later answers when editing from review", () => {
    render(<PublicIntakeWizard organizationSlug="alpha" attractions={ALPHA} />);
    fillEventAndContinue();
    press(/Bowling/);
    fillFunAndContinue();
    fillWhenAndContinue();
    fillContactFields();

    press("Edit Event length");
    expect(screen.getByRole("heading", { name: "The fun stuff" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "3 hours" })).toHaveProperty("ariaPressed", "true");
    expect(screen.getByRole("button", { name: "Bowling" })).toHaveProperty("ariaPressed", "true");
    press("2 hours");
    press("Continue");
    expect(screen.getByRole("heading", { name: "When" })).toBeTruthy();
    press("Continue");
    expect(screen.getByRole("heading", { name: "Your details" })).toBeTruthy();
    expect(screen.getByText("2 hours")).toBeTruthy();
    expect(document.querySelector('input[name="desiredDurationMinutes"]')).toHaveProperty("value", "120");
    expect(screen.getByText(/Bowling/)).toBeTruthy();

    press("Edit Guests");
    const guests = screen.getByLabelText("Guest count");
    expect(guests).toHaveProperty("value", "20");
    fireEvent.change(guests, { target: { value: "22" } });
    press("Continue");
    expect(screen.getByRole("heading", { name: "The fun stuff" })).toBeTruthy();
    press("Continue");
    expect(screen.getByRole("heading", { name: "When" })).toBeTruthy();
    press("Continue");
    expect(screen.getByRole("heading", { name: "Your details" })).toBeTruthy();
    expect(screen.getByText("22 guests")).toBeTruthy();
    expect(screen.getByText("2 hours")).toBeTruthy();
    expect(screen.getByText(/Ada Lovelace/)).toBeTruthy();
  });

  it("focuses the details section after continue", async () => {
    render(<PublicIntakeWizard organizationSlug="alpha" attractions={ALPHA} />);
    fillEventAndContinue();
    fillFunAndContinue();
    fillWhenAndContinue();
    await waitFor(() => {
      expect(document.getElementById("planner-section-details")).toBe(document.activeElement);
    });
  });

  it("clears the planner and draft only after start over is confirmed", async () => {
    const user = userEvent.setup();
    render(<PublicIntakeWizard organizationSlug="alpha" attractions={ALPHA} />);
    await choose(user, /Corporate Event/);
    await user.type(screen.getByLabelText("Guest count"), "8");
    await choose(user, "Mix of Kids & Adults");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByRole("heading", { name: "The fun stuff" })).toBeTruthy();
    expect(window.localStorage.getItem(intakeDraftStorageKey("alpha"))).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Start over" }));
    const dialog = screen.getByRole("dialog", { name: "Start over?" });
    expect(within(dialog).getByText(/current plan will be discarded/i)).toBeTruthy();
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("heading", { name: "The fun stuff" })).toBeTruthy();
    expect(screen.queryByLabelText("Guest count")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByLabelText("Guest count")).toHaveProperty("value", "8");

    await user.click(screen.getByRole("button", { name: "Start over" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Start over" }));
    expect(screen.getByRole("heading", { name: "Your event" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Corporate Event/ })).toHaveProperty("ariaPressed", "false");
    expect(screen.queryByDisplayValue("8")).toBeNull();
    expect(window.localStorage.getItem(intakeDraftStorageKey("alpha"))).toBeNull();
  });

  it("keeps guest count to digits and validates contact before submit", async () => {
    const user = userEvent.setup();
    render(<PublicIntakeWizard organizationSlug="alpha" attractions={[]} />);
    await choose(user, /Birthday Party/);
    const guests = screen.getByLabelText("Guest count");
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
    await user.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.change(screen.getByLabelText("Event date"), { target: { value: "2026-10-15" } });
    await user.selectOptions(screen.getByLabelText("Preferred start time"), "17:00");
    await user.click(screen.getByRole("button", { name: "Continue" }));

    await user.click(screen.getByRole("button", { name: "Build my event options" }));
    expect(screen.getByRole("textbox", { name: /first name/i }).getAttribute("aria-invalid")).toBe("true");
    expect(screen.getAllByText("Enter a first name.").length).toBeGreaterThan(0);

    fillContactFields();
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
    fillEventAndContinue();
    fillFunAndContinue();
    fillWhenAndContinue();
    fillContactFields();

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
    expect(screen.getByText("Try again later.")).toBeTruthy();
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
    await choose(user, /Birthday Party/);
    await user.type(screen.getByLabelText("Guest count"), "20");
    await choose(user, "Mix of Kids & Adults");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByRole("alert").textContent).toContain("Choose at least one activity.");
    expect(screen.queryByRole("heading", { name: "When" })).toBeNull();
    await choose(user, /Bowling/);
    await choose(user, "Food: Yes");
    await choose(user, "Private space: Yes");
    await choose(user, "$1,500–$3,000");
    await choose(user, "3 hours");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByRole("heading", { name: "When" })).toBeTruthy();
  });

  it("restores non-PII draft preferences and never persists contact fields", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<PublicIntakeWizard organizationSlug="alpha" attractions={ALPHA} />);
    await choose(user, /Birthday Party/);
    await user.type(screen.getByLabelText("Guest count"), "18");
    await choose(user, "Mostly Adults");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await choose(user, /Bowling/);
    await choose(user, "Food: Yes");
    await choose(user, "Private space: No preference");
    await choose(user, "Flexible / show me options");
    await choose(user, "2 hours");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.change(screen.getByLabelText("Event date"), { target: { value: "2026-11-01" } });
    await user.selectOptions(screen.getByLabelText("Preferred start time"), "14:00");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    fillContactFields();

    const raw = window.localStorage.getItem(intakeDraftStorageKey("alpha"));
    expect(raw).toBeTruthy();
    expect(raw).not.toContain("Ada");
    expect(raw).not.toContain("ada@example.com");
    expect(raw).not.toContain("Lovelace");
    unmount();

    render(<PublicIntakeWizard organizationSlug="alpha" attractions={ALPHA} />);
    await waitFor(() => {
      expect(screen.getByText(/restored your event preferences/i)).toBeTruthy();
    });
    expect(screen.getByRole("button", { name: /Birthday Party/ })).toHaveProperty("ariaPressed", "true");
    expect(screen.getByLabelText("Guest count")).toHaveProperty("value", "18");
    expect(screen.queryByDisplayValue("Ada")).toBeNull();
    expect(screen.queryByDisplayValue("ada@example.com")).toBeNull();

    clearIntakeDraft("beta");
    expect(window.localStorage.getItem(intakeDraftStorageKey("alpha"))).toBeTruthy();
  });
});
