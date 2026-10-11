import Link from "next/link";

import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

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
      return { kind: "status", title: "Sales knowledge", body: error.userMessage };
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
        eyebrow="Catalog"
        title="Sales knowledge"
        description="Tenant offerings and package facts the Event Assistant may use. Do not invent availability or unpublished prices."
        actions={
          view.canManage ? (
            <ButtonLink href="/app/admin/ai/knowledge/new" variant="primary" size="md">
              Add knowledge
            </ButtonLink>
          ) : undefined
        }
      />
      {view.items.length === 0 ? (
        <EmptyState title="No knowledge items yet." />
      ) : (
        <ul className="mt-8 space-y-3">
          {view.items.map((item) => (
            <li key={item.id}>
              <Link href={`/app/admin/ai/knowledge/${item.id}`} className="block focus-visible:outline-none">
                <Card variant="default" padding="md" className="transition-colors hover:border-primary/40">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-foreground">{item.name}</p>
                      <p className="mt-1 text-sm text-muted-foreground">{item.shortDescription}</p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      <Badge tone="info">{item.type.replaceAll("_", " ")}</Badge>
                      {!item.active ? <Badge tone="neutral">Inactive</Badge> : null}
                    </div>
                  </div>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
