/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
  unstable_rethrow: (error: unknown) => {
    throw error;
  },
}));

vi.mock("@/server/actions/public-inquiry", () => ({
  submitPublicWpEventInquiryAction: vi.fn(async () => ({
    ok: false,
    code: "VALIDATION",
    message: "Check the highlighted fields.",
  })),
}));

vi.mock("@/lib/ui/notify", () => ({
  notify: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}));

import { PublicEventInquiryForm } from "@/components/layout/public-event-inquiry-form";
import { PUBLIC_INQUIRE_SECTION_ATTR } from "@/lib/inquiries/public-inquiry-section-navigation";

function fillContact(overrides: Partial<Record<string, string>> = {}) {
  fireEvent.change(screen.getByLabelText(/First name/i), {
    target: { value: overrides.firstName ?? "Ada" },
  });
  fireEvent.change(screen.getByLabelText(/Last name/i), {
    target: { value: overrides.lastName ?? "Lovelace" },
  });
  fireEvent.change(screen.getByLabelText(/Business \/ organization/i), {
    target: { value: overrides.company ?? "Analytical Engines" },
  });
  fireEvent.change(screen.getByLabelText(/^Phone/i), {
    target: { value: overrides.phone ?? "5745550100" },
  });
  fireEvent.change(screen.getByLabelText(/^Email/i), {
    target: { value: overrides.email ?? "ada@example.com" },
  });
}

describe("PublicEventInquiryForm section navigation", () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("does not advance while the contact section is incomplete", async () => {
    render(<PublicEventInquiryForm organizationSlug="demo-org" />);
    const email = screen.getByLabelText(/^Email/i);
    fireEvent.focus(email);
    fireEvent.change(email, { target: { value: "ada@example.com" } });
    fireEvent.blur(email);

    await waitFor(() => {
      expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
    });
  });

  it("advances exactly once after completing the contact section", async () => {
    render(<PublicEventInquiryForm organizationSlug="demo-org" />);
    fillContact();
    const email = screen.getByLabelText(/^Email/i);
    fireEvent.focus(email);
    fireEvent.blur(email);

    const eventPanel = document.getElementById("inquire-panel-event");
    expect(eventPanel).toBeTruthy();

    await waitFor(() => {
      expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(1);
      expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith(
        expect.objectContaining({ block: "start" }),
      );
    });

    // Editing a completed section must not re-advance.
    fireEvent.focus(screen.getByLabelText(/First name/i));
    fireEvent.change(screen.getByLabelText(/First name/i), { target: { value: "Augusta" } });
    fireEvent.blur(screen.getByLabelText(/First name/i));

    await waitFor(() => {
      expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(1);
    });
  });

  it("does not advance on invalid email values", async () => {
    render(<PublicEventInquiryForm organizationSlug="demo-org" />);
    fillContact({ email: "not-an-email" });
    const email = screen.getByLabelText(/^Email/i);
    fireEvent.focus(email);
    fireEvent.blur(email);

    await waitFor(() => {
      expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
    });
  });

  it("advances when the final attraction choice completes the section", async () => {
    render(<PublicEventInquiryForm organizationSlug="demo-org" />);
    fillContact();
    fireEvent.blur(screen.getByLabelText(/^Email/i));
    await waitFor(() => expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(1));
    vi.mocked(Element.prototype.scrollIntoView).mockClear();

    // Complete event section enough to reach attractions without relying on prior advances.
    fireEvent.change(screen.getByLabelText(/What type of event/i), {
      target: { value: "Birthday" },
    });
    fireEvent.change(document.querySelector('input[name="dates[]"]')!, {
      target: { value: "2026-11-06" },
    });
    fireEvent.change(screen.getByLabelText(/Preferred start time/i), {
      target: { value: "13:00" },
    });
    fireEvent.change(screen.getByLabelText(/^Adults/i), { target: { value: "6" } });
    fireEvent.change(screen.getByLabelText(/^Children/i), { target: { value: "0" } });
    fireEvent.change(screen.getByLabelText(/How long would you like/i), {
      target: { value: "2 hours" },
    });

    await waitFor(() => expect(Element.prototype.scrollIntoView).toHaveBeenCalled());
    vi.mocked(Element.prototype.scrollIntoView).mockClear();

    const attractionKeys = ["bowling", "axe", "laser", "golf", "climbing", "arcade"];
    for (const key of attractionKeys) {
      const radio = document.querySelector<HTMLInputElement>(
        `input[name="attractions[${key}]"][value="open"]`,
      );
      expect(radio).toBeTruthy();
      fireEvent.click(radio!);
    }

    await waitFor(() => {
      expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
    });
  });

  it("navigates to the first invalid section on failed submit without clearing answers", async () => {
    render(<PublicEventInquiryForm organizationSlug="demo-org" />);
    fillContact();
    fireEvent.blur(screen.getByLabelText(/^Email/i));
    await waitFor(() => expect(Element.prototype.scrollIntoView).toHaveBeenCalled());
    vi.mocked(Element.prototype.scrollIntoView).mockClear();

    fireEvent.click(screen.getByRole("button", { name: /Submit event request/i }));

    await waitFor(() => {
      expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
    });

    expect((screen.getByLabelText(/First name/i) as HTMLInputElement).value).toBe("Ada");
    expect((screen.getByLabelText(/^Email/i) as HTMLInputElement).value).toBe("ada@example.com");
    expect(
      document.querySelector(`[${PUBLIC_INQUIRE_SECTION_ATTR}="event"]`),
    ).toBeTruthy();
  });

  it("exposes stable section keys for all five panels", () => {
    render(<PublicEventInquiryForm organizationSlug="demo-org" />);
    for (const key of ["contact", "event", "attractions", "preferences", "occasion"]) {
      expect(document.querySelector(`[${PUBLIC_INQUIRE_SECTION_ATTR}="${key}"]`)).toBeTruthy();
    }
  });
});
