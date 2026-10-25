import { CatalogSyncForm } from "@/components/layout/catalog-sync-form";
import { SecurityStatusPanel } from "@/components/layout/security-status-panel";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { db } from "@/lib/db";
import { applyCatalogSyncAction } from "@/server/actions/catalog-sync";
import { isAuthorizationError, isCatalogSyncError, isTenantContextError } from "@/server/errors";
import { getRequestContext } from "@/server/get-request-context";
import { previewCatalogSync } from "@/server/services/catalog-sync-admin-service";

export const dynamic = "force-dynamic";

async function loadPreview() {
  try {
    const ctx = await getRequestContext();
    return { kind: "ready" as const, preview: await previewCatalogSync(ctx, db) };
  } catch (error) {
    if (isAuthorizationError(error) || isTenantContextError(error) || isCatalogSyncError(error)) {
      return { kind: "status" as const, title: "Catalog sync", body: error.userMessage };
    }
    throw error;
  }
}

export default async function AdminCatalogSyncPage() {
  const view = await loadPreview();
  if (view.kind === "status") {
    return (
      <SecurityStatusPanel
        title={view.title}
        body={view.body}
        guidance="Catalog sync is available only to authorized catalog administrators for the signed-in organization."
      />
    );
  }

  const { preview } = view;
  const organization = preview.organization;

  return (
    <section className="max-w-3xl">
      <PageHeader
        eyebrow="Catalog"
        title="Catalog sync"
        description="Preview and apply the bundled booking catalog to the signed-in organization. Other tenants are never modified."
      />

      <Card variant="default" padding="md" className="mt-6">
        <h2 className="text-base font-semibold text-foreground">Signed-in organization</h2>
        <dl className="mt-3 grid gap-2 text-sm">
          <div>
            <dt className="text-muted-foreground">Name</dt>
            <dd className="font-medium text-foreground">{organization.name}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Slug</dt>
            <dd className="font-medium text-foreground">{organization.slug}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Organization ID</dt>
            <dd className="font-medium text-foreground">{organization.id}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Products</dt>
            <dd className="font-medium text-foreground">{organization.productCount}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Recommendation profiles</dt>
            <dd className="font-medium text-foreground">{organization.profileCount}</dd>
          </div>
        </dl>
      </Card>

      {!preview.eligible ? (
        <p className="mt-6 text-sm text-warning" role="status">
          Sync refused. Sign in to the Generations customer organization before applying this catalog file.
        </p>
      ) : null}

      {preview.unexpectedOperations.length > 0 ? (
        <div className="mt-6 text-sm text-warning" role="status">
          <p>Unexpected destructive operations were found. Apply is blocked.</p>
          <ul className="mt-2 list-disc pl-5">
            {preview.unexpectedOperations.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <Card variant="default" padding="md" className="mt-6 overflow-x-auto">
        <h2 className="text-base font-semibold text-foreground">Dry-run</h2>
        <pre className="mt-3 whitespace-pre-wrap text-xs text-foreground">{preview.report}</pre>
      </Card>

      {preview.eligible && preview.unexpectedOperations.length === 0 ? (
        <CatalogSyncForm
          action={applyCatalogSyncAction}
          confirmationPhrase={preview.confirmationPhrase}
          organizationName={organization.name}
        />
      ) : null}
    </section>
  );
}
