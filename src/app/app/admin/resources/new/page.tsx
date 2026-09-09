import Link from "next/link";

import { ResourceTypeForm } from "@/components/layout/resource-type-form";
import { createResourceTypeAction } from "@/server/actions/resources";

export default function NewResourceTypePage() {
  return (
    <section className="max-w-xl">
      <Link href="/app/admin/resources" className="text-sm text-primary">
        Back to resources
      </Link>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground">Add resource type</h1>
      <p className="mt-4 text-sm text-foreground/70">
        Create a category such as Bowling Lane or Party Room. Numbered inventory is added next.
      </p>
      <ResourceTypeForm action={createResourceTypeAction} />
    </section>
  );
}
