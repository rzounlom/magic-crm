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
      <form
        className="sticky bottom-0 space-y-3 border-t border-border-subtle bg-background/95 pt-4 backdrop-blur-md supports-[backdrop-filter]:bg-background/90"
        aria-busy={pending}
        data-conversation-composer
        onSubmit={onSubmit}
      >
        {!aiHandlingEnabled ? (
          <p className="text-sm text-muted-foreground">{PUBLIC_CONVERSATION_HANDOFF_COPY}</p>
        ) : null}
        <input type="hidden" name="token" value={token} />
        <label className="block text-sm">
          <span className="font-semibold text-foreground">Your message</span>
          <textarea
            name="message"
            required
            rows={3}
            maxLength={2000}
            disabled={pending}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            aria-describedby={pending ? "conversation-send-status" : undefined}
            className="mt-1.5 w-full min-h-24 rounded-[var(--radius-control)] border border-border bg-surface px-3 py-3 text-base shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] disabled:cursor-not-allowed sm:text-sm"
          />
        </label>
        <PendingSubmitButton
          pendingLabel={PUBLIC_CONVERSATION_SENDING_COPY}
          className="inline-flex min-h-12 w-full cursor-pointer items-center justify-center rounded-[var(--radius-control)] bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] disabled:cursor-not-allowed sm:w-auto"
        >
          Send message
        </PendingSubmitButton>
        {pending ? (
          <p id="conversation-send-status" className="sr-only" role="status">
            {PUBLIC_CONVERSATION_SENDING_COPY}
          </p>
        ) : null}
        <div ref={endRef} />
      </form>
    </PendingActionProvider>
  );
}
