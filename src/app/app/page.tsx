import Link from "next/link";

import { AttentionTile } from "@/components/ui/attention-tile";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { readTrustedClerkAuth } from "@/lib/auth/trusted-clerk-auth";
import { markAuthTiming } from "@/lib/auth/auth-timing";
import { db } from "@/lib/db";
import { isTenantContextError } from "@/server/errors";
import { getRequestContext } from "@/server/get-request-context";
import {
  loadEmployeeDashboard,
  type EmployeeDashboardReady,
} from "@/server/services/employee-dashboard-service";

export default async function EmployeeHomePage() {
  const view = await loadEmployeeHomeView();

  if (view.kind === "status") {
    return (
      <section className="max-w-xl">
        <PageHeader eyebrow="MagicCRM" title={view.title} description={view.body} />
      </section>
    );
  }

  return <EmployeeDashboard dashboard={view} />;
}

function EmployeeDashboard({ dashboard }: { dashboard: EmployeeDashboardReady }) {
  const attention = dashboard.attention;
  const attentionTotal = attention
    ? attention.awaitingStaffReview + attention.pendingConfirmation + attention.unreadCount
    : 0;
  const showAttention = dashboard.canViewInquiries && attention != null;
  const todayBookings = dashboard.todayBookings;
  const showToday = dashboard.canViewBookings && todayBookings != null;

  return (
    <section className="mx-auto w-full max-w-5xl" data-employee-dashboard>
      <header className="max-w-2xl">
        <h1 className="text-[length:var(--text-display)] font-semibold tracking-[-0.02em] text-foreground">
          {dashboard.greetingHeadline}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {dashboard.dateLabel}
          <span className="mx-1.5 text-border" aria-hidden>
            ·
          </span>
          {dashboard.organizationName}
          <span className="mx-1.5 text-border" aria-hidden>
            ·
          </span>
          {dashboard.locationName}
        </p>
      </header>

      <div className="mt-8 grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        {showAttention ? (
          <section className="employee-dashboard-panel rounded-[var(--radius-card)] border border-border-subtle bg-surface p-5">
            <h2 className="text-[length:var(--text-title-sm)] font-semibold text-foreground">
              Needs attention
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Actionable work from inquiries you can access.
            </p>
            {attentionTotal === 0 ? (
              <div className="mt-4">
                <EmptyState
                  title="You’re caught up"
                  detail="New inquiries will appear here when they need follow-up."
                />
              </div>
            ) : (
              <div className="mt-2">
                {attention.awaitingStaffReview > 0 ? (
                  <AttentionTile
                    count={attention.awaitingStaffReview}
                    title="Awaiting staff review"
                    detail="Ready for human follow-up"
                    href="/app/inquiries"
                  />
                ) : null}
                {attention.pendingConfirmation > 0 ? (
                  <AttentionTile
                    count={attention.pendingConfirmation}
                    title="Pending confirmation"
                    detail="Book Now — awaiting staff confirmation"
                    href="/app/inquiries"
                  />
                ) : null}
                {attention.unreadCount > 0 ? (
                  <AttentionTile
                    count={attention.unreadCount}
                    title="Unread"
                    detail="New since you last checked"
                    href="/app/inquiries"
                  />
                ) : null}
              </div>
            )}
            {dashboard.canViewInquiries ? (
              <div className="mt-5">
                <ButtonLink href="/app/inquiries" size="sm">
                  Review inquiries
                </ButtonLink>
              </div>
            ) : null}
          </section>
        ) : (
          <section className="employee-dashboard-panel rounded-[var(--radius-card)] border border-border-subtle bg-surface p-5">
            <h2 className="text-[length:var(--text-title-sm)] font-semibold text-foreground">Home</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Use the sidebar to open the tools available for your role.
            </p>
          </section>
        )}

        {showToday && todayBookings ? (
          <section className="employee-dashboard-panel rounded-[var(--radius-card)] border border-border-subtle bg-surface p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-[length:var(--text-title-sm)] font-semibold text-foreground">Today</h2>
                <p className="mt-1 text-sm text-muted-foreground">Confirmed bookings for today.</p>
              </div>
              <Link
                href={dashboard.todayBookingsHref}
                className="shrink-0 text-sm font-semibold text-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
              >
                View all
              </Link>
            </div>
            {todayBookings.length === 0 ? (
              <p className="mt-4 text-sm text-muted-foreground">Nothing on the schedule for today.</p>
            ) : (
              <ul className="mt-3 divide-y divide-border-subtle">
                {todayBookings.map((booking) => (
                  <li key={booking.id}>
                    <Link
                      href={booking.href}
                      className="block py-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
                    >
                      <p className="text-[length:var(--text-caption)] text-muted-foreground">
                        {booking.startTimeLabel}
                      </p>
                      <p className="mt-0.5 truncate text-sm font-semibold text-foreground">
                        {booking.title}
                      </p>
                      <p className="mt-0.5 truncate text-[length:var(--text-caption)] text-muted-foreground">
                        {booking.bookingNumber} · {booking.statusLabel}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : null}
      </div>

      {dashboard.nextActions.length > 0 ? (
        <section className="mt-6">
          <h2 className="text-[length:var(--text-title-sm)] font-semibold text-foreground">Next</h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {dashboard.nextActions.map((action) => (
              <li key={action.id}>
                <ButtonLink
                  href={action.href}
                  variant="secondary"
                  size="sm"
                  {...(action.external
                    ? { target: "_blank", rel: "noopener noreferrer" }
                    : {})}
                >
                  {action.label}
                </ButtonLink>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </section>
  );
}

async function loadEmployeeHomeView(): Promise<
  | { kind: "status"; title: string; body: string }
  | EmployeeDashboardReady
> {
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
    const ctx = await getRequestContext({ auth: clerkAuth });
    const dashboard = await loadEmployeeDashboard(ctx, db);
    markAuthTiming("app_ready", { route: "/app" });
    return dashboard;
  } catch (error) {
    if (isTenantContextError(error)) {
      return { kind: "status", title: "Organization not ready", body: error.userMessage };
    }
    throw error;
  }
}
