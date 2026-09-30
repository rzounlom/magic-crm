import Link from "next/link";

import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";

import { SecurityStatusPanel } from "@/components/layout/security-status-panel";
import { db } from "@/lib/db";
import { isAuthorizationError, isInquiryError, isTenantContextError } from "@/server/errors";
import { getRequestContext } from "@/server/get-request-context";
import { hasPermission } from "@/server/policies/require-permission";
import { listSalesKnowledge } from "@/server/services/sales-knowledge-service";
import { PERMISSIONS } from "@/types/permissions";

type KnowledgeView =
  | { kind: "status"; title: string; body: string }
  | {
      kind: "ready";
      items: Awaited<ReturnType<typeof listSalesKnowledge>>;
      canManage: boolean;
    };

async function loadSalesKnowledgeView(): Promise<KnowledgeView> {
  try {
    const ctx = await getRequestContext();
    const items = await listSalesKnowledge(ctx, db);
    const canManage = await hasPermission(ctx, PERMISSIONS.AI_MANAGE, db);
    return { kind: "ready", items, canManage };
  } catch (error) {
    if (isAuthorizationError(error) || isTenantContextError(error) || isInquiryError(error)) {
      return { kind: "status", title: "AI sales knowledge", body: error.userMessage };
    }
    throw error;
  }
}

export default async function SalesKnowledgePage() {
  const view = await loadSalesKnowledgeView();
  if (view.kind === "status") {
    return <SecurityStatusPanel title={view.title} body={view.body} />;
  }

  return (
    <section className="max-w-3xl">
      <PageHeader
        eyebrow="Admin"
        title="AI sales knowledge"
        description="Temporary tenant knowledge for the Event Assistant. Catalog will replace or back this later. Do not invent offerings in prompts."
      />
      {view.canManage ? (
        <Link
          href="/app/admin/ai/knowledge/new"
          className="mt-6 inline-flex rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Add knowledge
        </Link>
      ) : null}
      {view.items.length === 0 ? (
        <EmptyState title="No knowledge items yet." />
      ) : (
        <ul className="mt-8 space-y-3">
          {view.items.map((item) => (
            <li key={item.id}>
              <Link
                href={`/app/admin/ai/knowledge/${item.id}`}
                className="record-row block"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-foreground">{item.name}</p>
                    <p className="mt-1 text-sm text-foreground/70">{item.shortDescription}</p>
                  </div>
                  <span className="text-xs text-foreground/60">
                    {item.type}
                    {item.active ? "" : " · Inactive"}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
