import Link from "next/link";

import { MasterScheduleGrid } from "@/components/layout/master-schedule-grid";
import { SecurityStatusPanel } from "@/components/layout/security-status-panel";
import { db } from "@/lib/db";
import { isAuthorizationError, isResourceError, isTenantContextError } from "@/server/errors";
import { getRequestContext } from "@/server/get-request-context";
import { hasPermission } from "@/server/policies/require-permission";
import {
  getMasterScheduleDay,
  listScheduleResourceTypes,
} from "@/server/services/resource-schedule-service";
import { PERMISSIONS } from "@/types/permissions";

function todayStamp() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function shiftDate(value: string, days: number) {
  const [year, month, day] = value.split("-").map(Number);
  const next = new Date(Date.UTC(year ?? 2026, (month ?? 1) - 1, (day ?? 1) + days));
  return next.toISOString().slice(0, 10);
}

type View =
  | { kind: "status"; title: string; body: string }
  | {
      kind: "ready";
      date: string;
      types: Awaited<ReturnType<typeof listScheduleResourceTypes>>;
      selectedTypeId: string | null;
      day: Awaited<ReturnType<typeof getMasterScheduleDay>>;
      canHold: boolean;
      canRelease: boolean;
      prefillResourceId?: string;
      prefillStart?: string;
    };

async function loadView(search: {
  date?: string;
  type?: string;
  resource?: string;
  start?: string;
}): Promise<View> {
  try {
    const ctx = await getRequestContext();
    const date = /^\d{4}-\d{2}-\d{2}$/.test(search.date ?? "") ? search.date! : todayStamp();
    const [types, canHold, canRelease] = await Promise.all([
      listScheduleResourceTypes(ctx, db),
      hasPermission(ctx, PERMISSIONS.EVENTS_CREATE, db),
      hasPermission(ctx, PERMISSIONS.EVENTS_EDIT, db),
    ]);
    const selectedTypeId = search.type && types.some((row) => row.id === search.type)
      ? search.type
      : (types[0]?.id ?? null);
    const day = selectedTypeId ? await getMasterScheduleDay(ctx, db, { date, resourceTypeId: selectedTypeId }) : null;
    return {
      kind: "ready",
      date,
      types,
      selectedTypeId,
      day,
      canHold,
      canRelease,
      prefillResourceId: search.resource,
      prefillStart: search.start,
    };
  } catch (error) {
    if (isAuthorizationError(error) || isTenantContextError(error) || isResourceError(error)) {
      return { kind: "status", title: "Master Schedule", body: error.userMessage };
    }
    throw error;
  }
}

export default async function MasterSchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; type?: string; resource?: string; start?: string }>;
}) {
  const search = await searchParams;
  const view = await loadView(search);
  if (view.kind === "status") {
    return <SecurityStatusPanel title={view.title} body={view.body} />;
  }

  const prev = shiftDate(view.date, -1);
  const next = shiftDate(view.date, 1);
  const typeQuery = view.selectedTypeId ? `&type=${view.selectedTypeId}` : "";

  return (
    <section className="w-full max-w-none">
      <p className="text-sm font-semibold tracking-[0.18em] text-primary uppercase">Operations</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground">Master Schedule</h1>
      <p className="mt-4 max-w-2xl text-sm text-foreground/70">
        Live occupancy from HOLD and BOOKED reservations. BOOKED cells open the Booking record. Available is
        the absence of an active reservation. This is not a payment tool.
      </p>
      <div className="mt-6 flex flex-wrap items-end gap-3">
        <Link href={`/app/schedule?date=${prev}${typeQuery}`} className="rounded-md border border-border px-3 py-2 text-sm">
          Previous day
        </Link>
        <Link href={`/app/schedule?date=${todayStamp()}${typeQuery}`} className="rounded-md border border-border px-3 py-2 text-sm">
          Today
        </Link>
        <Link href={`/app/schedule?date=${next}${typeQuery}`} className="rounded-md border border-border px-3 py-2 text-sm">
          Next day
        </Link>
        <form className="flex items-end gap-2" action="/app/schedule">
          {view.selectedTypeId ? <input type="hidden" name="type" value={view.selectedTypeId} /> : null}
          <label className="text-sm">
            <span className="sr-only">Date</span>
            <input
              type="date"
              name="date"
              defaultValue={view.date}
              className="rounded-md border border-border bg-background px-3 py-2"
            />
          </label>
          <button type="submit" className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground">
            Go
          </button>
        </form>
      </div>
      {view.types.length === 0 ? (
        <p className="mt-8 text-sm text-foreground/70">
          No resource types are configured. An administrator can add them under Resources.
        </p>
      ) : (
        <>
          <nav className="mt-6 flex flex-wrap gap-2" aria-label="Resource types">
            {view.types.map((type) => (
              <Link
                key={type.id}
                href={`/app/schedule?date=${view.date}&type=${type.id}`}
                className={`rounded-md px-3 py-1.5 text-sm ${
                  type.id === view.selectedTypeId
                    ? "bg-primary text-primary-foreground"
                    : "border border-border"
                }`}
              >
                {type.name}
              </Link>
            ))}
          </nav>
          {view.day && view.day.resources.length > 0 ? (
            <MasterScheduleGrid
              date={view.date}
              resourceTypeId={view.day.resourceType.id}
              resources={view.day.resources}
              reservations={view.day.reservations}
              slotMinutes={view.day.slotMinutes}
              startMinute={view.day.startMinute}
              endMinute={view.day.endMinute}
              canHold={view.canHold}
              canRelease={view.canRelease}
              prefillResourceId={view.prefillResourceId}
              prefillStart={view.prefillStart}
            />
          ) : (
            <p className="mt-8 text-sm text-foreground/70">
              No numbered resources for this type.{" "}
              {view.selectedTypeId ? (
                <Link href={`/app/admin/resources/${view.selectedTypeId}`} className="text-primary">
                  Configure resources
                </Link>
              ) : null}
            </p>
          )}
        </>
      )}
    </section>
  );
}
