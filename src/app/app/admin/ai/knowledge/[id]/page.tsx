import { notFound } from "next/navigation";

import { AdminBackLink } from "@/components/layout/admin-form-chrome";
import { SalesKnowledgeForm } from "@/components/layout/sales-knowledge-form";
import { SecurityStatusPanel } from "@/components/layout/security-status-panel";
import { PageHeader } from "@/components/ui/page-header";
import { db } from "@/lib/db";
import { updateSalesKnowledgeAction } from "@/server/actions/sales-knowledge";
import { isAuthorizationError, isInquiryError, isTenantContextError } from "@/server/errors";
import { getRequestContext } from "@/server/get-request-context";
import { hasPermission } from "@/server/policies/require-permission";
import { getSalesKnowledgeItem } from "@/server/services/sales-knowledge-service";
import { PERMISSIONS } from "@/types/permissions";

type KnowledgeItemView =
  | { kind: "status"; title: string; body: string }
  | { kind: "missing" }
  | {
      kind: "ready";
      item: NonNullable<Awaited<ReturnType<typeof getSalesKnowledgeItem>>>;
      canManage: boolean;
    };

async function loadSalesKnowledgeItemView(id: string): Promise<KnowledgeItemView> {
  try {
    const ctx = await getRequestContext();
    const [item, canManage] = await Promise.all([
      getSalesKnowledgeItem(ctx, db, id),
      hasPermission(ctx, PERMISSIONS.AI_MANAGE, db),
    ]);
    if (!item) {
      return { kind: "missing" };
    }
    return { kind: "ready", item, canManage };
  } catch (error) {
    if (isAuthorizationError(error) || isTenantContextError(error) || isInquiryError(error)) {
      return { kind: "status", title: "Sales knowledge", body: error.userMessage };
    }
    throw error;
  }
}

export default async function EditSalesKnowledgePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const view = await loadSalesKnowledgeItemView(id);
  if (view.kind === "status") {
    return <SecurityStatusPanel title={view.title} body={view.body} />;
  }
  if (view.kind === "missing") {
    notFound();
  }

  return (
    <section className="max-w-xl">
      <AdminBackLink href="/app/admin/ai/knowledge">Back to sales knowledge</AdminBackLink>
      <div className="mt-3">
        <PageHeader
          eyebrow="Catalog"
          title="Edit knowledge"
          description={
            view.canManage
              ? "Update offering facts used by the Event Assistant."
              : "View-only. Saving requires manage permission."
          }
        />
      </div>
      <SalesKnowledgeForm
        action={updateSalesKnowledgeAction}
        values={view.item}
        readOnly={!view.canManage}
      />
    </section>
  );
}
