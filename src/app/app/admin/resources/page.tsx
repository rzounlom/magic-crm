import Link from "next/link";

import { SecurityStatusPanel } from "@/components/layout/security-status-panel";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { db } from "@/lib/db";
import { isAuthorizationError, isResourceError, isTenantContextError } from "@/server/errors";
import { formatRequirementRule } from "@/server/resources/plan-availability-status";
import { getRequestContext } from "@/server/get-request-context";
import { listResourceTypesForAdmin } from "@/server/services/resource-admin-service";

type View =
  | { kind: "status"; title: string; body: string }
  | { kind: "ready"; types: Awaited<ReturnType<typeof listResourceTypesForAdmin>> };

async function loadView(): Promise<View> {
  try {
    const ctx = await getRequestContext();
    const types = await listResourceTypesForAdmin(ctx, db);
    return { kind: "ready", types };
  } catch (error) {
    if (isAuthorizationError(error) || isTenantContextError(error) || isResourceError(error)) {
      return { kind: "status", title: "Resources", body: error.userMessage };
    }
    throw error;
  }
}

export default async function AdminResourcesPage() {
  const view = await loadView();
  if (view.kind === "status") {
    return <SecurityStatusPanel title={view.title} body={view.body} />;
  }

  return (
    <section className="max-w-3xl">
      <PageHeader
        eyebrow="Admin"
        title="Resources"
        description="Configure tenant finite inventory. Lane and room counts are not hardcoded. Deactivate instead of deleting types that already have history."
        actions={
          <ButtonLink href="/app/admin/resources/new" variant="primary" size="md">
            Add resource type
          </ButtonLink>
        }
      />
      {view.types.length === 0 ? (
        <EmptyState title="No resource types yet." />
      ) : (
        <ul className="mt-8 space-y-3">
          {view.types.map((type) => {
            const usedBy = type.requirements
              .map((row) => row.salesKnowledgeItem.name)
              .filter(Boolean);
            const configured = type._count.resources > 0;
            return (
              <li key={type.id}>
                <Link href={`/app/admin/resources/${type.id}`} className="block focus-visible:outline-none">
                  <Card variant="default" padding="md" className="transition-colors hover:border-primary/40">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-foreground">{type.name}</p>
                      <p className="mt-1 text-sm text-foreground/70">
                        {type._count.resources} active resource{type._count.resources === 1 ? "" : "s"}
                        {usedBy.length > 0 ? ` · Used by: ${usedBy.join(", ")}` : " · No knowledge links"}
                      </p>
                      {type.requirements.some((row) => row.requiresStaffConfiguration) ? (
                        <p className="mt-1 text-sm text-warning">Resource configuration required</p>
                      ) : null}
                      {!configured && type.requirements.length > 0 ? (
                        <p className="mt-1 text-sm text-warning">
                          {usedBy[0] ?? "An offering"} is linked to {type.name}, but no {type.name} resources
                          have been configured. Personal Event Planner availability cannot be validated.
                        </p>
                      ) : null}
                    </div>
                    <span className="text-xs text-foreground/60">
                      {configured ? "Configured" : "Configuration required"}
                      {type.active ? "" : " · Inactive"}
                    </span>
                  </div>
                  {!configured && type.requirements.length > 0 ? (
                    <p className="mt-2 text-sm font-medium text-primary">Configure {type.name}s</p>
                  ) : null}
                  {type.defaultDurationMinutes ? (
                    <p className="mt-2 text-xs text-foreground/55">
                      Default duration {type.defaultDurationMinutes} minutes · {type.schedulingMode}
                    </p>
                  ) : (
                    <p className="mt-2 text-xs text-foreground/55">{type.schedulingMode}</p>
                  )}
                  {type.requirements[0] ? (
                    <p className="mt-1 text-xs text-foreground/55">
                      {formatRequirementRule(type.requirements[0])}
                    </p>
                  ) : null}
                  </Card>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
