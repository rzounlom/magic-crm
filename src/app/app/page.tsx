import { ButtonLink } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { loadEmployeeShellChrome } from "@/components/layout/employee-shell-chrome";
import { readTrustedClerkAuth } from "@/lib/auth/trusted-clerk-auth";
import { db } from "@/lib/db";
import { formatUserDisplayLabel } from "@/lib/identity/user-display";
import {
  EMPLOYEE_NAV_GROUP_LABELS,
  filterEmployeeNavItems,
  type EmployeeNavItemId,
} from "@/lib/ui/employee-navigation";
import { isTenantContextError } from "@/server/errors";
import { getRequestContext } from "@/server/get-request-context";
import { ensureProvisionedTenant } from "@/server/services/provision-organization";

type EmployeeHomeView =
  | { kind: "status"; title: string; body: string }
  | {
      kind: "ready";
      organizationName: string;
      locationName: string;
      userLabel: string;
      visibleNavIds: EmployeeNavItemId[];
      publicInquiryHref: string | null;
    };

export default async function EmployeeHomePage() {
  const view = await loadEmployeeHomeView();

  if (view.kind === "status") {
    return <StatusPanel title={view.title} body={view.body} />;
  }

  const visible = new Set(view.visibleNavIds);
  const quickLinks = filterEmployeeNavItems(visible).filter((item) => item.id !== "overview");
  const ops = quickLinks.filter((item) => item.group === "bookingsEvents");
  const catalog = quickLinks.filter((item) => item.group === "catalog");
  const settings = quickLinks.filter((item) => item.group === "settings");

  return (
    <section className="max-w-3xl">
      <PageHeader
        eyebrow="Overview"
        title={`Welcome, ${view.userLabel}`}
        description="Organization and location context for this session. Use quick links for permitted front-desk and admin tools."
      />

      <Card className="mt-8" variant="default" padding="md">
        <CardTitle>Session context</CardTitle>
        <CardDescription>Resolved from trusted Clerk organization and your default location.</CardDescription>
        <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Organization</dt>
            <dd className="mt-1 font-medium text-foreground">{view.organizationName}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Location</dt>
            <dd className="mt-1 font-medium text-foreground">{view.locationName}</dd>
          </div>
        </dl>
      </Card>

      {ops.length > 0 || catalog.length > 0 || settings.length > 0 || view.publicInquiryHref ? (
        <div className="mt-8 space-y-6">
          {ops.length > 0 ? (
            <QuickLinkGroup title={EMPLOYEE_NAV_GROUP_LABELS.bookingsEvents} items={ops} />
          ) : null}
          {catalog.length > 0 ? (
            <QuickLinkGroup title={EMPLOYEE_NAV_GROUP_LABELS.catalog} items={catalog} />
          ) : null}
          {settings.length > 0 ? (
            <QuickLinkGroup title={EMPLOYEE_NAV_GROUP_LABELS.settings} items={settings} />
          ) : null}
          {view.publicInquiryHref ? (
            <div>
              <h2 className="text-[length:var(--text-title-sm)] font-semibold text-foreground">
                Public intake
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Open this organization&apos;s customer inquiry form in a new tab.
              </p>
              <div className="mt-3">
                <ButtonLink
                  href={view.publicInquiryHref}
                  variant="secondary"
                  size="sm"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Public inquiry
                </ButtonLink>
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <p className="mt-8 max-w-md text-sm text-muted-foreground">
          No operational modules are available for your permissions yet. Ask an administrator to
          assign a security group.
        </p>
      )}

      {settings.some((item) => item.id === "team" || item.id === "security") ? (
        <p className="mt-8 max-w-md text-sm text-muted-foreground">
          Administrators can open Team to invite employees, then Security to manage groups.
        </p>
      ) : null}
    </section>
  );
}

function QuickLinkGroup({
  title,
  items,
}: {
  title: string;
  items: Array<{ id: string; href: string; label: string }>;
}) {
  return (
    <div>
      <h2 className="text-[length:var(--text-title-sm)] font-semibold text-foreground">{title}</h2>
      <ul className="mt-3 flex flex-wrap gap-2">
        {items.map((item) => (
          <li key={item.id}>
            <ButtonLink href={item.href} variant="secondary" size="sm">
              {item.label}
            </ButtonLink>
          </li>
        ))}
      </ul>
    </div>
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
      body: "Choose an organization to continue.",
    };
  }

  try {
    await ensureProvisionedTenant(clerkAuth, db);
    const ctx = await getRequestContext({ auth: clerkAuth });
    const chrome = await loadEmployeeShellChrome();
    const profile = await db.userProfile.findFirst({
      where: { id: ctx.userId, organizationId: ctx.organizationId },
      select: {
        clerkUserId: true,
        firstName: true,
        lastName: true,
        displayName: true,
        email: true,
      },
    });
    const userLabel = profile ? formatUserDisplayLabel(profile) : "Signed in";

    return {
      kind: "ready",
      organizationName: chrome.organizationName ?? "Unavailable",
      locationName: chrome.locationName ?? "No default location",
      userLabel,
      visibleNavIds: chrome.visibleNavIds,
      publicInquiryHref: chrome.publicInquiryHref,
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
      <PageHeader eyebrow="MagicCRM" title={title} description={body} />
    </section>
  );
}
