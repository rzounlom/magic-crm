import type { ReactNode } from "react";
import Link from "next/link";

type SiteShellProps = {
  children: ReactNode;
};

export function SiteShell({ children }: SiteShellProps) {
  return (
    <div className="flex min-h-full flex-col bg-background text-foreground">
      <header className="border-b border-border/80 bg-surface/90">
        <div className="mx-auto flex h-16 w-full max-w-[90rem] items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/" className="brand-mark">
            <span className="brand-mark-mark" aria-hidden>
              M
            </span>
            MagicCRM
          </Link>
          <Link href="/sign-in" className="rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground">
            Employee sign in
          </Link>
        </div>
      </header>
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  );
}
