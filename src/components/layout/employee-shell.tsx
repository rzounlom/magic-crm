import type { ReactNode } from "react";

import {
  InquiryAwarenessProvider,
  InquiryNotificationControl,
} from "@/components/layout/inquiry-awareness-provider";
import { EmployeeMobileNav } from "@/components/layout/employee-mobile-nav";
import {
  EmployeeOrganizationSwitcher,
  EmployeeUserButton,
} from "@/components/layout/employee-organization-controls";
import { EmployeeSidebar } from "@/components/layout/employee-sidebar";
import { EmployeeTopBar } from "@/components/layout/employee-top-bar";
import { loadEmployeeShellChrome } from "@/components/layout/employee-shell-chrome";

type EmployeeShellProps = {
  children: ReactNode;
};

export async function EmployeeShell({ children }: EmployeeShellProps) {
  const chrome = await loadEmployeeShellChrome();

  return (
    <InquiryAwarenessProvider>
      <div className="employee-shell flex min-h-full overflow-x-hidden bg-background text-foreground">
        <EmployeeSidebar visibleNavIds={chrome.visibleNavIds} />
        <div className="employee-shell-column flex min-w-0 flex-1 flex-col">
          <EmployeeTopBar
            publicInquiryHref={chrome.publicInquiryHref}
            organizationName={chrome.organizationName}
            locationName={chrome.locationName}
            notifications={<InquiryNotificationControl />}
            organizationSwitcher={<EmployeeOrganizationSwitcher />}
            userButton={<EmployeeUserButton />}
          />
          <main className="employee-shell-main mx-auto flex w-full max-w-[90rem] flex-1 flex-col px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
            {children}
          </main>
          <EmployeeMobileNav
            visibleNavIds={chrome.visibleNavIds}
            publicInquiryHref={chrome.publicInquiryHref}
          />
        </div>
      </div>
    </InquiryAwarenessProvider>
  );
}
