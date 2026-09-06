import type { ReactNode } from "react";
import Link from "next/link";

type EmployeeHeaderBarProps = {
  inquiriesNav?: ReactNode;
  teamNav?: ReactNode;
  securityNav?: ReactNode;
  knowledgeNav?: ReactNode;
  publicInquiryAction?: ReactNode;
  organizationSwitcher: ReactNode;
  userButton: ReactNode;
};

export function EmployeeHeaderBar({
  inquiriesNav,
  teamNav,
  securityNav,
  knowledgeNav,
  publicInquiryAction,
  organizationSwitcher,
  userButton,
}: EmployeeHeaderBarProps) {
  const hasModuleNav = inquiriesNav || teamNav || securityNav || knowledgeNav;
  return (
    <header className="border-b border-border bg-muted/60">
      <div className="mx-auto flex h-14 w-full min-w-0 max-w-5xl items-center gap-3 px-4 sm:gap-4 sm:px-6">
        <Link
          href="/app"
          className="shrink-0 text-sm font-semibold tracking-wide text-foreground"
        >
          MagicCRM
        </Link>
        {hasModuleNav ? (
          <nav
            className="flex min-w-0 flex-1 items-center justify-end overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            aria-label="Modules"
          >
            <div className="flex w-max items-center gap-3">
              {inquiriesNav}
              {teamNav}
              {securityNav}
              {knowledgeNav}
            </div>
          </nav>
        ) : (
          <div className="min-w-0 flex-1" />
        )}
        {publicInquiryAction ? <div className="shrink-0">{publicInquiryAction}</div> : null}
        <div className="flex min-w-0 items-center justify-end gap-3">
          <div className="min-w-0 max-w-[min(40%,10rem)] overflow-hidden sm:max-w-[16rem]">
            {organizationSwitcher}
          </div>
          <div className="shrink-0" data-employee-account>
            {userButton}
          </div>
        </div>
      </div>
    </header>
  );
}
