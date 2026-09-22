import Link from "next/link";

import { EmployeeManualBookingForm } from "@/components/layout/employee-manual-booking-form";
import { SecurityStatusPanel } from "@/components/layout/security-status-panel";
import { db } from "@/lib/db";
import { isAuthorizationError, isInquiryError, isTenantContextError } from "@/server/errors";
import { getRequestContext } from "@/server/get-request-context";
import { hasPermission } from "@/server/policies/require-permission";
import { listWorkspaceKnowledge } from "@/server/services/live-agent-service";
import { PERMISSIONS } from "@/types/permissions";
import { SALES_KNOWLEDGE_TYPES } from "@/types/inquiry";

type View =
  | { kind: "status"; title: string; body: string }
  | {
      kind: "ready";
      locations: Array<{ id: string; name: string }>;
      attractions: Array<{ id: string; name: string }>;
      defaultLocationId: string | null;
    };

async function loadView(): Promise<View> {
  try {
    const ctx = await getRequestContext();
    const canCreate = await hasPermission(ctx, PERMISSIONS.EVENTS_CREATE, db);
    const canManage = await hasPermission(ctx, PERMISSIONS.CRM_INQUIRIES_MANAGE, db);
    if (!canCreate || !canManage) {
      return {
        kind: "status",
        title: "New Booking",
        body: "You need permission to create bookings and manage inquiries.",
      };
    }
    const [locations, knowledge] = await Promise.all([
      db.location.findMany({
        where: { organizationId: ctx.organizationId, active: true },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
      listWorkspaceKnowledge(ctx, db),
    ]);
    return {
      kind: "ready",
      locations,
      attractions: knowledge
        .filter((row) => row.type === SALES_KNOWLEDGE_TYPES.ATTRACTION)
        .map((row) => ({ id: row.id, name: row.name })),
      defaultLocationId: ctx.locationId ?? locations[0]?.id ?? null,
    };
  } catch (error) {
    if (isAuthorizationError(error) || isTenantContextError(error) || isInquiryError(error)) {
      return { kind: "status", title: "New Booking", body: error.userMessage };
    }
    throw error;
  }
}

export default async function NewBookingPage() {
  const view = await loadView();
  if (view.kind === "status") {
    return <SecurityStatusPanel title={view.title} body={view.body} />;
  }

  return (
    <section className="max-w-4xl">
      <Link href="/app/bookings" className="text-sm text-primary">
        Back to bookings
      </Link>
      <p className="mt-4 text-sm font-semibold tracking-[0.18em] text-primary uppercase">Operations</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground">New Booking</h1>
      <p className="mt-4 max-w-xl text-sm text-foreground/70">
        Create a customer event without a public inquiry. Catalog pricing, itinerary generation, availability,
        and confirmation use the same engine as Book Now.
      </p>
      <EmployeeManualBookingForm
        locations={view.locations}
        attractions={view.attractions}
        defaultLocationId={view.defaultLocationId}
      />
    </section>
  );
}
