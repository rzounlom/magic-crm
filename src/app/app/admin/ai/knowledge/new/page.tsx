import Link from "next/link";

import { SalesKnowledgeForm } from "@/components/layout/sales-knowledge-form";
import { createSalesKnowledgeAction } from "@/server/actions/sales-knowledge";

export default function NewSalesKnowledgePage() {
  return (
    <section className="max-w-xl">
      <Link href="/app/admin/ai/knowledge" className="text-sm text-primary">
        Back to knowledge
      </Link>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground">Add knowledge</h1>
      <p className="mt-4 text-sm text-foreground/70">
        Only add facts the Event Assistant may use. Do not invent availability or unpublished prices.
      </p>
      <SalesKnowledgeForm action={createSalesKnowledgeAction} />
    </section>
  );
}
