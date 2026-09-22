import Link from "next/link";

import { MasterScheduleGrid } from "@/components/layout/master-schedule-grid";
import { PendingBookingsPanel } from "@/components/layout/pending-bookings-panel";
import { ScheduleDayNav } from "@/components/layout/schedule-day-nav";
import { SecurityStatusPanel } from "@/components/layout/security-status-panel";
import { db } from "@/lib/db";
import { calendarDateInTimeZone } from "@/lib/inquiries/tenant-datetime";
import { isAuthorizationError, isResourceError, isTenantContextError } from "@/server/errors";
import { getRequestContext } from "@/server/get-request-context";
import { hasPermission } from "@/server/policies/require-permission";
import { getCurrentTenantTimezone } from "@/server/services/inquiry-service";
import {
  getMasterScheduleDay,
  listScheduleResourceTypes,
} from "@/server/services/resource-schedule-service";
import { listPendingBookingsForSchedule } from "@/server/services/booking-service";
import { PERMISSIONS } from "@/types/permissions";

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
      pendingBookings: Awaited<ReturnType<typeof listPendingBookingsForSchedule>>;
      canHold: boolean;
      canRelease: boolean;
      timeZone: string;
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
    const timeZone = await getCurrentTenantTimezone(ctx, db);
    const date = /^\d{4}-\d{2}-\d{2}$/.test(search.date ?? "") ? search.date! : calendarDateInTimeZone(new Date(), timeZone);
    const [types, canHold, canRelease, pendingBookings] = await Promise.all([
      listScheduleResourceTypes(ctx, db),
      hasPermission(ctx, PERMISSIONS.EVENTS_CREATE, db),
      hasPermission(ctx, PERMISSIONS.EVENTS_EDIT, db),
      listPendingBookingsForSchedule(ctx, db, date),
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
      pendingBookings,
      canHold,
      canRelease,
      timeZone,
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

  return (
    <section className="w-full max-w-none">
      <p className="text-sm font-semibold tracking-[0.18em] text-primary uppercase">Operations</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground">Master Schedule</h1>
      <p className="mt-4 max-w-2xl text-sm text-foreground/70">
        Live occupancy from confirmed reservations (and any leftover legacy holds). Pending unpaid bookings
        appear in the list below and do not occupy the grid. Available is the absence of an active
        reservation. This is not a payment tool.
      </p>
      <ScheduleDayNav
        date={view.date}
        prev={prev}
        next={next}
        today={calendarDateInTimeZone(new Date(), view.timeZone)}
        selectedTypeId={view.selectedTypeId}
        types={view.types}
      />
      <PendingBookingsPanel bookings={view.pendingBookings} />
      {view.types.length === 0 ? (
        <p className="mt-8 text-sm text-foreground/70">
          No resource types are configured. An administrator can add them under Resources.
        </p>
      ) : view.day && view.day.resources.length > 0 ? (
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
              timeZone={view.timeZone}
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
    </section>
  );
}
