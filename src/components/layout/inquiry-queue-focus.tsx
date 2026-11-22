"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

const FOCUS_SECTION_IDS: Record<string, string> = {
  pending: "pending-confirmation",
  review: "ready-for-live-agent",
  unread: "inquiry-queue-top",
};

/**
 * Scrolls the Active inquiry queue to the section matching ?focus=pending|review|unread.
 * Classification is unchanged — this is presentation-only deep-link support for Home tiles.
 */
export function InquiryQueueFocus() {
  const searchParams = useSearchParams();
  const focus = searchParams.get("focus");

  useEffect(() => {
    if (!focus) {
      return;
    }
    const sectionId = FOCUS_SECTION_IDS[focus];
    if (!sectionId) {
      return;
    }
    const target = document.getElementById(sectionId);
    if (!target) {
      return;
    }
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    target.setAttribute("data-queue-focus", "true");
    const timer = window.setTimeout(() => {
      target.removeAttribute("data-queue-focus");
    }, 2400);
    return () => window.clearTimeout(timer);
  }, [focus]);

  return null;
}
