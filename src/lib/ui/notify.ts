"use client";

import { toast } from "sonner";

import type { NotifyPayload, NotifyTone } from "@/lib/ui/notify-types";

function show(tone: NotifyTone, payload: NotifyPayload): void {
  toast[tone](payload.title, {
    description: payload.description,
  });
}

/**
 * Application notification API. Feature code should call this, not Sonner.
 */
export const notify = {
  success(payload: NotifyPayload): void {
    show("success", payload);
  },
  error(payload: NotifyPayload): void {
    show("error", payload);
  },
  warning(payload: NotifyPayload): void {
    show("warning", payload);
  },
  info(payload: NotifyPayload): void {
    show("info", payload);
  },
};
