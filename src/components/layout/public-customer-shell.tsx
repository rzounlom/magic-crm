import type { ReactNode } from "react";

import { PUBLIC_CONTENT_CLASS } from "@/components/layout/public-content";

type PublicCustomerShellProps = {
  /** Platform brand in the header mark. Defaults to MagicCRM — never a tenant special-case. */
  brand?: string;
  /**
   * Optional host organization display name from trusted server resolution.
   * Shown as secondary identity; does not replace the platform brand.
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
  const mark = brand.trim().slice(0, 1) || "M";

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
            <span className="truncate">{brand}</span>
          </div>
          {organizationName ? (
            <p
              className="max-w-[50%] truncate text-right text-[length:var(--text-caption)] font-semibold text-muted-foreground sm:text-[length:var(--text-label)]"
              data-public-host
              title={organizationName}
            >
              {organizationName}
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
