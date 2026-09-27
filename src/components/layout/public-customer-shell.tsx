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
      <header className="shrink-0 border-b border-border bg-muted/60">
        <div className={`${PUBLIC_CONTENT_CLASS} flex h-14 items-center`}>
          <p className="text-sm font-semibold tracking-wide text-foreground">{brand}</p>
        </div>
      </header>
      <main className={contained ? "flex min-h-0 flex-1 flex-col overflow-hidden" : "flex flex-1 flex-col"}>
        {children}
      </main>
    </div>
  );
}
