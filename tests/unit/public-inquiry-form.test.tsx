/** @vitest-environment jsdom */

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PublicInquiryForm } from "@/components/layout/public-inquiry-form";
import {
  PUBLIC_INQUIRY_PENDING_COPY,
  PUBLIC_INQUIRY_PREPARING_COPY,
} from "@/components/layout/public-inquiry-pending";
import type { SecurityActionResult } from "@/types/security-action";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  unstable_rethrow: (error: unknown) => {
    throw error;
  },
}));

vi.mock("@/lib/ui/notify", () => ({
  notify: {
    error: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock("@/server/actions/public-inquiry", () => ({
  submitPublicInquiryAction: vi.fn(),
  submitPublicConversationMessageAction: vi.fn(),
}));

afterEach(() => {
  cleanup();
});

describe("public inquiry form pending state", () => {
  it("paints starting and preparing copy immediately and restores after an error", async () => {
    const user = userEvent.setup();
    let resolveAction: ((result: SecurityActionResult) => void) | undefined;
    const action = vi.fn(
      () =>
        new Promise<SecurityActionResult>((resolve) => {
          resolveAction = resolve;
        }),
    );

    render(
      <PublicInquiryForm
        organizationSlug="riverside"
        organizationName="Riverside Fun Center"
        action={action}
      />,
    );

    await user.type(screen.getByLabelText(/First name/), "Ada");
    await user.type(screen.getByLabelText(/Last name/), "Lovelace");
    await user.type(screen.getByLabelText(/^Email/), "ada@example.com");
    await user.type(screen.getByLabelText(/What are you planning/), "Birthday party");

    const submitPromise = user.click(screen.getByRole("button", { name: "Start conversation" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: PUBLIC_INQUIRY_PENDING_COPY })).toBeTruthy();
      expect(screen.getByText(PUBLIC_INQUIRY_PREPARING_COPY)).toBeTruthy();
      expect(action).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByRole("button", { name: PUBLIC_INQUIRY_PENDING_COPY })).toHaveProperty("disabled", true);
    expect(screen.getByLabelText(/First name/)).toHaveProperty("disabled", true);

    await user.click(screen.getByRole("button", { name: PUBLIC_INQUIRY_PENDING_COPY }));
    expect(action).toHaveBeenCalledTimes(1);

    resolveAction?.({ ok: false, message: "Try again later." });
    await submitPromise;

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Start conversation" })).toHaveProperty("disabled", false);
    });
    expect(screen.queryByText(PUBLIC_INQUIRY_PREPARING_COPY)).toBeNull();

    const retryPromise = user.click(screen.getByRole("button", { name: "Start conversation" }));
    await waitFor(() => {
      expect(screen.getByText(PUBLIC_INQUIRY_PREPARING_COPY)).toBeTruthy();
      expect(action).toHaveBeenCalledTimes(2);
    });
    resolveAction?.({ ok: false, message: "Still failing." });
    await retryPromise;
  });
});
