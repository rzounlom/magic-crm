import type { ReactNode } from "react";

import { AssistantMarkdown } from "@/components/layout/assistant-markdown";
import { PublicConversationThinkingBanner } from "@/components/layout/public-conversation-pending";
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
  pendingCustomerMessage,
  thinking = false,
  children,
}: PublicConversationViewProps) {
  return (
    <section className="mx-auto flex w-full max-w-xl flex-1 flex-col px-6 py-12">
      <p className="text-sm font-semibold tracking-[0.18em] text-primary uppercase">
        {organizationName}
      </p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground">Event Assistant</h1>
      <p className="mt-3 text-sm text-foreground/70">
        You are chatting with the virtual Event Assistant for {organizationName}. A team member can
        take over if needed.
      </p>
      <ol className="mt-8 space-y-4">
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
          <li className="rounded-md border border-border bg-background px-4 py-3 text-sm">
            <p className="text-xs font-medium tracking-wide text-foreground/60 uppercase">
              Event Assistant
            </p>
            <div className="mt-2">
              <PublicConversationThinkingBanner />
            </div>
          </li>
        ) : null}
      </ol>
      {children}
    </section>
  );
}

function ConversationBubble({ senderType, content }: { senderType: string; content: string }) {
  return (
    <li
      className={`rounded-md border border-border px-4 py-3 text-sm ${
        senderType === MESSAGE_SENDER_TYPES.CUSTOMER ? "bg-muted/50" : "bg-background"
      }`}
    >
      <p className="text-xs font-medium tracking-wide text-foreground/60 uppercase">
        {senderType === MESSAGE_SENDER_TYPES.CUSTOMER
          ? "You"
          : senderType === MESSAGE_SENDER_TYPES.EMPLOYEE
            ? "Team"
            : "Event Assistant"}
      </p>
      {senderType === MESSAGE_SENDER_TYPES.AI ? (
        <AssistantMarkdown content={content} />
      ) : (
        <p className="mt-2 whitespace-pre-wrap text-foreground">{content}</p>
      )}
    </li>
  );
}
