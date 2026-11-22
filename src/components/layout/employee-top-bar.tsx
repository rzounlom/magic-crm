import type { ReactNode } from "react";
import Link from "next/link";

import { AppOverflowMenu } from "@/components/layout/app-overflow-menu";
import { OrganizationLocationContext } from "@/components/layout/organization-location-context";

type EmployeeTopBarProps = {
  publicInquiryHref?: string | null;
  organizationName?: string | null;
  locationName?: string | null;
  notifications?: ReactNode;
  organizationSwitcher: ReactNode;
  userButton: ReactNode;
};

export function EmployeeTopBar({
  publicInquiryHref = null,
  organizationName = null,
  locationName = null,
  notifications,
  organizationSwitcher,
  userButton,
}: EmployeeTopBarProps) {
  return (
    <header className="employee-app-header sticky top-0 z-30 border-b border-border/80 bg-background/95 backdrop-blur-md">
      <div className="employee-app-header-inner mx-auto flex w-full min-w-0 items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href="/app"
            className="brand-mark employee-top-bar-brand shrink-0"
            aria-label="MagicCRM home"
          >
            <span className="brand-mark-mark" aria-hidden>
              M
            </span>
            <span className="hidden sm:inline">MagicCRM</span>
          </Link>
          <OrganizationLocationContext
            organizationName={organizationName}
            locationName={locationName}
            className="min-w-0"
          />
        </div>

        <div className="flex min-w-0 shrink-0 items-center justify-end gap-1.5 sm:gap-2.5">
          {notifications ? <div className="shrink-0">{notifications}</div> : null}
          <AppOverflowMenu publicInquiryHref={publicInquiryHref} />
          <div className="min-w-0 max-w-[6.5rem] overflow-hidden sm:max-w-[11rem]">
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
