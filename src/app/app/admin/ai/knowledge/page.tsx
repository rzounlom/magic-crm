import Link from "next/link";

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
      <p className="text-sm font-semibold tracking-[0.18em] text-primary uppercase">Admin</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground">
        AI sales knowledge
      </h1>
      <p className="mt-4 max-w-xl text-sm text-foreground/70">
        Temporary tenant knowledge for the Event Assistant. Catalog will replace or back this later.
        Do not invent offerings in prompts.
      </p>
      {view.canManage ? (
        <Link
          href="/app/admin/ai/knowledge/new"
          className="mt-6 inline-flex rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Add knowledge
        </Link>
      ) : null}
      {view.items.length === 0 ? (
        <p className="mt-8 text-sm text-foreground/70">No knowledge items yet.</p>
      ) : (
        <ul className="mt-8 space-y-3">
          {view.items.map((item) => (
            <li key={item.id}>
              <Link
                href={`/app/admin/ai/knowledge/${item.id}`}
                className="block rounded-md border border-border px-4 py-4 hover:bg-muted/60"
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
