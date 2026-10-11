import { AdminBackLink, FormActionBar } from "@/components/layout/admin-form-chrome";
import { SecurityActionForm } from "@/components/layout/security-action-form";
import { SecurityStatusPanel } from "@/components/layout/security-status-panel";
import { ButtonLink } from "@/components/ui/button";
import { FieldInput, FieldTextarea } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import { createSecurityGroupAction } from "@/server/actions/security-groups";
import { db } from "@/lib/db";
import { isAuthorizationError, isTenantContextError } from "@/server/errors";
import { getRequestContext } from "@/server/get-request-context";
import { requirePermission } from "@/server/policies/require-permission";
import { PERMISSIONS } from "@/types/permissions";

async function loadNewGroupAccess(): Promise<{ kind: "ready" } | { kind: "status"; body: string }> {
  try {
    const ctx = await getRequestContext();
    await requirePermission(ctx, PERMISSIONS.SECURITY_GROUPS_MANAGE, db);
    return { kind: "ready" };
  } catch (error) {
    if (isAuthorizationError(error) || isTenantContextError(error)) {
      return { kind: "status", body: error.userMessage };
    }
    throw error;
  }
}

export default async function NewSecurityGroupPage() {
  const view = await loadNewGroupAccess();

  if (view.kind === "status") {
    return <SecurityStatusPanel title="Create group" body={view.body} />;
  }

  return (
    <section className="max-w-xl">
      <AdminBackLink href="/app/admin/security-groups">Back to security groups</AdminBackLink>
      <div className="mt-3">
        <PageHeader
          eyebrow="Settings"
          title="Create group"
          description="Custom groups let you combine permissions for how this venue actually staffs."
        />
      </div>
      <SecurityActionForm
        action={createSecurityGroupAction}
        className="mt-8 space-y-4"
        notice={{
          successTitle: "Group created",
          errorTitle: "Unable to create group",
        }}
      >
        <FieldInput label="Name" name="name" required maxLength={80} />
        <FieldTextarea label="Description" name="description" maxLength={280} rows={3} />
        <FormActionBar>
          <PendingSubmitButton pendingLabel="Creating…" variant="primary">
            Create group
          </PendingSubmitButton>
          <ButtonLink href="/app/admin/security-groups" variant="ghost" size="md">
            Cancel
          </ButtonLink>
        </FormActionBar>
      </SecurityActionForm>
    </section>
  );
}
