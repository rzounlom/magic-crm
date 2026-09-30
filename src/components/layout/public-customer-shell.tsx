import type { ReactNode } from "react";

import { PUBLIC_CONTENT_CLASS } from "@/components/layout/public-content";

type PublicCustomerShellProps = {
  brand?: string;
  children: ReactNode;
  contained?: boolean;
};

export function PublicCustomerShell({
  brand = "MagicCRM",
  children,
  contained = false,
}: PublicCustomerShellProps) {
  return (
    <div
      className={
        contained
          ? "flex h-dvh max-h-dvh flex-col overflow-hidden overflow-x-hidden bg-background text-foreground"
          : "flex min-h-full flex-col bg-background text-foreground"
      }
    >
      <header className="shrink-0 border-b border-border/80 bg-surface/90 backdrop-blur-md">
        <div className={`${PUBLIC_CONTENT_CLASS} flex h-16 items-center`}>
          <p className="brand-mark">
            <span className="brand-mark-mark" aria-hidden>
              {brand.slice(0, 1)}
            </span>
            {brand}
          </p>
        </div>
      </header>
      <main className={contained ? "flex min-h-0 flex-1 flex-col overflow-hidden" : "flex flex-1 flex-col"}>
        {children}
      </main>
    </div>
  );
}
