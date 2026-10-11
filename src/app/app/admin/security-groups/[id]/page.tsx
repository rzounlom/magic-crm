import {
  AdminBackLink,
  AdminChoiceRow,
  AdminFormSection,
  AdminSectionHeader,
  FormActionBar,
} from "@/components/layout/admin-form-chrome";
import { EmployeeMemberPicker } from "@/components/layout/employee-member-picker";
import { SecurityActionForm } from "@/components/layout/security-action-form";
import { SecurityAuthorizationNote } from "@/components/layout/security-authorization-note";
import { SecurityStatusPanel } from "@/components/layout/security-status-panel";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { FieldInput, FieldTextarea } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import {
  deleteSecurityGroupConfirm,
  removeSecurityMemberConfirm,
} from "@/lib/ui/destructive-confirm";
import {
  addSecurityGroupMemberAction,
  deleteSecurityGroupAction,
  refreshEmployeeIdentitiesAction,
  removeSecurityGroupMemberAction,
  setSecurityGroupPermissionsAction,
  updateSecurityGroupAction,
} from "@/server/actions/security-groups";
import { SYSTEM_GROUP_KEYS } from "@/server/authorization/default-security-groups";
import { createClerkUserIdentityDirectory } from "@/lib/auth/clerk-user-identity";
import { db } from "@/lib/db";
import { formatUserDisplayLabel, resolveUserDisplayName, userIdentitySearchText } from "@/lib/identity/user-display";
import { isAuthorizationError, isTenantContextError } from "@/server/errors";
import { getRequestContext } from "@/server/get-request-context";
import { hasPermission } from "@/server/policies/require-permission";
import { tryRefreshTenantEmployeeIdentities } from "@/server/services/refresh-tenant-employee-identities";
import {
  getSecurityGroupDetail,
  listOrganizationUserProfiles,
} from "@/server/services/security-group-service";
import {
  PERMISSION_CATALOG,
  PERMISSIONS,
  REQUIRED_ADMIN_PERMISSIONS,
  type PermissionCatalogEntry,
} from "@/types/permissions";

type SecurityGroupDetail = NonNullable<Awaited<ReturnType<typeof getSecurityGroupDetail>>>;
type OrganizationProfile = Awaited<ReturnType<typeof listOrganizationUserProfiles>>[number];

type DetailView =
  | { kind: "status"; title: string; body: string }
  | { kind: "ready"; group: SecurityGroupDetail; profiles: OrganizationProfile[]; canManage: boolean };

async function loadSecurityGroupDetail(id: string): Promise<DetailView> {
  try {
    const ctx = await getRequestContext();
    await tryRefreshTenantEmployeeIdentities(ctx, db, createClerkUserIdentityDirectory());
    const [group, profiles, canManage] = await Promise.all([
      getSecurityGroupDetail(ctx, db, id),
      listOrganizationUserProfiles(ctx, db),
      hasPermission(ctx, PERMISSIONS.SECURITY_GROUPS_MANAGE, db),
    ]);

    if (!group) {
      return {
        kind: "status",
        title: "Group not found",
        body: "That security group is not in this organization.",
      };
    }

    return { kind: "ready", group, profiles, canManage };
  } catch (error) {
    if (isAuthorizationError(error) || isTenantContextError(error)) {
      return { kind: "status", title: "Security groups", body: error.userMessage };
    }
    throw error;
  }
}

function groupPermissionsByModule(entries: readonly PermissionCatalogEntry[]) {
  const modules: Array<{ module: string; entries: PermissionCatalogEntry[] }> = [];
  for (const entry of entries) {
    const existing = modules.find((row) => row.module === entry.module);
    if (existing) {
      existing.entries.push(entry);
    } else {
      modules.push({ module: entry.module, entries: [entry] });
    }
  }
  return modules;
}

function moduleLabel(module: string): string {
  return module.replaceAll("_", " ");
}

export default async function SecurityGroupDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const view = await loadSecurityGroupDetail(id);

  if (view.kind === "status") {
    return <SecurityStatusPanel title={view.title} body={view.body} />;
  }

  return (
    <SecurityGroupDetailView
      group={view.group}
      profiles={view.profiles}
      canManage={view.canManage}
    />
  );
}

