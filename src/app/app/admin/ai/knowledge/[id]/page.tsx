import Link from "next/link";
import { notFound } from "next/navigation";

import { SalesKnowledgeForm } from "@/components/layout/sales-knowledge-form";
import { SecurityStatusPanel } from "@/components/layout/security-status-panel";
import { db } from "@/lib/db";
import { updateSalesKnowledgeAction } from "@/server/actions/sales-knowledge";
import { isAuthorizationError, isInquiryError, isTenantContextError } from "@/server/errors";
import { getRequestContext } from "@/server/get-request-context";
import { getSalesKnowledgeItem } from "@/server/services/sales-knowledge-service";

type KnowledgeItemView =
  | { kind: "status"; title: string; body: string }
  | { kind: "missing" }
  | { kind: "ready"; item: NonNullable<Awaited<ReturnType<typeof getSalesKnowledgeItem>>> };

async function loadSalesKnowledgeItemView(id: string): Promise<KnowledgeItemView> {
  try {
    const ctx = await getRequestContext();
    const item = await getSalesKnowledgeItem(ctx, db, id);
    if (!item) {
      return { kind: "missing" };
    }
    return { kind: "ready", item };
  } catch (error) {
    if (isAuthorizationError(error) || isTenantContextError(error) || isInquiryError(error)) {
      return { kind: "status", title: "AI sales knowledge", body: error.userMessage };
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
      <Link href="/app/admin/ai/knowledge" className="text-sm text-primary">
        Back to knowledge
      </Link>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground">Edit knowledge</h1>
      <SalesKnowledgeForm action={updateSalesKnowledgeAction} values={view.item} />
    </section>
  );
}
