import type { ReactNode } from "react";
import Link from "next/link";

import { EmployeeOrganizationControls } from "@/components/layout/employee-organization-controls";

type EmployeeShellProps = {
  children: ReactNode;
};

export function EmployeeShell({ children }: EmployeeShellProps) {
  return (
    <div className="flex min-h-full flex-col bg-background text-foreground">
      <header className="border-b border-border bg-muted/60">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-6">
          <Link href="/app" className="text-sm font-semibold tracking-wide text-foreground">
            MagicCRM
          </Link>
          <EmployeeOrganizationControls />
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-6 py-10">{children}</main>
    </div>
  );
}
