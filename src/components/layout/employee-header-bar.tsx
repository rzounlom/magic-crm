import type { ReactNode } from "react";
import Link from "next/link";

type EmployeeHeaderBarProps = {
  inquiriesNav?: ReactNode;
  bookingsNav?: ReactNode;
  scheduleNav?: ReactNode;
  resourcesNav?: ReactNode;
  teamNav?: ReactNode;
  securityNav?: ReactNode;
  knowledgeNav?: ReactNode;
  publicInquiryAction?: ReactNode;
  notifications?: ReactNode;
  organizationSwitcher: ReactNode;
  userButton: ReactNode;
};

export function EmployeeHeaderBar({
  inquiriesNav,
  bookingsNav,
  scheduleNav,
  resourcesNav,
  teamNav,
  securityNav,
  knowledgeNav,
  publicInquiryAction,
  notifications,
  organizationSwitcher,
  userButton,
}: EmployeeHeaderBarProps) {
  const hasModuleNav =
    inquiriesNav || bookingsNav || scheduleNav || resourcesNav || teamNav || securityNav || knowledgeNav;
  return (
    <header className="sticky top-0 z-30 border-b border-border/80 bg-background/90 backdrop-blur-md">
      <div className="mx-auto grid w-full min-w-0 max-w-[90rem] grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 px-4 py-2 sm:px-6 lg:h-16 lg:gap-4 lg:px-8 lg:py-0">
        <Link href="/app" className="brand-mark shrink-0" aria-label="MagicCRM">
          <span className="brand-mark-mark" aria-hidden>
            M
          </span>
          <span className="hidden sm:inline">MagicCRM</span>
        </Link>
        {hasModuleNav ? (
          <nav
            className="public-scroll col-span-3 row-start-2 min-w-0 overflow-x-auto overflow-y-hidden lg:col-span-1 lg:col-start-2 lg:row-start-1"
            aria-label="Modules"
          >
            <div className="flex w-max items-center gap-1 rounded-full bg-muted/80 p-1">
              {inquiriesNav}
              {bookingsNav}
              {scheduleNav}
              {resourcesNav}
              {teamNav}
              {securityNav}
              {knowledgeNav}
            </div>
          </nav>
        ) : (
          <div className="hidden min-w-0 lg:block" />
        )}
        <div className="col-start-3 row-start-1 flex min-w-0 items-center justify-end gap-2 sm:gap-3">
          {publicInquiryAction ? <div className="hidden shrink-0 md:block">{publicInquiryAction}</div> : null}
          {notifications ? <div className="shrink-0">{notifications}</div> : null}
          <div className="min-w-0 max-w-[7.5rem] overflow-hidden sm:max-w-[16rem]">{organizationSwitcher}</div>
          <div className="shrink-0" data-employee-account>
            {userButton}
          </div>
        </div>
      </div>
    </header>
  );
}
