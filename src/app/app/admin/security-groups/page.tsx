import Link from "next/link";

import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

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

function groupBadge(group: SecurityGroupListItem) {
  if (group.systemKey === SYSTEM_GROUP_KEYS.ADMINISTRATORS) {
    return <Badge tone="info">Administrators</Badge>;
  }
  if (group.isSystem) {
    return <Badge tone="neutral">Default</Badge>;
  }
  return <Badge tone="neutral">Custom</Badge>;
}

export default async function SecurityGroupsPage() {
  const view = await loadSecurityGroupsView();

  if (view.kind === "status") {
    return (
      <SecurityStatusPanel
        title={view.title}
        body={view.body}
        guidance="Security groups and elevated permissions are managed by an authorized administrator. Navigation stays aligned with server authorization — this screen does not unlock admin controls."
      />
    );
  }

  return (
    <section className="max-w-3xl">
      <PageHeader
        eyebrow="Settings"
        title="Security groups"
        description="Security groups control what employees can access in this organization. Membership is separate from signing in."
        actions={
          view.canManage ? (
            <ButtonLink href="/app/admin/security-groups/new" variant="primary" size="md">
              Create group
            </ButtonLink>
          ) : undefined
        }
      />
      <SecurityAuthorizationNote />
      {view.canManage ? (
        <div className="mt-4">
          <SecurityActionForm
            action={refreshEmployeeIdentitiesAction}
            notice={{
              successTitle: "Employee details refreshed",
              errorTitle: "Unable to refresh employee details",
            }}
          >
            <PendingSubmitButton pendingLabel="Refreshing…" variant="ghost" size="sm">
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
              className="block focus-visible:outline-none"
            >
              <Card variant="default" padding="md" className="transition-colors hover:border-primary/40">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">{group.name}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {group.description ?? "No description"}
                    </p>
                  </div>
                  {groupBadge(group)}
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  {group.memberCount} {group.memberCount === 1 ? "member" : "members"} ·{" "}
                  {group.permissionCount} {group.permissionCount === 1 ? "permission" : "permissions"}
                </p>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
