import type { ReactNode } from "react";
import { Suspense } from "react";

import { EmployeeHeaderBar } from "@/components/layout/employee-header-bar";
import {
  EmployeeOrganizationSwitcher,
  EmployeeUserButton,
} from "@/components/layout/employee-organization-controls";
import { SecurityAdminNavLink } from "@/components/layout/security-admin-nav-link";

type EmployeeShellProps = {
  children: ReactNode;
};

export function EmployeeShell({ children }: EmployeeShellProps) {
  return (
    <div className="flex min-h-full flex-col bg-background text-foreground">
      <EmployeeHeaderBar
        securityNav={
          <Suspense fallback={null}>
            <SecurityAdminNavLink />
          </Suspense>
        }
        organizationSwitcher={<EmployeeOrganizationSwitcher />}
        userButton={<EmployeeUserButton />}
      />
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-6 py-10">{children}</main>
    </div>
  );
}
