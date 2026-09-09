import Link from "next/link";
import { notFound } from "next/navigation";

import { KnowledgeRequirementForm } from "@/components/layout/knowledge-requirement-form";
import { BulkCreateResourcesForm, CreateResourceForm, ResourceRowForm } from "@/components/layout/resource-inventory-forms";
import { ResourceTypeForm } from "@/components/layout/resource-type-form";
import { SecurityStatusPanel } from "@/components/layout/security-status-panel";
import {
  bulkCreateResourcesAction,
  createResourceAction,
  updateResourceAction,
  updateResourceTypeAction,
  upsertKnowledgeRequirementAction,
} from "@/server/actions/resources";
import { db } from "@/lib/db";
import { isAuthorizationError, isResourceError, isTenantContextError } from "@/server/errors";
import { getRequestContext } from "@/server/get-request-context";
import {
  getResourceTypeForAdmin,
  listKnowledgeItemsForResourceLink,
} from "@/server/services/resource-admin-service";

type View =
  | { kind: "status"; title: string; body: string }
  | { kind: "missing" }
  | {
      kind: "ready";
      type: NonNullable<Awaited<ReturnType<typeof getResourceTypeForAdmin>>>;
      knowledgeItems: Awaited<ReturnType<typeof listKnowledgeItemsForResourceLink>>;
    };

async function loadView(id: string): Promise<View> {
  try {
    const ctx = await getRequestContext();
    const [type, knowledgeItems] = await Promise.all([
      getResourceTypeForAdmin(ctx, db, id),
      listKnowledgeItemsForResourceLink(ctx, db),
    ]);
    if (!type) {
      return { kind: "missing" };
    }
    return { kind: "ready", type, knowledgeItems };
  } catch (error) {
    if (isAuthorizationError(error) || isTenantContextError(error) || isResourceError(error)) {
      return { kind: "status", title: "Resource type", body: error.userMessage };
    }
    throw error;
  }
}

export default async function ResourceTypeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const view = await loadView(id);
  if (view.kind === "status") {
    return <SecurityStatusPanel title={view.title} body={view.body} />;
  }
  if (view.kind === "missing") {
    notFound();
  }

  const { type, knowledgeItems } = view;
  const warningOfferings = type.requirements.filter(() => type.resources.filter((row) => row.active).length === 0);

  return (
    <section className="max-w-3xl">
      <Link href="/app/admin/resources" className="text-sm text-primary">
        Back to resources
      </Link>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground">{type.name}</h1>
      {warningOfferings.length > 0 ? (
        <div className="mt-4 rounded-md border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
          <p className="font-medium">Configuration required</p>
          <p className="mt-1 text-foreground/80">
            {warningOfferings.map((row) => row.salesKnowledgeItem.name).join(", ")}{" "}
            {warningOfferings.length === 1 ? "is" : "are"} linked to {type.name}, but no individual resources
            have been configured. Personal Event Planner availability cannot be validated.
          </p>
        </div>
      ) : null}

      <ResourceTypeForm
        action={updateResourceTypeAction}
        values={{
          id: type.id,
          name: type.name,
          slug: type.slug,
          schedulingMode: type.schedulingMode,
          slotMinutes: type.slotMinutes,
          defaultDurationMinutes: type.defaultDurationMinutes,
          active: type.active,
        }}
      />

      <h2 className="mt-10 text-lg font-semibold">Finite resources</h2>
      <p className="mt-2 text-sm text-foreground/70">
        {type.resources.filter((row) => row.active).length} active. Counts are tenant-configured.
      </p>
      <CreateResourceForm action={createResourceAction} resourceTypeId={type.id} />
      <BulkCreateResourcesForm
        action={bulkCreateResourcesAction}
        resourceTypeId={type.id}
        typeName={type.name}
      />
      <div className="mt-6 space-y-3">
        {type.resources.map((resource) => (
          <ResourceRowForm key={resource.id} action={updateResourceAction} resource={resource} />
        ))}
      </div>

      <KnowledgeRequirementForm
        action={upsertKnowledgeRequirementAction}
        resourceTypeId={type.id}
        knowledgeItems={knowledgeItems}
        existing={type.requirements}
      />
    </section>
  );
}
