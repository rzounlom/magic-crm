import type { ReactNode } from "react";

import { AssistantMarkdown } from "@/components/layout/assistant-markdown";
import { PublicConversationThinkingBanner } from "@/components/layout/public-conversation-pending";
import { PLANNER_FRAME_CLASS } from "@/components/layout/public-content";
import { MESSAGE_SENDER_TYPES } from "@/types/inquiry";

export type PublicConversationMessage = {
  id: string;
  senderType: string;
  content: string;
};

type PublicConversationViewProps = {
  organizationName: string;
  messages: PublicConversationMessage[];
  pendingCustomerMessage?: string | null;
  thinking?: boolean;
  children: ReactNode;
};

export function PublicConversationView({
  organizationName,
  messages,
  pendingCustomerMessage = null,
  thinking = false,
  children,
}: PublicConversationViewProps) {
  const empty = messages.length === 0 && !pendingCustomerMessage && !thinking;

  return (
    <section className={`${PLANNER_FRAME_CLASS} flex flex-1 flex-col py-6 sm:py-10`}>
      <header className="shrink-0">
        <p className="page-eyebrow">{organizationName}</p>
        <h1 className="page-title text-[1.5rem] sm:text-[length:var(--text-display)]">Event Assistant</h1>
        <p className="page-description">
          You are chatting with the virtual Event Assistant for {organizationName}. A team member can
          take over if needed.
        </p>
      </header>

      {empty ? (
        <div
          className="mt-8 rounded-[var(--radius-card)] border border-border-subtle bg-surface px-4 py-6 text-sm text-muted-foreground"
          data-conversation-empty
        >
          No messages yet. Ask a question about your event options below.
        </div>
      ) : (
        <ol className="mt-8 space-y-3" aria-label="Conversation messages" data-conversation-timeline>
          {messages.map((message) => (
            <ConversationBubble key={message.id} senderType={message.senderType} content={message.content} />
          ))}
          {pendingCustomerMessage ? (
            <ConversationBubble
              senderType={MESSAGE_SENDER_TYPES.CUSTOMER}
              content={pendingCustomerMessage}
            />
          ) : null}
          {thinking ? (
            <li className="rounded-[var(--radius-control)] border border-border bg-surface px-4 py-3 text-sm shadow-sm">
              <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Event Assistant
              </p>
              <div className="mt-2">
                <PublicConversationThinkingBanner />
              </div>
            </li>
          ) : null}
        </ol>
      )}

      <div className="mt-auto pt-6 pb-[max(0.5rem,env(safe-area-inset-bottom))]">{children}</div>
    </section>
  );
}

function ConversationBubble({ senderType, content }: { senderType: string; content: string }) {
  const isCustomer = senderType === MESSAGE_SENDER_TYPES.CUSTOMER;
  const label =
    senderType === MESSAGE_SENDER_TYPES.CUSTOMER
      ? "You"
      : senderType === MESSAGE_SENDER_TYPES.EMPLOYEE
        ? "Team"
        : "Event Assistant";

  return (
    <li
      className={
        isCustomer
          ? "ml-4 rounded-[var(--radius-control)] border border-primary/20 bg-primary/5 px-4 py-3 text-sm sm:ml-10"
          : "mr-4 rounded-[var(--radius-control)] border border-border bg-surface px-4 py-3 text-sm shadow-sm sm:mr-10"
      }
      data-sender={senderType}
    >
      <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{label}</p>
      {senderType === MESSAGE_SENDER_TYPES.AI ? (
        <div className="mt-2 break-words text-foreground">
          <AssistantMarkdown content={content} />
        </div>
      ) : (
        <p className="mt-2 whitespace-pre-wrap break-words text-foreground">{content}</p>
      )}
    </li>
  );
}
