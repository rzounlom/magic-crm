import type { ReactNode } from "react";

import { PUBLIC_CONTENT_CLASS } from "@/components/layout/public-content";

type PublicCustomerShellProps = {
  /** Platform brand in the header mark. Defaults to MagicCRM — never a tenant special-case. */
  brand?: string;
  /**
   * Optional host organization display name from trusted server resolution.
   * When present, the venue name is the primary header identity; platform brand stays understated.
   */
  organizationName?: string | null;
  children: ReactNode;
  contained?: boolean;
};

export function PublicCustomerShell({
  brand = "MagicCRM",
  organizationName = null,
  children,
  contained = false,
}: PublicCustomerShellProps) {
  const hostName = organizationName?.trim() || null;
  const mark = (hostName ?? brand).trim().slice(0, 1) || "M";

  return (
    <div
      className={
        contained
          ? "public-customer-shell flex h-dvh max-h-dvh flex-col overflow-hidden overflow-x-hidden bg-background text-foreground"
          : "public-customer-shell flex min-h-full flex-col bg-background text-foreground"
      }
      data-public-shell
    >
      <header className="public-customer-header shrink-0 border-b border-border/80 bg-surface/95 backdrop-blur-md">
        <div
          className={`${PUBLIC_CONTENT_CLASS} flex min-h-14 items-center justify-between gap-3 py-2 sm:min-h-16`}
        >
          <div className="brand-mark min-w-0">
            <span className="brand-mark-mark" aria-hidden>
              {mark}
            </span>
            {hostName ? (
              <span className="truncate text-[length:var(--text-body)] font-semibold" data-public-host title={hostName}>
                {hostName}
              </span>
            ) : (
              <span className="truncate">{brand}</span>
            )}
          </div>
          {hostName ? (
            <p className="shrink-0 text-[length:var(--text-caption)] font-medium text-muted-foreground">
              Powered by {brand}
            </p>
          ) : null}
        </div>
      </header>
      <main
        className={
          contained
            ? "flex min-h-0 flex-1 flex-col overflow-hidden"
            : "flex flex-1 flex-col pb-[max(1rem,env(safe-area-inset-bottom))]"
        }
      >
        {children}
      </main>
    </div>
  );
}
