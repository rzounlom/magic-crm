import Link from "next/link";

import { EmployeeMemberPicker } from "@/components/layout/employee-member-picker";
import { SecurityActionForm } from "@/components/layout/security-action-form";
import { SecurityAuthorizationNote } from "@/components/layout/security-authorization-note";
import { SecurityStatusPanel } from "@/components/layout/security-status-panel";
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
import { PERMISSION_CATALOG, PERMISSIONS, REQUIRED_ADMIN_PERMISSIONS } from "@/types/permissions";

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

  return (
    <section className="max-w-3xl space-y-10">
      <div>
        <Link href="/app/admin/security-groups" className="text-sm text-primary">
          All security groups
        </Link>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground">{group.name}</h1>
        <p className="mt-2 text-sm text-foreground/70">
          {isAdministrators
            ? "This protected group must keep at least one member and core admin permissions."
            : "Assign permissions and employees for this group."}
        </p>
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
            <PendingSubmitButton pendingLabel="Refreshing…" className="text-sm text-primary">
              Refresh employee details
            </PendingSubmitButton>
          </SecurityActionForm>
        ) : null}
      </div>

      <SecurityActionForm
        action={updateSecurityGroupAction}
        className="space-y-4"
        notice={{
          successTitle: "Group updated",
          successDescription: "Group details were saved.",
          errorTitle: "Unable to save group details",
        }}
      >
        <input type="hidden" name="securityGroupId" value={group.id} />
        <label className="block text-sm">
          <span className="text-foreground/70">Name</span>
          <input
            name="name"
            defaultValue={group.name}
            required
            maxLength={80}
            readOnly={isAdministrators || !canManage}
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          <span className="text-foreground/70">Description</span>
          <textarea
            name="description"
            defaultValue={group.description ?? ""}
            maxLength={280}
            rows={3}
            readOnly={!canManage}
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"
          />
        </label>
        {canManage ? (
          <PendingSubmitButton
            pendingLabel="Saving…"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Save details
          </PendingSubmitButton>
        ) : null}
      </SecurityActionForm>

      <div>
        <h2 className="text-lg font-semibold text-foreground">Permissions</h2>
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
          <ul className="space-y-2">
            {PERMISSION_CATALOG.map((entry) => {
              const locked = lockedPermissions.has(entry.key);
              return (
                <li key={entry.key} className="rounded-md border border-border px-3 py-2 text-sm">
                  <label className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      name="permissionKeys"
                      value={entry.key}
                      defaultChecked={assignedKeys.has(entry.key) || locked}
                      disabled={locked || !canManage}
                    />
                    <span>
                      <span className="font-medium text-foreground">{entry.name}</span>
                      <span className="mt-0.5 block text-foreground/60">{entry.description}</span>
                    </span>
                  </label>
                  {locked ? <input type="hidden" name="permissionKeys" value={entry.key} /> : null}
                </li>
              );
            })}
          </ul>
          {canManage ? (
            <PendingSubmitButton
              pendingLabel="Saving…"
              className="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            >
              Save permissions
            </PendingSubmitButton>
          ) : null}
        </SecurityActionForm>
      </div>

      <div>
        <h2 className="text-lg font-semibold text-foreground">Members</h2>
        <ul className="mt-4 space-y-2">
          {group.members.length === 0 ? (
            <li className="text-sm text-foreground/70">No members yet.</li>
          ) : (
            group.members.map((member) => {
              const profile = profiles.find((row) => row.id === member.userProfileId);
              const name = profile ? resolveUserDisplayName(profile) : null;
              const email = profile?.email?.trim() || null;
              return (
                <li
                  key={member.id}
                  className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm"
                >
                  <span>
                    <span className="block font-medium text-foreground">
                      {name ?? email ?? "Unknown employee"}
                    </span>
                    {name && email ? (
                      <span className="mt-0.5 block text-foreground/60">{email}</span>
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
                      <PendingSubmitButton pendingLabel="Removing…" className="text-destructive">
                        Remove
                      </PendingSubmitButton>
                    </SecurityActionForm>
                  ) : null}
                </li>
              );
            })
          )}
        </ul>
        {canManage ? (
          <SecurityActionForm
            action={addSecurityGroupMemberAction}
            className="mt-4 flex items-end gap-3"
            notice={{
              successTitle: "Member added",
              successDescription: `{name} was added to ${group.name}.`,
              errorTitle: "Unable to add member",
            }}
          >
            <input type="hidden" name="securityGroupId" value={group.id} />
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
            <PendingSubmitButton
              pendingLabel="Adding…"
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            >
              Add
            </PendingSubmitButton>
          </SecurityActionForm>
        ) : null}
      </div>

      {group.isSystem || !canManage ? null : (
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
          <PendingSubmitButton pendingLabel="Deleting…" className="text-sm text-destructive">
            Delete group
          </PendingSubmitButton>
        </SecurityActionForm>
      )}
    </section>
  );
}
