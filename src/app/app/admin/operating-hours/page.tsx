import Link from "next/link";

import { SecurityStatusPanel } from "@/components/layout/security-status-panel";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { db } from "@/lib/db";
import { isAuthorizationError, isResourceError, isTenantContextError } from "@/server/errors";
import { getRequestContext } from "@/server/get-request-context";
import { listLocationsOperatingHoursForAdmin } from "@/server/services/operating-hours-admin-service";
import { OPERATING_HOURS_VERIFICATION_STATUSES } from "@/types/operating-hours";

type View =
  | { kind: "status"; title: string; body: string }
  | { kind: "ready"; locations: Awaited<ReturnType<typeof listLocationsOperatingHoursForAdmin>> };

async function loadView(): Promise<View> {
  try {
    const ctx = await getRequestContext();
    const locations = await listLocationsOperatingHoursForAdmin(ctx, db);
    return { kind: "ready", locations };
  } catch (error) {
    if (isAuthorizationError(error) || isTenantContextError(error) || isResourceError(error)) {
      return { kind: "status", title: "Operating hours", body: error.userMessage };
    }
    throw error;
  }
}

function statusLabel(status: string | undefined): string {
  if (!status) {
    return "Missing";
  }
  if (status === OPERATING_HOURS_VERIFICATION_STATUSES.VERIFIED) {
    return "Verified";
  }
  if (status === OPERATING_HOURS_VERIFICATION_STATUSES.DRAFT) {
    return "Draft";
  }
  return "Unconfigured";
}

export default async function AdminOperatingHoursPage() {
  const view = await loadView();
  if (view.kind === "status") {
    return (
      <SecurityStatusPanel
        title={view.title}
        body={view.body}
        guidance="Only administrators with locations.manage can configure weekly hours. Enter real venue hours; do not invent schedules."
      />
    );
  }

  return (
    <section className="max-w-3xl">
      <PageHeader
        eyebrow="Locations"
        title="Operating hours"
        description="Configure weekly open windows and holiday exceptions per location. Save as DRAFT, then verify before booking confirmation uses the schedule."
      />
      {view.locations.length === 0 ? (
        <EmptyState title="No locations yet." />
      ) : (
        <ul className="mt-8 space-y-3">
          {view.locations.map((location) => {
            const policy = location.operatingHoursPolicy;
            return (
              <li key={location.id}>
                <Link
                  href={`/app/admin/operating-hours/${location.id}`}
                  className="block focus-visible:outline-none"
                >
                  <Card variant="default" padding="md" className="transition-colors hover:border-primary/40">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-foreground">{location.name}</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {location.timezone}
                          {policy
                            ? ` · ${policy._count.weeklyWindows} weekly window${
                                policy._count.weeklyWindows === 1 ? "" : "s"
                              } · ${policy._count.exceptions} exception${
                                policy._count.exceptions === 1 ? "" : "s"
                              }`
                            : " · No policy yet"}
                        </p>
                      </div>
                      <Badge tone={policy?.verificationStatus === "VERIFIED" ? "success" : "neutral"}>
                        {statusLabel(policy?.verificationStatus)}
                      </Badge>
                    </div>
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