function SecurityGroupDetailView({
  group,
  profiles,
  canManage,
}: {
  group: SecurityGroupDetail;
  profiles: OrganizationProfile[];
  canManage: boolean;
}) {
  const assignedKeys = new Set(group.permissions.map((row) => row.permissionDefinition.key));
  const memberIds = new Set(group.members.map((row) => row.userProfileId));
  const isAdministrators = group.systemKey === SYSTEM_GROUP_KEYS.ADMINISTRATORS;
  const lockedPermissions = new Set<string>(isAdministrators ? REQUIRED_ADMIN_PERMISSIONS : []);
  const permissionModules = groupPermissionsByModule(PERMISSION_CATALOG);

  return (
    <section className="max-w-3xl space-y-10">
      <div>
        <AdminBackLink href="/app/admin/security-groups">All security groups</AdminBackLink>
        <div className="mt-3">
          <PageHeader
            eyebrow="Settings"
            title={group.name}
            description={
              isAdministrators
                ? "This protected group must keep at least one member and core admin permissions."
                : "Assign permissions and employees for this group."
            }
            actions={
              isAdministrators ? <Badge tone="info">Administrators</Badge> : group.isSystem ? (
                <Badge tone="neutral">Default</Badge>
              ) : (
                <Badge tone="neutral">Custom</Badge>
              )
            }
          />
        </div>
        <SecurityAuthorizationNote administrators={isAdministrators} />
        {canManage ? (
          <SecurityActionForm
            action={refreshEmployeeIdentitiesAction}
            className="mt-4"
            notice={{
              successTitle: "Employee details refreshed",
              errorTitle: "Unable to refresh employee details",
            }}
          >
            <PendingSubmitButton pendingLabel="Refreshing…" variant="ghost" size="sm">
              Refresh employee details
            </PendingSubmitButton>
          </SecurityActionForm>
        ) : null}
      </div>

      <SecurityActionForm
        action={updateSecurityGroupAction}
        notice={{
          successTitle: "Group updated",
          successDescription: "Group details were saved.",
          errorTitle: "Unable to save group details",
        }}
      >
        <input type="hidden" name="securityGroupId" value={group.id} />
        <AdminFormSection title="Group details">
          <FieldInput
            label="Name"
            name="name"
            defaultValue={group.name}
            required
            maxLength={80}
            readOnly={isAdministrators || !canManage}
          />
          <FieldTextarea
            label="Description"
            name="description"
            defaultValue={group.description ?? ""}
            maxLength={280}
            rows={3}
            readOnly={!canManage}
          />
          {canManage ? (
            <FormActionBar className="border-0 pt-0">
              <PendingSubmitButton pendingLabel="Saving…" variant="primary">
                Save details
              </PendingSubmitButton>
            </FormActionBar>
          ) : null}
        </AdminFormSection>
      </SecurityActionForm>

      <div>
        <AdminSectionHeader
          title="Permissions"
          description="Exact permission keys are preserved. Locked Administrator permissions stay selected."
        />
        <SecurityActionForm
          action={setSecurityGroupPermissionsAction}
          className="mt-4"
          notice={{
            successTitle: "Permissions updated",
            successDescription: "This group's permissions were saved.",
            errorTitle: "Unable to save permissions",
          }}
        >
          <input type="hidden" name="securityGroupId" value={group.id} />
          <div
            className="max-h-[min(36rem,70vh)] space-y-5 overflow-y-auto overscroll-contain rounded-[var(--radius-card)] border border-border bg-surface p-3 sm:p-4"
            data-permission-matrix
            tabIndex={0}
            role="region"
            aria-label="Permission matrix"
          >
            {permissionModules.map((module) => (
              <div key={module.module}>
                <h3 className="sticky top-0 z-10 bg-surface/95 py-1 text-xs font-bold tracking-[0.08em] text-muted-foreground uppercase backdrop-blur-sm">
                  {moduleLabel(module.module)}
                </h3>
                <ul className="mt-2 space-y-2">
                  {module.entries.map((entry) => {
                    const locked = lockedPermissions.has(entry.key);
                    const selected = assignedKeys.has(entry.key) || locked;
                    return (
                      <li key={entry.key}>
                        <AdminChoiceRow selected={selected}>
                          <label className="flex min-h-11 items-start gap-3">
                            <input
                              type="checkbox"
                              name="permissionKeys"
                              value={entry.key}
                              defaultChecked={selected}
                              disabled={locked || !canManage}
                              className="mt-1 size-4 accent-primary"
                              aria-describedby={`perm-desc-${entry.key}`}
                            />
                            <span>
                              <span className="flex flex-wrap items-center gap-2">
                                <span className="font-medium text-foreground">{entry.name}</span>
                                {locked ? <Badge tone="warning">Required</Badge> : null}
                              </span>
                              <span
                                id={`perm-desc-${entry.key}`}
                                className="mt-0.5 block text-muted-foreground"
                              >
                                {entry.description}
                              </span>
                              <span className="mt-0.5 block font-mono text-[0.7rem] text-muted-foreground/80">
                                {entry.key}
                              </span>
                            </span>
                          </label>
                          {locked ? <input type="hidden" name="permissionKeys" value={entry.key} /> : null}
                        </AdminChoiceRow>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
          {canManage ? (
            <FormActionBar className="mt-4">
              <PendingSubmitButton pendingLabel="Saving…" variant="primary">
                Save permissions
              </PendingSubmitButton>
            </FormActionBar>
          ) : null}
        </SecurityActionForm>
      </div>

      <div>
        <AdminSectionHeader title="Members" description="Employees who receive this group's permissions." />
        <ul className="mt-4 space-y-2">
          {group.members.length === 0 ? (
            <li>
              <Card variant="flat" padding="sm">
                <p className="text-sm text-muted-foreground">No members yet.</p>
              </Card>
            </li>
          ) : (
            group.members.map((member) => {
              const profile = profiles.find((row) => row.id === member.userProfileId);
              const name = profile ? resolveUserDisplayName(profile) : null;
              const email = profile?.email?.trim() || null;
              return (
                <li key={member.id}>
                  <Card
                    variant="flat"
                    padding="sm"
                    className="flex flex-wrap items-center justify-between gap-3"
                  >
                    <span className="min-w-0">
                      <span className="block font-medium text-foreground">
                        {name ?? email ?? "Unknown employee"}
                      </span>
                      {name && email ? (
                        <span className="mt-0.5 block text-sm text-muted-foreground">{email}</span>
                      ) : null}
                    </span>
                    {canManage ? (
                      <SecurityActionForm
                        action={removeSecurityGroupMemberAction}
                        confirm={removeSecurityMemberConfirm({
                          isAdministrators,
                          memberLabel: name ?? email ?? "this employee",
                          groupName: group.name,
                        })}
                        notice={{
                          successTitle: "Member removed",
                          successDescription: `${name ?? email ?? "The employee"} was removed from ${group.name}.`,
                          errorTitle: "Unable to remove member",
                        }}
                      >
                        <input type="hidden" name="securityGroupId" value={group.id} />
                        <input type="hidden" name="userProfileId" value={member.userProfileId} />
                        <PendingSubmitButton pendingLabel="Removing…" variant="destructive" size="sm">
                          Remove
                        </PendingSubmitButton>
                      </SecurityActionForm>
                    ) : null}
                  </Card>
                </li>
              );
            })
          )}
        </ul>
        {canManage ? (
          <SecurityActionForm
            action={addSecurityGroupMemberAction}
            className="mt-4"
            notice={{
              successTitle: "Member added",
              successDescription: `{name} was added to ${group.name}.`,
              errorTitle: "Unable to add member",
            }}
          >
            <input type="hidden" name="securityGroupId" value={group.id} />
            <AdminFormSection title="Add member">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <EmployeeMemberPicker
                  key={profiles
                    .filter((profile) => !memberIds.has(profile.id))
                    .map((profile) => profile.id)
                    .join("-")}
                  name="userProfileId"
                  employees={profiles
                    .filter((profile) => !memberIds.has(profile.id))
                    .map((profile) => ({
                      id: profile.id,
                      label: formatUserDisplayLabel(profile),
                      searchText: userIdentitySearchText(profile),
                    }))}
                />
                <PendingSubmitButton pendingLabel="Adding…" variant="primary" className="shrink-0">
                  Add
                </PendingSubmitButton>
              </div>
            </AdminFormSection>
          </SecurityActionForm>
        ) : null}
      </div>

      {group.isSystem || !canManage ? null : (
        <AdminFormSection
          title="Danger zone"
          description="Employees are not deleted. Permissions from this group are removed."
        >
          <SecurityActionForm
            action={deleteSecurityGroupAction}
            confirm={deleteSecurityGroupConfirm(group.name)}
            notice={{
              successTitle: "Group deleted",
              successDescription: "Employees were not deleted. Permissions from this group are gone.",
              errorTitle: "Unable to delete group",
            }}
          >
            <input type="hidden" name="securityGroupId" value={group.id} />
            <PendingSubmitButton pendingLabel="Deleting…" variant="destructive">
              Delete group
            </PendingSubmitButton>
          </SecurityActionForm>
        </AdminFormSection>
      )}
    </section>
  );
}
