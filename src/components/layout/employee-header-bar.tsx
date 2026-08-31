import type { ReactNode } from "react";
import Link from "next/link";

type EmployeeHeaderBarProps = {
  securityNav?: ReactNode;
  organizationSwitcher: ReactNode;
  userButton: ReactNode;
};

export function EmployeeHeaderBar({
  securityNav,
  organizationSwitcher,
  userButton,
}: EmployeeHeaderBarProps) {
  return (
    <header className="border-b border-border bg-muted/60">
      <div className="mx-auto flex h-14 w-full min-w-0 max-w-5xl items-center gap-3 px-4 sm:gap-4 sm:px-6">
        <Link
          href="/app"
          className="shrink-0 text-sm font-semibold tracking-wide text-foreground"
        >
          MagicCRM
        </Link>
        <div className="ml-auto flex min-w-0 flex-1 items-center justify-end gap-3">
          {securityNav ? <div className="shrink-0">{securityNav}</div> : null}
          <div className="flex min-w-0 items-center justify-end gap-3">
            <div className="min-w-0 max-w-[min(100%,12rem)] overflow-hidden sm:max-w-[16rem]">
              {organizationSwitcher}
            </div>
            <div className="shrink-0">{userButton}</div>
          </div>
        </div>
      </div>
    </header>
  );
}
