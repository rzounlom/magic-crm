import type { ReactNode } from "react";
import { Suspense } from "react";

import { EmployeeHeaderBar } from "@/components/layout/employee-header-bar";
import {
  EmployeeOrganizationSwitcher,
  EmployeeUserButton,
} from "@/components/layout/employee-organization-controls";
import { AiKnowledgeNavLink } from "@/components/layout/ai-knowledge-nav-link";
import { InquiryNavLink } from "@/components/layout/inquiry-nav-link";
import { PublicInquiryNavLink } from "@/components/layout/public-inquiry-nav-link";
import { ResourcesNavLink } from "@/components/layout/resources-nav-link";
import { ScheduleNavLink } from "@/components/layout/schedule-nav-link";
import { SecurityAdminNavLink } from "@/components/layout/security-admin-nav-link";
import { TeamAdminNavLink } from "@/components/layout/team-admin-nav-link";

type EmployeeShellProps = {
  children: ReactNode;
};

export function EmployeeShell({ children }: EmployeeShellProps) {
  return (
    <div className="flex min-h-full flex-col bg-background text-foreground">
      <EmployeeHeaderBar
        inquiriesNav={
          <Suspense fallback={null}>
            <InquiryNavLink />
          </Suspense>
        }
        scheduleNav={
          <Suspense fallback={null}>
            <ScheduleNavLink />
          </Suspense>
        }
        resourcesNav={
          <Suspense fallback={null}>
            <ResourcesNavLink />
          </Suspense>
        }
        teamNav={
          <Suspense fallback={null}>
            <TeamAdminNavLink />
          </Suspense>
        }
        securityNav={
          <Suspense fallback={null}>
            <SecurityAdminNavLink />
          </Suspense>
        }
        knowledgeNav={
          <Suspense fallback={null}>
            <AiKnowledgeNavLink />
          </Suspense>
        }
        publicInquiryAction={
          <Suspense fallback={null}>
            <PublicInquiryNavLink />
          </Suspense>
        }
        organizationSwitcher={<EmployeeOrganizationSwitcher />}
        userButton={<EmployeeUserButton />}
      />
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-6 py-10">{children}</main>
    </div>
  );
}
