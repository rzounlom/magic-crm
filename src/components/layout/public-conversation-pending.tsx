export const PUBLIC_CONVERSATION_SENDING_COPY = "Sending…";
export const PUBLIC_CONVERSATION_THINKING_COPY = "Event Assistant is thinking…";
export const PUBLIC_CONVERSATION_HANDOFF_COPY =
  "A team member is handling this conversation. You can still add a message.";

export function PublicConversationThinkingBanner() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center gap-3 rounded-md border border-border bg-muted/60 px-4 py-3 text-sm text-foreground"
    >
      <span className="inline-flex items-center gap-1" aria-hidden>
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current [animation-delay:160ms]" />
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current [animation-delay:320ms]" />
      </span>
      <span>{PUBLIC_CONVERSATION_THINKING_COPY}</span>
    </div>
  );
}
