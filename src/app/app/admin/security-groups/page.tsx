import Link from "next/link";

import { SecurityActionForm } from "@/components/layout/security-action-form";
import { SecurityAuthorizationNote } from "@/components/layout/security-authorization-note";
import { SecurityStatusPanel } from "@/components/layout/security-status-panel";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import { createClerkUserIdentityDirectory } from "@/lib/auth/clerk-user-identity";
import { db } from "@/lib/db";
import { refreshEmployeeIdentitiesAction } from "@/server/actions/security-groups";
import { SYSTEM_GROUP_KEYS } from "@/server/authorization/default-security-groups";
import { isAuthorizationError, isTenantContextError } from "@/server/errors";
import { getRequestContext } from "@/server/get-request-context";
import { hasPermission } from "@/server/policies/require-permission";
import { tryRefreshTenantEmployeeIdentities } from "@/server/services/refresh-tenant-employee-identities";
import { listSecurityGroups, type SecurityGroupListItem } from "@/server/services/security-group-service";
import { PERMISSIONS } from "@/types/permissions";

type ListView =
  | { kind: "status"; title: string; body: string }
  | { kind: "ready"; groups: SecurityGroupListItem[]; canManage: boolean };

async function loadSecurityGroupsView(): Promise<ListView> {
  try {
    const ctx = await getRequestContext();
    await tryRefreshTenantEmployeeIdentities(ctx, db, createClerkUserIdentityDirectory());
    const groups = await listSecurityGroups(ctx, db);
    const canManage = await hasPermission(ctx, PERMISSIONS.SECURITY_GROUPS_MANAGE, db);
    return { kind: "ready", groups, canManage };
  } catch (error) {
    if (isAuthorizationError(error) || isTenantContextError(error)) {
      return { kind: "status", title: "Security groups", body: error.userMessage };
    }
    throw error;
  }
}

export default async function SecurityGroupsPage() {
  const view = await loadSecurityGroupsView();

  if (view.kind === "status") {
    return <SecurityStatusPanel title={view.title} body={view.body} />;
  }

  return (
    <section className="max-w-3xl">
      <p className="text-sm font-semibold tracking-[0.18em] text-primary uppercase">Admin</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground">Security groups</h1>
      <p className="mt-4 max-w-xl text-sm text-foreground/70">
        Security groups control what employees can access in this organization. Membership is
        separate from signing in.
      </p>
      <SecurityAuthorizationNote />
      {view.canManage ? (
        <div className="mt-6 flex flex-wrap items-center gap-4">
          <Link
            href="/app/admin/security-groups/new"
            className="inline-flex rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Create group
          </Link>
          <SecurityActionForm
            action={refreshEmployeeIdentitiesAction}
            notice={{
              successTitle: "Employee details refreshed",
              errorTitle: "Unable to refresh employee details",
            }}
          >
            <PendingSubmitButton pendingLabel="Refreshing…" className="text-sm text-primary">
              Refresh employee details
            </PendingSubmitButton>
          </SecurityActionForm>
        </div>
      ) : null}
      <ul className="mt-8 space-y-3">
        {view.groups.map((group) => (
          <li key={group.id}>
            <Link
              href={`/app/admin/security-groups/${group.id}`}
              className="block rounded-md border border-border bg-background px-4 py-4 hover:bg-muted/60"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-medium text-foreground">{group.name}</p>
                  <p className="mt-1 text-sm text-foreground/70">
                    {group.description ?? "No description"}
                  </p>
                </div>
                {group.systemKey === SYSTEM_GROUP_KEYS.ADMINISTRATORS ? (
                  <span className="rounded-full bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
                    Administrators
                  </span>
                ) : group.isSystem ? (
                  <span className="rounded-full bg-muted px-2 py-1 text-xs font-medium text-foreground/70">
                    Default
                  </span>
                ) : (
                  <span className="rounded-full bg-muted px-2 py-1 text-xs font-medium text-foreground/70">
                    Custom
                  </span>
                )}
              </div>
              <p className="mt-3 text-xs text-foreground/60">
                {group.memberCount} {group.memberCount === 1 ? "member" : "members"} ·{" "}
                {group.permissionCount} {group.permissionCount === 1 ? "permission" : "permissions"}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
