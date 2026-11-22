"use client";

import { useEffect, useId, useRef, useState } from "react";

import { cn } from "@/lib/ui/cn";

type AppOverflowMenuProps = {
  publicInquiryHref?: string | null;
};

/**
 * Compact top-bar overflow for secondary utilities (Public Inquiry, etc.).
 * Only renders when there is at least one real action.
 */
export function AppOverflowMenu({ publicInquiryHref = null }: AppOverflowMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const hasItems = Boolean(publicInquiryHref);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    const onPointerDown = (event: MouseEvent | PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  if (!hasItems) {
    return null;
  }

  return (
    <div ref={rootRef} className="relative shrink-0" data-employee-overflow>
      <button
        ref={buttonRef}
        type="button"
        className={cn(
          "employee-overflow-trigger inline-flex size-9 items-center justify-center rounded-full border border-border-subtle bg-surface text-muted-foreground",
          "hover:bg-muted hover:text-foreground",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]",
          open && "bg-muted text-foreground",
        )}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label="More actions"
        onClick={() => setOpen((value) => !value)}
      >
        <OverflowIcon />
      </button>
      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label="More actions"
          className="absolute right-0 top-[calc(100%+0.35rem)] z-40 min-w-[12.5rem] rounded-[var(--radius-control)] border border-border bg-surface p-1 shadow-[var(--shadow-overlay)]"
        >
          {publicInquiryHref ? (
            <a
              role="menuitem"
              href={publicInquiryHref}
              target="_blank"
              rel="noopener noreferrer"
              className="employee-overflow-item flex items-center gap-2 rounded-[var(--radius-control)] px-3 py-2.5 text-sm font-semibold text-foreground hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
              onClick={() => setOpen(false)}
            >
              <ExternalIcon />
              <span>Public inquiry</span>
            </a>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function OverflowIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className="size-4" fill="currentColor">
      <circle cx="3" cy="8" r="1.25" />
      <circle cx="8" cy="8" r="1.25" />
      <circle cx="13" cy="8" r="1.25" />
    </svg>
  );
}

function ExternalIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className="size-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M6.5 3.5H3.5v9h9v-3M8.5 3.5H12.5V7.5M7 9l5.5-5.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
