import { AdminBackLink, AdminFormSection, AdminSectionHeader, FormActionBar } from "@/components/layout/admin-form-chrome";
import { SecurityActionForm } from "@/components/layout/security-action-form";
import { SecurityStatusPanel } from "@/components/layout/security-status-panel";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { FieldSelect } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
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
      <AdminBackLink href="/app/admin/team">Back to team</AdminBackLink>
      <div className="mt-3 flex items-start gap-3">
        {employee.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={employee.avatarUrl} alt="" className="h-12 w-12 rounded-full object-cover" />
        ) : (
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-base font-medium text-foreground">
            {(employee.displayName ?? employee.email ?? "?").slice(0, 1).toUpperCase()}
          </span>
        )}
        <PageHeader
          eyebrow="Settings"
          title={employee.displayName ?? employee.email ?? "Unknown employee"}
          description={
            employee.displayName && employee.email
              ? employee.email
              : "Security group membership for this employee."
          }
        />
      </div>

      <div className="mt-10">
        <AdminSectionHeader
          title="Security groups"
          description="Groups control MagicCRM permissions. Membership is separate from signing in."
        />
      </div>
      <ul className="mt-4 space-y-2">
        {employee.assignedGroups.length === 0 ? (
          <li>
            <Card variant="flat" padding="sm">
              <p className="text-sm text-muted-foreground">No security groups yet.</p>
            </Card>
          </li>
        ) : (
          employee.assignedGroups.map((group) => (
            <li key={group.id}>
              <Card variant="flat" padding="sm" className="flex flex-wrap items-center justify-between gap-3">
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-foreground">{group.name}</span>
                    {group.systemKey === SYSTEM_GROUP_KEYS.ADMINISTRATORS ? (
                      <Badge tone="info">Administrators</Badge>
                    ) : null}
                  </span>
                  {group.description ? (
                    <span className="mt-0.5 block text-sm text-muted-foreground">{group.description}</span>
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
                    <PendingSubmitButton pendingLabel="Removing…" variant="destructive" size="sm">
                      Remove
                    </PendingSubmitButton>
                  </SecurityActionForm>
                ) : null}
              </Card>
            </li>
          ))
        )}
      </ul>
      {canManageGroups && employee.availableGroups.length > 0 ? (
        <SecurityActionForm
          action={addEmployeeSecurityGroupAction}
          className="mt-6"
          notice={{
            successTitle: "Group added",
            errorTitle: "Unable to add group",
          }}
        >
          <input type="hidden" name="userProfileId" value={employee.id} />
          <AdminFormSection title="Add security group">
            <FieldSelect label="Security group" name="securityGroupId" required>
              <option value="">Select a group</option>
              {employee.availableGroups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </FieldSelect>
            <FormActionBar className="border-0 pt-0">
              <PendingSubmitButton pendingLabel="Adding…" variant="primary">
                Add
              </PendingSubmitButton>
            </FormActionBar>
          </AdminFormSection>
        </SecurityActionForm>
      ) : null}
    </section>
  );
}
