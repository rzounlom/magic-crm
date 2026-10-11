import type { ReactNode } from "react";

import {
  InquiryAwarenessProvider,
  InquiryNotificationControl,
} from "@/components/layout/inquiry-awareness-provider";
import { EmployeeHeaderBar } from "@/components/layout/employee-header-bar";
import { EmployeeMobileNav } from "@/components/layout/employee-mobile-nav";
import {
  EmployeeOrganizationSwitcher,
  EmployeeUserButton,
} from "@/components/layout/employee-organization-controls";
import { loadEmployeeShellChrome } from "@/components/layout/employee-shell-chrome";

type EmployeeShellProps = {
  children: ReactNode;
};

export async function EmployeeShell({ children }: EmployeeShellProps) {
  const chrome = await loadEmployeeShellChrome();

  return (
    <InquiryAwarenessProvider>
      <div className="employee-shell flex min-h-full flex-col overflow-x-hidden bg-background text-foreground">
        <EmployeeHeaderBar
          visibleNavIds={chrome.visibleNavIds}
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
    </InquiryAwarenessProvider>
  );
}
