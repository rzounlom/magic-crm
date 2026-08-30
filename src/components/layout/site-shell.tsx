import type { ReactNode } from "react";

type SiteShellProps = {
  children: ReactNode;
};

export function SiteShell({ children }: SiteShellProps) {
  return (
    <div className="flex min-h-full flex-col bg-background text-foreground">
      <header className="border-b border-border bg-muted/60">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center px-6">
          <span className="text-sm font-semibold tracking-wide text-foreground">
            MagicCRM
          </span>
        </div>
      </header>
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  );
}
