import Link from "next/link";

import { PageHeader } from "@/components/ui/page-header";

import { SecurityActionForm } from "@/components/layout/security-action-form";
import { SecurityStatusPanel } from "@/components/layout/security-status-panel";
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
      <PageHeader
        eyebrow="Admin"
        title="Create group"
        description="Custom groups let you combine permissions for how this fun center actually staffs."
      />
      <SecurityActionForm
        action={createSecurityGroupAction}
        className="mt-8 space-y-4"
        notice={{
          successTitle: "Group created",
          errorTitle: "Unable to create group",
        }}
      >
        <label className="block text-sm">
          <span className="text-foreground/70">Name</span>
          <input
            name="name"
            required
            maxLength={80}
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          <span className="text-foreground/70">Description</span>
          <textarea
            name="description"
            maxLength={280}
            rows={3}
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"
          />
        </label>
        <div className="flex items-center gap-4">
          <PendingSubmitButton
            pendingLabel="Creating…"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Create group
          </PendingSubmitButton>
          <Link href="/app/admin/security-groups" className="text-sm text-foreground/70">
            Cancel
          </Link>
        </div>
      </SecurityActionForm>
    </section>
  );
}
