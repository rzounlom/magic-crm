import Link from "next/link";

import { SecurityActionForm } from "@/components/layout/security-action-form";
import { SecurityStatusPanel } from "@/components/layout/security-status-panel";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import { db } from "@/lib/db";
import { inviteEmployeeAction } from "@/server/actions/team";
import { SYSTEM_GROUP_KEYS } from "@/server/authorization/default-security-groups";
import { isAuthorizationError, isTeamManagementError, isTenantContextError } from "@/server/errors";
import { getRequestContext } from "@/server/get-request-context";
import { listAssignableInviteGroups } from "@/server/services/team-invitation-service";

async function loadInviteView() {
  try {
    const ctx = await getRequestContext();
    const groups = await listAssignableInviteGroups(ctx, db);
    return { kind: "ready" as const, groups };
  } catch (error) {
    if (isAuthorizationError(error) || isTenantContextError(error) || isTeamManagementError(error)) {
      return { kind: "status" as const, title: "Invite employee", body: error.userMessage };
    }
    throw error;
  }
}

export default async function InviteEmployeePage() {
  const view = await loadInviteView();

  if (view.kind === "status") {
    return <SecurityStatusPanel title={view.title} body={view.body} />;
  }

  return (
    <section className="max-w-xl">
      <Link href="/app/admin/team" className="text-sm text-primary">
        Back to team
      </Link>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground">Invite employee</h1>
      <p className="mt-4 text-sm text-foreground/70">
        They will receive an email to join this organization. MagicCRM security groups control access
        after they sign in. Clerk organization admin is not granted from this screen.
      </p>
      <SecurityActionForm
        action={inviteEmployeeAction}
        className="mt-8 space-y-6"
        notice={{
          successTitle: "Invitation sent",
          errorTitle: "Unable to send invitation",
        }}
      >
        <label className="block text-sm">
          <span className="text-foreground/70">Email</span>
          <input
            type="email"
            name="email"
            required
            autoComplete="off"
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"
          />
        </label>
        <fieldset>
          <legend className="text-sm text-foreground/70">Initial security groups</legend>
          <p className="mt-1 text-sm text-foreground/60">Optional. Applied automatically after they sign in.</p>
          <ul className="mt-3 space-y-2">
            {view.groups.map((group) => (
              <li key={group.id} className="rounded-md border border-border px-3 py-2 text-sm">
                <label className="flex items-start gap-3">
                  <input type="checkbox" name="securityGroupIds" value={group.id} />
                  <span>
                    <span className="font-medium text-foreground">{group.name}</span>
                    {group.description ? (
                      <span className="mt-0.5 block text-foreground/60">{group.description}</span>
                    ) : null}
                    {group.systemKey === SYSTEM_GROUP_KEYS.ADMINISTRATORS ? (
                      <span className="mt-0.5 block text-warning">Grants full MagicCRM administration.</span>
                    ) : null}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
        <PendingSubmitButton
          pendingLabel="Sending…"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Send invitation
        </PendingSubmitButton>
      </SecurityActionForm>
    </section>
  );
}
