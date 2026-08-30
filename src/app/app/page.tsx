import { currentUser } from "@clerk/nextjs/server";

import { readTrustedClerkAuth } from "@/lib/auth/trusted-clerk-auth";
import { db } from "@/lib/db";
import { isTenantContextError } from "@/server/errors";
import { getRequestContext } from "@/server/get-request-context";
import { createLocationRepository } from "@/server/repositories/location-repository";
import { createOrganizationRepository } from "@/server/repositories/organization-repository";
import { ensureProvisionedTenant } from "@/server/services/provision-organization";

type EmployeeHomeView =
  | { kind: "status"; title: string; body: string }
  | {
      kind: "ready";
      organizationName: string;
      locationName: string;
      userLabel: string;
    };

export default async function EmployeeHomePage() {
  const view = await loadEmployeeHomeView();

  if (view.kind === "status") {
    return <StatusPanel title={view.title} body={view.body} />;
  }

  return (
    <section className="max-w-xl">
      <p className="text-sm font-semibold tracking-[0.18em] text-primary uppercase">MagicCRM</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground">
        Employee application
      </h1>
      <dl className="mt-8 space-y-4 border-t border-border pt-6 text-sm">
        <div>
          <dt className="text-foreground/60">Organization</dt>
          <dd className="mt-1 font-medium text-foreground">{view.organizationName}</dd>
        </div>
        <div>
          <dt className="text-foreground/60">Location</dt>
          <dd className="mt-1 font-medium text-foreground">{view.locationName}</dd>
        </div>
        <div>
          <dt className="text-foreground/60">User</dt>
          <dd className="mt-1 font-medium text-foreground">{view.userLabel}</dd>
        </div>
      </dl>
    </section>
  );
}

async function loadEmployeeHomeView(): Promise<EmployeeHomeView> {
  const clerkAuth = await readTrustedClerkAuth();

  if (!clerkAuth.clerkUserId) {
    return { kind: "status", title: "Sign in required", body: "Sign in to continue." };
  }

  if (!clerkAuth.clerkOrganizationId) {
    return {
      kind: "status",
      title: "Choose an organization",
      body: "Choose or create an organization to continue.",
    };
  }

  try {
    await ensureProvisionedTenant(clerkAuth, db);
    const ctx = await getRequestContext({ auth: clerkAuth });
    const organization = await createOrganizationRepository(db).findById(ctx);
    const location = ctx.locationId
      ? await createLocationRepository(db).findById(ctx, ctx.locationId)
      : null;
    const user = await currentUser();
    const userLabel = user?.fullName ?? user?.primaryEmailAddress?.emailAddress ?? "Signed in";

    return {
      kind: "ready",
      organizationName: organization?.name ?? "Unavailable",
      locationName: location?.name ?? "No default location",
      userLabel,
    };
  } catch (error) {
    if (isTenantContextError(error)) {
      return { kind: "status", title: "Organization not ready", body: error.userMessage };
    }

    throw error;
  }
}

function StatusPanel({ title, body }: { title: string; body: string }) {
  return (
    <section className="max-w-xl">
      <p className="text-sm font-semibold tracking-[0.18em] text-primary uppercase">MagicCRM</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground">{title}</h1>
      <p className="mt-6 text-sm text-foreground/70">{body}</p>
    </section>
  );
}
