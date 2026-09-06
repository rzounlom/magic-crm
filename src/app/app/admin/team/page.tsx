import Link from "next/link";

import { SecurityStatusPanel } from "@/components/layout/security-status-panel";
import { TeamSectionTabs } from "@/components/layout/team-section-tabs";
import { db } from "@/lib/db";
import { isAuthorizationError, isTeamManagementError, isTenantContextError } from "@/server/errors";
import { getRequestContext } from "@/server/get-request-context";
import { hasPermission } from "@/server/policies/require-permission";
import { listTeamEmployees } from "@/server/services/team-invitation-service";
import { PERMISSIONS } from "@/types/permissions";

type TeamView =
  | { kind: "status"; title: string; body: string }
  | {
      kind: "ready";
      canManage: boolean;
      employees: Awaited<ReturnType<typeof listTeamEmployees>>;
    };

async function loadTeamEmployeesView(): Promise<TeamView> {
  try {
    const ctx = await getRequestContext();
    const [employees, canManage] = await Promise.all([
      listTeamEmployees(ctx, db),
      hasPermission(ctx, PERMISSIONS.USERS_MANAGE, db),
    ]);
    return { kind: "ready", employees, canManage };
  } catch (error) {
    if (isAuthorizationError(error) || isTenantContextError(error) || isTeamManagementError(error)) {
      return { kind: "status", title: "Team", body: error.userMessage };
    }
    throw error;
  }
}

export default async function TeamEmployeesPage() {
  const view = await loadTeamEmployeesView();

  if (view.kind === "status") {
    return <SecurityStatusPanel title={view.title} body={view.body} />;
  }

  return (
    <section className="max-w-3xl">
      <p className="text-sm font-semibold tracking-[0.18em] text-primary uppercase">Admin</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground">Team</h1>
      <p className="mt-4 max-w-xl text-sm text-foreground/70">
        Employees in this organization. Security groups control what they can do in MagicCRM.
      </p>
      <TeamSectionTabs active="employees" canManage={view.canManage} />
      {view.employees.length === 0 ? (
        <p className="mt-8 text-sm text-foreground/70">No employees yet.</p>
      ) : (
        <ul className="mt-8 space-y-3">
          {view.employees.map((employee) => (
            <li key={employee.id}>
              <Link
                href={`/app/admin/team/${employee.id}`}
                className="flex items-center gap-3 rounded-md border border-border bg-background px-4 py-4 hover:bg-muted/60"
              >
                {employee.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={employee.avatarUrl}
                    alt=""
                    className="h-10 w-10 rounded-full object-cover"
                  />
                ) : (
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-sm font-medium text-foreground">
                    {(employee.displayName ?? employee.email ?? "?").slice(0, 1).toUpperCase()}
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-foreground">
                    {employee.displayName ?? employee.email ?? "Unknown employee"}
                  </span>
                  {employee.displayName && employee.email ? (
                    <span className="mt-0.5 block text-sm text-foreground/60">{employee.email}</span>
                  ) : null}
                  <span className="mt-1 block text-sm text-foreground/70">
                    {employee.groups.length > 0
                      ? employee.groups.map((group) => group.name).join(", ")
                      : "No security groups"}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
