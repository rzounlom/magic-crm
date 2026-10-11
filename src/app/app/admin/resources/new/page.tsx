import { AdminBackLink } from "@/components/layout/admin-form-chrome";
import { ResourceTypeForm } from "@/components/layout/resource-type-form";
import { PageHeader } from "@/components/ui/page-header";
import { createResourceTypeAction } from "@/server/actions/resources";

export default function NewResourceTypePage() {
  return (
    <section className="max-w-xl">
      <AdminBackLink href="/app/admin/resources">Back to resources</AdminBackLink>
      <div className="mt-3">
        <PageHeader
          eyebrow="Catalog"
          title="Add resource type"
          description="Create a category such as Bowling Lane or Party Room. Numbered inventory is added next."
        />
      </div>
      <ResourceTypeForm action={createResourceTypeAction} />
    </section>
  );
}
