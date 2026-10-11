import { AdminBackLink } from "@/components/layout/admin-form-chrome";
import { SalesKnowledgeForm } from "@/components/layout/sales-knowledge-form";
import { PageHeader } from "@/components/ui/page-header";
import { createSalesKnowledgeAction } from "@/server/actions/sales-knowledge";

export default function NewSalesKnowledgePage() {
  return (
    <section className="max-w-xl">
      <AdminBackLink href="/app/admin/ai/knowledge">Back to sales knowledge</AdminBackLink>
      <div className="mt-3">
        <PageHeader
          eyebrow="Catalog"
          title="Add knowledge"
          description="Only add facts the Event Assistant may use. Do not invent availability or unpublished prices."
        />
      </div>
      <SalesKnowledgeForm action={createSalesKnowledgeAction} />
    </section>
  );
}
