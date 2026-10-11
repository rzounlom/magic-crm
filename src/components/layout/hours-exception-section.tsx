"use client";

import { useState, type ReactNode, type SyntheticEvent } from "react";

/**
 * Collapsible presentation for staff hours-exception work.
 * Blocking reasons stay outside this section; domain validation is unchanged.
 */
export function HoursExceptionSection({
  title,
  purposeNote,
  eventSummary,
  defaultOpen,
  children,
}: {
  title: string;
  purposeNote: string;
  eventSummary: string;
  /** Open when an active exception exists or staff must act on an overridable hours blocker. */
  defaultOpen: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <details
      className="mt-4 rounded-[var(--radius-control)] border border-border bg-background/70 px-3 py-3"
      open={open}
      onToggle={(event: SyntheticEvent<HTMLDetailsElement>) => {
        setOpen(event.currentTarget.open);
      }}
    >
      <summary className="cursor-pointer text-sm font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {title}
        <span className="mt-1 block text-xs font-normal text-muted-foreground">
          Exception path — not a routine workaround. Expand only when hours policy requires an
          authorized, event-scoped exception.
        </span>
      </summary>
      <div className="mt-3 border-t border-border pt-3">
        <p className="text-sm text-muted-foreground">{purposeNote}</p>
        <p className="mt-2 text-sm">
          <span className="text-muted-foreground">Exact window: </span>
          <span className="font-medium">{eventSummary}</span>
        </p>
        {children}
      </div>
    </details>
  );
}
