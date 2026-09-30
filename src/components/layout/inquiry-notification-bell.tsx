"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";

import { formatNotificationAge, formatUnreadBadge, type InquiryNotificationItem } from "@/lib/inquiries/inquiry-awareness";

export function InquiryNotificationBell({
  unreadCount,
  items,
  now = new Date(),
  onNavigate,
  onMarkAllRead,
  markingAll = false,
}: {
  unreadCount: number;
  items: InquiryNotificationItem[];
  now?: Date;
  onNavigate?: () => void;
  onMarkAllRead?: () => void;
  markingAll?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const badge = formatUnreadBadge(unreadCount);
  const label = badge ? `Notifications, ${unreadCount} unread` : "Notifications";

  useEffect(() => {
    if (!open) {
      return;
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }
    function onPointer(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointer);
    };
  }, [open]);

  return (
    <div className="relative shrink-0" ref={rootRef}>
      <button
        type="button"
        className="relative cursor-pointer rounded-md p-2 text-foreground hover:bg-muted"
        aria-label={label}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((current) => !current)}
      >
        <BellIcon />
        {badge ? (
          <span className="absolute top-0.5 right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
            {badge}
          </span>
        ) : null}
      </button>
      {open ? (
        <div
          id={panelId}
          role="region"
          aria-label="Notifications"
          className="absolute right-0 z-30 mt-2 w-80 rounded-2xl border border-border bg-surface p-3 shadow-xl"
        >
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold">Notifications</p>
            {unreadCount > 0 ? (
              <button
                type="button"
                className="cursor-pointer text-sm text-foreground/70 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                disabled={markingAll || !onMarkAllRead}
                aria-busy={markingAll}
                onClick={() => onMarkAllRead?.()}
              >
                {markingAll ? "Marking…" : "Mark all as read"}
              </button>
            ) : null}
          </div>
          {items.length === 0 ? (
            <p className="mt-3 text-sm text-foreground/60">No new inquiries.</p>
          ) : (
            <ul className="mt-2 max-h-80 space-y-1 overflow-y-auto">
              {items.map((item) => (
                <li key={item.id}>
                  <Link
                    href={item.href}
                    data-unread={item.unread ? "true" : "false"}
                    className={`block cursor-pointer rounded-md px-2 py-2 hover:bg-muted/70 ${
                      item.unread ? "bg-muted/40" : "text-foreground/70"
                    }`}
                    onClick={() => {
                      setOpen(false);
                      onNavigate?.();
                    }}
                  >
                    <span className="block text-sm font-medium text-foreground">{item.title}</span>
                    <span className="block text-sm">{item.customerLabel}</span>
                    {item.detail ? <span className="block text-xs text-foreground/60">{item.detail}</span> : null}
                    <span className="block text-xs text-foreground/50">{formatNotificationAge(item.createdAt, now)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <Link
            href="/app/inquiries"
            className="mt-3 block cursor-pointer text-sm font-medium text-primary"
            onClick={() => setOpen(false)}
          >
            View all inquiries
          </Link>
        </div>
      ) : null}
    </div>
  );
}

function BellIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M6 9a6 6 0 1 1 12 0c0 7 3 7 3 9H3c0-2 3-2 3-9Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <path d="M10 20a2 2 0 0 0 4 0" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}
