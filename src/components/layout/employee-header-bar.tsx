import type { ReactNode } from "react";
import Link from "next/link";

import { EmployeeContextChip } from "@/components/layout/employee-context-chip";
import { PublicInquiryLink } from "@/components/layout/public-inquiry-link";
import { ModuleNavLink } from "@/components/ui/module-nav-link";
import {
  EMPLOYEE_NAV_GROUP_LABELS,
  filterEmployeeNavItems,
  type EmployeeNavItemId,
} from "@/lib/ui/employee-navigation";

type EmployeeHeaderBarProps = {
  visibleNavIds: EmployeeNavItemId[];
  publicInquiryHref?: string | null;
  organizationName?: string | null;
  locationName?: string | null;
  notifications?: ReactNode;
  organizationSwitcher: ReactNode;
  userButton: ReactNode;
};

export function EmployeeHeaderBar({
  visibleNavIds,
  publicInquiryHref = null,
  organizationName = null,
  locationName = null,
  notifications,
  organizationSwitcher,
  userButton,
}: EmployeeHeaderBarProps) {
  const visible = new Set(visibleNavIds);
  const bookingsEvents = filterEmployeeNavItems(visible).filter((item) => item.group === "bookingsEvents");
  const catalog = filterEmployeeNavItems(visible).filter((item) => item.group === "catalog");
  const settings = filterEmployeeNavItems(visible).filter((item) => item.group === "settings");
  const hasDesktopNav = bookingsEvents.length > 0 || catalog.length > 0 || settings.length > 0;

  return (
    <header className="employee-app-header sticky top-0 z-30 border-b border-border/80 bg-background/95 backdrop-blur-md">
      <div className="employee-app-header-inner mx-auto grid w-full min-w-0 max-w-[90rem] grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2 sm:gap-x-3 px-4 sm:px-6 lg:px-8">
        <Link href="/app" className="brand-mark shrink-0" aria-label="MagicCRM home">
          <span className="brand-mark-mark" aria-hidden>
            M
          </span>
          <span className="hidden sm:inline">MagicCRM</span>
        </Link>

        {hasDesktopNav ? (
          <nav
            className="public-scroll col-start-2 hidden min-w-0 items-center gap-2 overflow-x-auto overflow-y-hidden lg:flex"
            aria-label="Modules"
          >
            {bookingsEvents.length > 0 ? (
              <NavGroup label={EMPLOYEE_NAV_GROUP_LABELS.bookingsEvents}>
                {bookingsEvents.map((item) => (
                  <ModuleNavLink key={item.id} href={item.href}>
                    {item.label}
                  </ModuleNavLink>
                ))}
              </NavGroup>
            ) : null}
            {catalog.length > 0 ? (
              <NavGroup label={EMPLOYEE_NAV_GROUP_LABELS.catalog}>
                {catalog.map((item) => (
                  <ModuleNavLink key={item.id} href={item.href}>
                    {item.label}
                  </ModuleNavLink>
                ))}
              </NavGroup>
            ) : null}
            {settings.length > 0 ? (
              <NavGroup label={EMPLOYEE_NAV_GROUP_LABELS.settings}>
                {settings.map((item) => (
                  <ModuleNavLink key={item.id} href={item.href}>
                    {item.label}
                  </ModuleNavLink>
                ))}
              </NavGroup>
            ) : null}
          </nav>
        ) : (
          <div className="hidden min-w-0 lg:block" />
        )}

        <div className="col-start-3 flex min-w-0 items-center justify-end gap-1.5 sm:gap-3">
          <EmployeeContextChip
            organizationName={organizationName}
            locationName={locationName}
            compact
          />
          {publicInquiryHref ? (
            <div className="hidden shrink-0 md:block">
              <PublicInquiryLink href={publicInquiryHref} />
            </div>
          ) : null}
          {notifications ? <div className="shrink-0">{notifications}</div> : null}
          <div className="min-w-0 max-w-[6.5rem] overflow-hidden sm:max-w-[11rem]">{organizationSwitcher}</div>
          <div className="shrink-0" data-employee-account>
            {userButton}
          </div>
        </div>
      </div>
    </header>
  );
}

function NavGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div
      role="group"
      aria-label={label}
      className="flex shrink-0 items-center gap-1 rounded-full bg-muted/80 p-1"
    >
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}
