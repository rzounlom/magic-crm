import Link from "next/link";

import { SecurityActionForm } from "@/components/layout/security-action-form";
import { SecurityStatusPanel } from "@/components/layout/security-status-panel";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import {
  addEmployeeSecurityGroupAction,
  removeEmployeeSecurityGroupAction,
} from "@/server/actions/team";
import { SYSTEM_GROUP_KEYS } from "@/server/authorization/default-security-groups";
import { db } from "@/lib/db";
import { removeSecurityMemberConfirm } from "@/lib/ui/destructive-confirm";
import { isAuthorizationError, isTeamManagementError, isTenantContextError } from "@/server/errors";
import { getRequestContext } from "@/server/get-request-context";
import { hasPermission } from "@/server/policies/require-permission";
import { getTeamEmployeeDetail } from "@/server/services/team-invitation-service";
import { PERMISSIONS } from "@/types/permissions";

async function loadEmployeeView(userProfileId: string) {
  try {
    const ctx = await getRequestContext();
    const [employee, canManageGroups] = await Promise.all([
      getTeamEmployeeDetail(ctx, db, userProfileId),
      hasPermission(ctx, PERMISSIONS.SECURITY_GROUPS_MANAGE, db),
    ]);
    if (!employee) {
      return {
        kind: "status" as const,
        title: "Employee not found",
        body: "That employee is not in this organization.",
      };
    }
    return { kind: "ready" as const, employee, canManageGroups };
  } catch (error) {
    if (isAuthorizationError(error) || isTenantContextError(error) || isTeamManagementError(error)) {
      return { kind: "status" as const, title: "Team", body: error.userMessage };
    }
    throw error;
  }
}

export default async function TeamEmployeePage({
  params,
}: {
  params: Promise<{ userProfileId: string }>;
}) {
  const { userProfileId } = await params;
  const view = await loadEmployeeView(userProfileId);

  if (view.kind === "status") {
    return <SecurityStatusPanel title={view.title} body={view.body} />;
  }

  const { employee, canManageGroups } = view;
  const label = employee.displayName ?? employee.email ?? "this employee";

  return (
    <section className="max-w-xl">
      <Link href="/app/admin/team" className="text-sm text-primary">
        Back to team
      </Link>
      <div className="mt-4 flex items-center gap-3">
        {employee.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={employee.avatarUrl} alt="" className="h-12 w-12 rounded-full object-cover" />
        ) : null}
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">
            {employee.displayName ?? employee.email ?? "Unknown employee"}
          </h1>
          {employee.displayName && employee.email ? (
            <p className="mt-1 text-sm text-foreground/70">{employee.email}</p>
          ) : null}
        </div>
      </div>
      <h2 className="mt-10 text-lg font-semibold text-foreground">Security groups</h2>
      <ul className="mt-4 space-y-2">
        {employee.assignedGroups.length === 0 ? (
          <li className="text-sm text-foreground/70">No security groups yet.</li>
        ) : (
          employee.assignedGroups.map((group) => (
            <li
              key={group.id}
              className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm"
            >
              <span>
                <span className="font-medium text-foreground">{group.name}</span>
                {group.description ? (
                  <span className="mt-0.5 block text-foreground/60">{group.description}</span>
                ) : null}
              </span>
              {canManageGroups ? (
                <SecurityActionForm
                  action={removeEmployeeSecurityGroupAction}
                  confirm={removeSecurityMemberConfirm({
                    isAdministrators: group.systemKey === SYSTEM_GROUP_KEYS.ADMINISTRATORS,
                    memberLabel: label,
                    groupName: group.name,
                  })}
                  notice={{
                    successTitle: "Group removed",
                    errorTitle: "Unable to remove group",
                  }}
                >
                  <input type="hidden" name="securityGroupId" value={group.id} />
                  <input type="hidden" name="userProfileId" value={employee.id} />
                  <PendingSubmitButton pendingLabel="Removing…" className="text-destructive">
                    Remove
                  </PendingSubmitButton>
                </SecurityActionForm>
              ) : null}
            </li>
          ))
        )}
      </ul>
      {canManageGroups && employee.availableGroups.length > 0 ? (
        <SecurityActionForm
          action={addEmployeeSecurityGroupAction}
          className="mt-6 space-y-3"
          notice={{
            successTitle: "Group added",
            errorTitle: "Unable to add group",
          }}
        >
          <input type="hidden" name="userProfileId" value={employee.id} />
          <label className="block text-sm">
            <span className="text-foreground/70">Add security group</span>
            <select
              name="securityGroupId"
              required
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"
            >
              <option value="">Select a group</option>
              {employee.availableGroups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          </label>
          <PendingSubmitButton
            pendingLabel="Adding…"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Add
          </PendingSubmitButton>
        </SecurityActionForm>
      ) : null}
    </section>
  );
}
