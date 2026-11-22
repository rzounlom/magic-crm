import Link from "next/link";
import type { ReactNode } from "react";

import { ModuleNavLink } from "@/components/ui/module-nav-link";
import {
  EMPLOYEE_NAV_GROUP_LABELS,
  navItemsByGroup,
  type EmployeeNavItemId,
} from "@/lib/ui/employee-navigation";

type EmployeeSidebarProps = {
  visibleNavIds: EmployeeNavItemId[];
};

export function EmployeeSidebar({ visibleNavIds }: EmployeeSidebarProps) {
  const visible = new Set(visibleNavIds);
  const primary = navItemsByGroup(visible, "primary");
  const tools = navItemsByGroup(visible, "tools");
  const settings = navItemsByGroup(visible, "settings");

  return (
    <aside
      className="employee-sidebar hidden lg:flex"
      aria-label="Workspace"
      data-employee-sidebar
    >
      <Link href="/app" className="brand-mark employee-sidebar-brand shrink-0" aria-label="MagicCRM home">
        <span className="brand-mark-mark" aria-hidden>
          M
        </span>
        <span>MagicCRM</span>
      </Link>

      <nav className="employee-sidebar-nav flex min-h-0 flex-1 flex-col overflow-y-auto" aria-label="Modules">
        <div className="flex flex-col gap-5">
          {primary.length > 0 ? (
            <SidebarSection title={EMPLOYEE_NAV_GROUP_LABELS.primary}>
              {primary.map((item) => (
                <ModuleNavLink key={item.id} href={item.href} variant="sidebar">
                  {item.label}
                </ModuleNavLink>
              ))}
            </SidebarSection>
          ) : null}
          {tools.length > 0 ? (
            <SidebarSection title={EMPLOYEE_NAV_GROUP_LABELS.tools}>
              {tools.map((item) => (
                <ModuleNavLink key={item.id} href={item.href} variant="sidebar">
                  {item.label}
                </ModuleNavLink>
              ))}
            </SidebarSection>
          ) : null}
        </div>
        {settings.length > 0 ? (
          <div className="mt-auto border-t border-border-subtle pt-4">
            <SidebarSection title={EMPLOYEE_NAV_GROUP_LABELS.settings}>
              {settings.map((item) => (
                <ModuleNavLink key={item.id} href={item.href} variant="sidebar">
                  {item.label}
                </ModuleNavLink>
              ))}
            </SidebarSection>
          </div>
        ) : null}
      </nav>
    </aside>
  );
}

function SidebarSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={title} className="flex flex-col gap-0.5">
      <p className="employee-sidebar-section-label px-2.5 pb-1">{title}</p>
      {children}
    </div>
  );
}
