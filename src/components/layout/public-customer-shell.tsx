import type { ReactNode } from "react";

type PublicCustomerShellProps = {
  brand?: string;
  children: ReactNode;
};

export function PublicCustomerShell({ brand = "MagicCRM", children }: PublicCustomerShellProps) {
  return (
    <div className="flex min-h-full flex-col bg-background text-foreground">
      <header className="border-b border-border bg-muted/60">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center px-6">
          <p className="text-sm font-semibold tracking-wide text-foreground">{brand}</p>
        </div>
      </header>
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  );
}
