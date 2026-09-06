"use client";

import { useState } from "react";

import { PublicConversationForm } from "@/components/layout/public-conversation-form";
import {
  PublicConversationView,
  type PublicConversationMessage,
} from "@/components/layout/public-conversation-view";

type PublicConversationPanelProps = {
  organizationName: string;
  messages: PublicConversationMessage[];
  token: string;
  aiHandlingEnabled: boolean;
};

export function PublicConversationPanel({
  organizationName,
  messages,
  token,
  aiHandlingEnabled,
}: PublicConversationPanelProps) {
  const [pendingCustomerMessage, setPendingCustomerMessage] = useState<string | null>(null);
  const [thinking, setThinking] = useState(false);
  const alreadyPersisted = messages.some(
    (message) =>
      message.senderType === "CUSTOMER" && message.content === pendingCustomerMessage,
  );

  return (
    <PublicConversationView
      organizationName={organizationName}
      messages={messages}
      pendingCustomerMessage={alreadyPersisted ? null : pendingCustomerMessage}
      thinking={thinking && aiHandlingEnabled}
    >
      <PublicConversationForm
        token={token}
        aiHandlingEnabled={aiHandlingEnabled}
        pendingCustomerMessage={pendingCustomerMessage}
        thinking={thinking}
        onPendingChange={(state) => {
          setPendingCustomerMessage(state.message);
          setThinking(state.thinking);
        }}
      />
    </PublicConversationView>
  );
}
