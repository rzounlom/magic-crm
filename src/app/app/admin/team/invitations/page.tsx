import Link from "next/link";

import { SecurityActionForm } from "@/components/layout/security-action-form";
import { SecurityStatusPanel } from "@/components/layout/security-status-panel";
import { TeamSectionTabs } from "@/components/layout/team-section-tabs";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import { createClerkOrganizationDirectory } from "@/lib/auth/clerk-organization-directory";
import { db } from "@/lib/db";
import { revokeInvitationConfirm, sendNewInvitationConfirm } from "@/lib/ui/destructive-confirm";
import { revokeTeamInvitationAction, sendNewTeamInvitationAction } from "@/server/actions/team";
import { isAuthorizationError, isTeamManagementError, isTenantContextError } from "@/server/errors";
import { getRequestContext } from "@/server/get-request-context";
import { hasPermission } from "@/server/policies/require-permission";
import { listTeamInvitations } from "@/server/services/team-invitation-service";
import { PERMISSIONS } from "@/types/permissions";
import { TEAM_INVITATION_STATUSES } from "@/types/team";

function formatDate(value: Date): string {
  return value.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function statusLabel(status: string): string {
  switch (status) {
    case TEAM_INVITATION_STATUSES.PENDING:
      return "Pending";
    case TEAM_INVITATION_STATUSES.ACCEPTED:
      return "Accepted";
    case TEAM_INVITATION_STATUSES.REVOKED:
      return "Revoked";
    case TEAM_INVITATION_STATUSES.EXPIRED:
      return "Expired";
    default:
      return status;
  }
}

async function loadInvitationsView() {
  try {
    const ctx = await getRequestContext();
    const directory = await createClerkOrganizationDirectory();
    const [invitations, canManage] = await Promise.all([
      listTeamInvitations(ctx, db, directory),
      hasPermission(ctx, PERMISSIONS.USERS_MANAGE, db),
    ]);
    return {
      kind: "ready" as const,
      invitations,
      canManage,
    };
  } catch (error) {
    if (isAuthorizationError(error) || isTenantContextError(error) || isTeamManagementError(error)) {
      return { kind: "status" as const, title: "Team", body: error.userMessage };
    }
    throw error;
  }
}

export default async function TeamInvitationsPage() {
  const view = await loadInvitationsView();

  if (view.kind === "status") {
    return <SecurityStatusPanel title={view.title} body={view.body} />;
  }

  return (
    <section className="max-w-3xl">
      <p className="text-sm font-semibold tracking-[0.18em] text-primary uppercase">Admin</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground">Team</h1>
      <p className="mt-4 max-w-xl text-sm text-foreground/70">
        Pending invitations stay here until the person accepts and signs in.
      </p>
      <TeamSectionTabs active="invitations" canManage={view.canManage} />
      {view.invitations.length === 0 ? (
        <p className="mt-8 text-sm text-foreground/70">No pending invitations.</p>
      ) : (
        <ul className="mt-8 space-y-3">
          {view.invitations.map((invitation) => (
            <li key={invitation.id} className="rounded-md border border-border px-4 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-foreground">{invitation.email}</p>
                  <p className="mt-1 text-sm text-foreground/70">
                    {statusLabel(invitation.status)}
                    {" · "}
                    Invited {formatDate(invitation.createdAt)}
                    {invitation.invitedByDisplayName || invitation.invitedByEmail
                      ? ` · by ${invitation.invitedByDisplayName ?? invitation.invitedByEmail}`
                      : ""}
                  </p>
                  {invitation.expiresAt && invitation.status === TEAM_INVITATION_STATUSES.PENDING ? (
                    <p className="mt-1 text-sm text-foreground/60">
                      Expires {formatDate(invitation.expiresAt)}
                    </p>
                  ) : null}
                  <p className="mt-2 text-sm text-foreground/70">
                    {invitation.groups.length > 0
                      ? `Intended groups: ${invitation.groups.map((group) => group.name).join(", ")}`
                      : "No security groups queued"}
                  </p>
                </div>
                {view.canManage ? (
                  <div className="flex flex-wrap gap-3">
                    {invitation.status === TEAM_INVITATION_STATUSES.PENDING ? (
                      <SecurityActionForm
                        action={revokeTeamInvitationAction}
                        confirm={revokeInvitationConfirm(invitation.email)}
                        notice={{
                          successTitle: "Invitation revoked",
                          errorTitle: "Unable to revoke invitation",
                        }}
                      >
                        <input type="hidden" name="invitationId" value={invitation.id} />
                        <PendingSubmitButton pendingLabel="Revoking…" className="text-sm text-destructive">
                          Revoke
                        </PendingSubmitButton>
                      </SecurityActionForm>
                    ) : null}
                    <SecurityActionForm
                      action={sendNewTeamInvitationAction}
                      confirm={sendNewInvitationConfirm(invitation.email)}
                      notice={{
                        successTitle: "New invitation sent",
                        errorTitle: "Unable to send invitation",
                      }}
                    >
                      <input type="hidden" name="invitationId" value={invitation.id} />
                      <PendingSubmitButton pendingLabel="Sending…" className="text-sm text-primary">
                        Send new invitation
                      </PendingSubmitButton>
                    </SecurityActionForm>
                  </div>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-8 text-sm text-foreground/60">
        <Link href="/app/admin/team" className="text-primary">
          Back to employees
        </Link>
      </p>
    </section>
  );
}
