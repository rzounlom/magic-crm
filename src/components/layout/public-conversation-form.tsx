"use client";

import { useRouter } from "next/navigation";
import { unstable_rethrow } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";

import {
  PUBLIC_CONVERSATION_HANDOFF_COPY,
  PUBLIC_CONVERSATION_SENDING_COPY,
} from "@/components/layout/public-conversation-pending";
import { PendingActionProvider, PendingSubmitButton } from "@/components/ui/pending-submit-button";
import { onSafeSubmitAttempt } from "@/lib/ui/confirm-gate";
import { notify } from "@/lib/ui/notify";
import { yieldToPaint } from "@/lib/ui/yield-to-paint";
import { submitPublicConversationMessageAction } from "@/server/actions/public-inquiry";
import type { SecurityActionResult } from "@/types/security-action";

type PublicConversationFormProps = {
  token: string;
  aiHandlingEnabled: boolean;
  pendingCustomerMessage?: string | null;
  thinking?: boolean;
  onPendingChange?: (state: { message: string | null; thinking: boolean }) => void;
  action?: (formData: FormData) => Promise<SecurityActionResult>;
};

export function PublicConversationForm({
  token,
  aiHandlingEnabled,
  pendingCustomerMessage = null,
  thinking = false,
  onPendingChange,
  action = submitPublicConversationMessageAction,
}: PublicConversationFormProps) {
  const router = useRouter();
  const pendingRef = useRef(false);
  const [pending, setPending] = useState(false);
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  useEffect(() => {
    function onScroll() {
      const fromBottom =
        document.documentElement.scrollHeight - window.scrollY - window.innerHeight;
      stickToBottom.current = fromBottom < 140;
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if ((pending || thinking || pendingCustomerMessage) && stickToBottom.current) {
      endRef.current?.scrollIntoView?.({ behavior: "smooth", block: "end" });
    }
  }, [pending, thinking, pendingCustomerMessage]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (onSafeSubmitAttempt(pendingRef.current) === "block") {
      return;
    }

    const formData = new FormData(event.currentTarget);
    const message = String(formData.get("message") ?? "").trim();
    if (!message) {
      return;
    }

    formData.set("submissionId", crypto.randomUUID());
    pendingRef.current = true;
    setPending(true);
    setDraft("");
    onPendingChange?.({ message, thinking: aiHandlingEnabled });
    await yieldToPaint();

    try {
      const result = await action(formData);
      if (!result.ok) {
        notify.error({
          title: result.title ?? "Unable to send message",
          description: result.message,
        });
        setDraft(message);
        onPendingChange?.({ message: null, thinking: false });
        return;
      }
      onPendingChange?.({ message, thinking: false });
      router.refresh();
    } catch (error) {
      unstable_rethrow(error);
      notify.error({
        title: "Unable to send message",
        description: "Something went wrong. Try again.",
      });
      setDraft(message);
      onPendingChange?.({ message: null, thinking: false });
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }

  return (
    <PendingActionProvider pending={pending}>
      <form className="mt-6 space-y-3" aria-busy={pending} onSubmit={onSubmit}>
        {!aiHandlingEnabled ? (
          <p className="text-sm text-foreground/70">{PUBLIC_CONVERSATION_HANDOFF_COPY}</p>
        ) : null}
        <input type="hidden" name="token" value={token} />
        <label className="block text-sm">
          <span className="text-foreground/70">Your message</span>
          <textarea
            name="message"
            required
            rows={3}
            maxLength={2000}
            disabled={pending}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 disabled:cursor-not-allowed"
          />
        </label>
        <PendingSubmitButton
          pendingLabel={PUBLIC_CONVERSATION_SENDING_COPY}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Send message
        </PendingSubmitButton>
        <div ref={endRef} />
      </form>
    </PendingActionProvider>
  );
}
