/** @vitest-environment jsdom */

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PublicConversationForm } from "@/components/layout/public-conversation-form";
import {
  PUBLIC_CONVERSATION_SENDING_COPY,
  PUBLIC_CONVERSATION_THINKING_COPY,
} from "@/components/layout/public-conversation-pending";
import { PublicConversationView } from "@/components/layout/public-conversation-view";
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

function delayedAction() {
  let resolveAction: ((result: SecurityActionResult) => void) | undefined;
  const action = vi.fn(
    () =>
      new Promise<SecurityActionResult>((resolve) => {
        resolveAction = resolve;
      }),
  );
  return {
    action,
    resolve: (result: SecurityActionResult) => resolveAction?.(result),
  };
}

function ConversationHarness({
  action,
}: {
  action: (formData: FormData) => Promise<SecurityActionResult>;
}) {
  const [pendingCustomerMessage, setPendingCustomerMessage] = useState<string | null>(null);
  const [thinking, setThinking] = useState(false);
  return (
    <PublicConversationView
      organizationName="Riverside Fun Center"
      messages={[]}
      pendingCustomerMessage={pendingCustomerMessage}
      thinking={thinking}
    >
      <PublicConversationForm
        token="public-token"
        aiHandlingEnabled
        pendingCustomerMessage={pendingCustomerMessage}
        thinking={thinking}
        action={action}
        onPendingChange={(state) => {
          setPendingCustomerMessage(state.message);
          setThinking(state.thinking);
        }}
      />
    </PublicConversationView>
  );
}

describe("public conversation form pending state", () => {
  it("shows the customer message, Sending…, and thinking immediately, then clears after success", async () => {
    const user = userEvent.setup();
    const { action, resolve } = delayedAction();
    render(<ConversationHarness action={action} />);

    await user.type(screen.getByLabelText(/Your message/), "How much is Have a Blast for 14 kids?");
    const submitPromise = user.click(screen.getByRole("button", { name: "Send message" }));

    await waitFor(() => {
      expect(screen.getByText("How much is Have a Blast for 14 kids?")).toBeTruthy();
      expect(screen.getByText(PUBLIC_CONVERSATION_THINKING_COPY)).toBeTruthy();
      expect(screen.getByRole("button", { name: PUBLIC_CONVERSATION_SENDING_COPY })).toBeTruthy();
      expect(action).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByRole("button", { name: PUBLIC_CONVERSATION_SENDING_COPY })).toHaveProperty("disabled", true);
    expect(action).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: PUBLIC_CONVERSATION_SENDING_COPY }));
    expect(action).toHaveBeenCalledTimes(1);

    resolve({ ok: true });
    await submitPromise;
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Send message" })).toHaveProperty("disabled", false);
      expect(screen.queryByText(PUBLIC_CONVERSATION_THINKING_COPY)).toBeNull();
    });
  });

  it("clears pending after a transient failure so the customer can send again", async () => {
    const user = userEvent.setup();
    const { action, resolve } = delayedAction();
    render(<ConversationHarness action={action} />);

    await user.type(screen.getByLabelText(/Your message/), "What's included in Have It All?");
    const submitPromise = user.click(screen.getByRole("button", { name: "Send message" }));

    await waitFor(() => {
      expect(screen.getByText(PUBLIC_CONVERSATION_THINKING_COPY)).toBeTruthy();
      expect(action).toHaveBeenCalledTimes(1);
    });

    resolve({ ok: false, message: "I wasn't able to finish that response just now." });
    await submitPromise;

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Send message" })).toHaveProperty("disabled", false);
      expect(screen.queryByText(PUBLIC_CONVERSATION_THINKING_COPY)).toBeNull();
    });
    expect((screen.getByLabelText(/Your message/) as HTMLTextAreaElement).value).toBe(
      "What's included in Have It All?",
    );

    const retryPromise = user.click(screen.getByRole("button", { name: "Send message" }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: PUBLIC_CONVERSATION_SENDING_COPY })).toBeTruthy();
      expect(screen.getByText(PUBLIC_CONVERSATION_THINKING_COPY)).toBeTruthy();
      expect(action).toHaveBeenCalledTimes(2);
    });
    resolve({ ok: true });
    await retryPromise;
  });
});
