import { notFound } from "next/navigation";

import { AdminBackLink, AdminSectionHeader } from "@/components/layout/admin-form-chrome";
import { OperatingHoursExceptionForms } from "@/components/layout/operating-hours-exception-forms";
import { OperatingHoursVerifyForms } from "@/components/layout/operating-hours-verify-forms";
import { OperatingHoursWeeklyForm } from "@/components/layout/operating-hours-weekly-form";
import { SecurityStatusPanel } from "@/components/layout/security-status-panel";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { db } from "@/lib/db";
import {
  deleteOperatingHoursDateExceptionAction,
  revertOperatingHoursPolicyToDraftAction,
  saveWeeklyOperatingHoursDraftAction,
  upsertOperatingHoursDateExceptionAction,
  verifyOperatingHoursPolicyAction,
} from "@/server/actions/operating-hours";
import { isAuthorizationError, isResourceError, isTenantContextError } from "@/server/errors";
import { getRequestContext } from "@/server/get-request-context";
import { getLocationOperatingHoursForAdmin } from "@/server/services/operating-hours-admin-service";

type View =
  | { kind: "status"; title: string; body: string }
  | { kind: "missing" }
  | { kind: "ready"; data: NonNullable<Awaited<ReturnType<typeof getLocationOperatingHoursForAdmin>>> };

async function loadView(locationId: string): Promise<View> {
  try {
    const ctx = await getRequestContext();
    const data = await getLocationOperatingHoursForAdmin(ctx, db, locationId);
    return { kind: "ready", data };
  } catch (error) {
    if (isAuthorizationError(error) || isTenantContextError(error) || isResourceError(error)) {
      if (isResourceError(error) && error.code === "RESOURCE_NOT_FOUND") {
        return { kind: "missing" };
      }
      return { kind: "status", title: "Operating hours", body: error.userMessage };
    }
    throw error;
  }
}

export default async function AdminLocationOperatingHoursPage({
  params,
}: {
  params: Promise<{ locationId: string }>;
}) {
  const { locationId } = await params;
  const view = await loadView(locationId);
  if (view.kind === "status") {
    return <SecurityStatusPanel title={view.title} body={view.body} />;
  }
  if (view.kind === "missing") {
    notFound();
  }

  const { location, policy, lastAudit } = view.data;
  const status = policy?.verificationStatus ?? "UNCONFIGURED";
  const exceptions =
    policy?.exceptions.map((row) => ({
      id: row.id,
      localDate: row.localDate.toISOString().slice(0, 10),
      kind: row.kind,
      startMinute: row.startMinute,
      endMinute: row.endMinute,
      note: row.note,
    })) ?? [];

  return (
    <section className="max-w-3xl space-y-10">
      <AdminBackLink href="/app/admin/operating-hours">Back to operating hours</AdminBackLink>
      <div className="mt-3">
        <PageHeader
          eyebrow="Locations"
          title={location.name}
          description={`Configure weekly hours and exceptions in ${location.timezone}. Do not invent venue hours.`}
          actions={
            <Badge tone={status === "VERIFIED" ? "success" : "neutral"}>{status}</Badge>
          }
        />
      </div>

      <div className="rounded-[var(--radius-control)] border border-border/70 bg-muted/30 px-4 py-3 text-sm">
        <p className="font-medium text-foreground">Audit</p>
        <p className="mt-1 text-muted-foreground">
          Updated {policy?.updatedAt?.toISOString() ?? "—"}
          {policy?.approvedAt
            ? ` · Verified ${policy.approvedAt.toISOString()}${
                policy.approvedByNote ? ` — ${policy.approvedByNote}` : ""
              }`
            : " · Not verified"}
        </p>
        {lastAudit ? (
          <p className="mt-1 text-muted-foreground">
            Last change: {lastAudit.action} at {lastAudit.createdAt.toISOString()}
            {lastAudit.actor?.email ? ` by ${lastAudit.actor.email}` : ""}
          </p>
        ) : (
          <p className="mt-1 text-muted-foreground">No hours-policy audit events yet.</p>
        )}
      </div>

      <div>
        <AdminSectionHeader
          title="Weekly schedule"
          description="Multiple windows per day are allowed. Saving keeps the policy in DRAFT."
        />
        <div className="mt-4">
          <OperatingHoursWeeklyForm
            locationId={location.id}
            timezone={location.timezone}
            initialWindows={
              policy?.weeklyWindows.map((row) => ({
                dayOfWeek: row.dayOfWeek,
                startMinute: row.startMinute,
                endMinute: row.endMinute,
              })) ?? []
            }
            action={saveWeeklyOperatingHoursDraftAction}
          />
        </div>
      </div>

      <div>
        <AdminSectionHeader
          title="Holiday and special-date exceptions"
          description="CLOSED closes the day. CUSTOM replaces weekly windows for that date."
        />
        <div className="mt-4">
          <OperatingHoursExceptionForms
            locationId={location.id}
            exceptions={exceptions}
            upsertAction={upsertOperatingHoursDateExceptionAction}
            deleteAction={deleteOperatingHoursDateExceptionAction}
          />
        </div>
      </div>

      <div>
        <AdminSectionHeader
          title="Verification"
          description="Only mark VERIFIED after an authorized administrator confirms the real venue schedule."
        />
        <div className="mt-4">
          <OperatingHoursVerifyForms
            locationId={location.id}
            verificationStatus={status}
            verifyAction={verifyOperatingHoursPolicyAction}
            revertAction={revertOperatingHoursPolicyToDraftAction}
          />
        </div>
      </div>
    </section>
  );
}
