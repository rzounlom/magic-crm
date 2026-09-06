import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  PUBLIC_CONVERSATION_HANDOFF_COPY,
  PUBLIC_CONVERSATION_SENDING_COPY,
  PUBLIC_CONVERSATION_THINKING_COPY,
  PublicConversationThinkingBanner,
} from "@/components/layout/public-conversation-pending";
import { PublicConversationView } from "@/components/layout/public-conversation-view";
import { PendingActionProvider, PendingSubmitButton } from "@/components/ui/pending-submit-button";
import { onSafeSubmitAttempt } from "@/lib/ui/confirm-gate";
import { MESSAGE_SENDER_TYPES } from "@/types/inquiry";

describe("public conversation pending UX", () => {
  it("disables send and shows the sending label immediately", () => {
    const html = renderToStaticMarkup(
      <PendingActionProvider pending>
        <PendingSubmitButton pendingLabel={PUBLIC_CONVERSATION_SENDING_COPY}>
          Send message
        </PendingSubmitButton>
      </PendingActionProvider>,
    );
    expect(html).toContain("disabled");
    expect(html).toContain(PUBLIC_CONVERSATION_SENDING_COPY);
    expect(html).not.toContain("Send message");
    expect(html).not.toContain("OpenAI");
  });

  it("shows Event Assistant is thinking while waiting", () => {
    const html = renderToStaticMarkup(
      <PublicConversationView
        organizationName="Riverside Fun Center"
        messages={[
          {
            id: "c1",
            senderType: MESSAGE_SENDER_TYPES.CUSTOMER,
            content: "What would Have a Blast cost for 14 kids?",
          },
        ]}
        pendingCustomerMessage={null}
        thinking
      >
        <PendingActionProvider pending>
          <PendingSubmitButton pendingLabel={PUBLIC_CONVERSATION_THINKING_COPY}>
            Send message
          </PendingSubmitButton>
        </PendingActionProvider>
      </PublicConversationView>,
    );
    expect(html).toContain(PUBLIC_CONVERSATION_THINKING_COPY);
    expect(html).toContain("disabled");
    expect(html).not.toContain("model");
    expect(html).not.toContain("tokens");
  });

  it("blocks duplicate submits and allows another send after pending clears", () => {
    expect(onSafeSubmitAttempt(true)).toBe("block");
    expect(onSafeSubmitAttempt(false)).toBe("run");
    const html = renderToStaticMarkup(
      <PendingActionProvider pending={false}>
        <PendingSubmitButton pendingLabel={PUBLIC_CONVERSATION_SENDING_COPY}>
          Send message
        </PendingSubmitButton>
      </PendingActionProvider>,
    );
    expect(html).toContain("Send message");
    expect(html).not.toContain("disabled=\"\"");
    expect(html).not.toContain("aria-busy=\"true\"");
  });

  it("shows an optimistic customer message as plain text", () => {
    const html = renderToStaticMarkup(
      <PublicConversationView
        organizationName="Riverside Fun Center"
        messages={[]}
        pendingCustomerMessage="**hello**"
        thinking
      >
        <p>composer</p>
      </PublicConversationView>,
    );
    expect(html).toContain("**hello**");
    expect(html).not.toContain("<strong>hello</strong>");
    expect(html).toContain(PUBLIC_CONVERSATION_THINKING_COPY);
  });

  it("keeps the composer after explicit human takeover", () => {
    const html = renderToStaticMarkup(
      <PublicConversationView
        organizationName="Riverside Fun Center"
        messages={[
          {
            id: "a1",
            senderType: MESSAGE_SENDER_TYPES.AI,
            content: "I've passed this to a team member who can help from here.",
          },
        ]}
      >
        <p>{PUBLIC_CONVERSATION_HANDOFF_COPY}</p>
        <button type="submit">Send message</button>
      </PublicConversationView>,
    );
    expect(html).toContain(PUBLIC_CONVERSATION_HANDOFF_COPY);
    expect(html).toContain("Send message");
  });

  it("does not show takeover copy for a thinking or failed assistant wait", () => {
    const html = renderToStaticMarkup(
      <PublicConversationThinkingBanner />,
    );
    expect(html).toContain(PUBLIC_CONVERSATION_THINKING_COPY);
    expect(html).not.toContain(PUBLIC_CONVERSATION_HANDOFF_COPY);
    const source = readFileSync(
      path.join(process.cwd(), "src/components/layout/public-conversation-form.tsx"),
      "utf8",
    );
    expect(source).toContain("aiHandlingEnabled");
    expect(source).toContain("onSafeSubmitAttempt");
    expect(source).toContain("yieldToPaint");
    expect(source).toContain("onSubmit");
  });
});
