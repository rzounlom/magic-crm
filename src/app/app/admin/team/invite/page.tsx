import { AdminBackLink, AdminChoiceRow, FormActionBar } from "@/components/layout/admin-form-chrome";
import { SecurityActionForm } from "@/components/layout/security-action-form";
import { SecurityStatusPanel } from "@/components/layout/security-status-panel";
import { FieldInput } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
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
      <AdminBackLink href="/app/admin/team">Back to team</AdminBackLink>
      <div className="mt-3">
        <PageHeader
          eyebrow="Settings"
          title="Invite employee"
          description="They will receive an email to join this organization. MagicCRM security groups control access after they sign in. Clerk organization admin is not granted from this screen."
        />
      </div>
      <SecurityActionForm
        action={inviteEmployeeAction}
        className="mt-8 space-y-6"
        notice={{
          successTitle: "Invitation sent",
          errorTitle: "Unable to send invitation",
        }}
      >
        <FieldInput
          label="Email"
          type="email"
          name="email"
          required
          autoComplete="off"
        />
        <fieldset>
          <legend className="text-[length:var(--text-label)] font-semibold text-foreground">
            Initial security groups
          </legend>
          <p className="mt-1 text-sm text-muted-foreground">
            Optional. Applied automatically after they sign in. Nothing is selected by default.
          </p>
          <ul className="mt-3 space-y-2">
            {view.groups.map((group) => (
              <li key={group.id}>
                <AdminChoiceRow>
                  <label className="flex min-h-11 items-start gap-3">
                    <input
                      type="checkbox"
                      name="securityGroupIds"
                      value={group.id}
                      className="mt-1 size-4 accent-primary"
                    />
                    <span>
                      <span className="font-medium text-foreground">{group.name}</span>
                      {group.description ? (
                        <span className="mt-0.5 block text-muted-foreground">{group.description}</span>
                      ) : null}
                      {group.systemKey === SYSTEM_GROUP_KEYS.ADMINISTRATORS ? (
                        <span className="mt-0.5 block text-warning">
                          Grants full MagicCRM administration.
                        </span>
                      ) : null}
                    </span>
                  </label>
                </AdminChoiceRow>
              </li>
            ))}
          </ul>
        </fieldset>
        <FormActionBar>
          <PendingSubmitButton pendingLabel="Sending…" variant="primary">
            Send invitation
          </PendingSubmitButton>
        </FormActionBar>
      </SecurityActionForm>
    </section>
  );
}
