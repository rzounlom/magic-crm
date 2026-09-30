import Link from "next/link";

import { EmployeeInquiryBookingReview } from "@/components/layout/employee-inquiry-booking-review";
import { MasterScheduleBoard } from "@/components/layout/master-schedule-board";
import { PendingBookingsPanel } from "@/components/layout/pending-bookings-panel";
import { ScheduleDayNav } from "@/components/layout/schedule-day-nav";
import { SecurityStatusPanel } from "@/components/layout/security-status-panel";
import { db } from "@/lib/db";
import { calendarDateInTimeZone } from "@/lib/inquiries/tenant-datetime";
import { SCHEDULE_FOCUS_ALL } from "@/lib/resources/schedule-board";
import { isAuthorizationError, isResourceError, isTenantContextError } from "@/server/errors";
import { getRequestContext } from "@/server/get-request-context";
import { hasPermission } from "@/server/policies/require-permission";
import { listWorkspaceKnowledge } from "@/server/services/live-agent-service";
import { listPendingBookingsForSchedule } from "@/server/services/booking-service";
import { getCurrentTenantTimezone } from "@/server/services/inquiry-service";
import { getMasterScheduleBoard } from "@/server/services/resource-schedule-service";
import { PERMISSIONS } from "@/types/permissions";
import { SALES_KNOWLEDGE_TYPES } from "@/types/inquiry";

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
      focus: string;
      locationId: string | null;
      board: Awaited<ReturnType<typeof getMasterScheduleBoard>>;
      pendingBookings: Awaited<ReturnType<typeof listPendingBookingsForSchedule>>;
      canCreate: boolean;
      canRelease: boolean;
      timeZone: string;
      bookingCatalog: {
        locations: Array<{ id: string; name: string }>;
        attractions: Array<{ id: string; name: string }>;
        defaultLocationId: string | null;
      } | null;
    };

async function loadView(search: { date?: string; focus?: string }): Promise<View> {
  try {
    const ctx = await getRequestContext();
    const timeZone = await getCurrentTenantTimezone(ctx, db);
    const date = /^\d{4}-\d{2}-\d{2}$/.test(search.date ?? "") ? search.date! : calendarDateInTimeZone(new Date(), timeZone);
    const [board, canCreateEvent, canManageInquiries, canRelease, pendingBookings] = await Promise.all([
      getMasterScheduleBoard(ctx, db, { date }),
      hasPermission(ctx, PERMISSIONS.EVENTS_CREATE, db),
      hasPermission(ctx, PERMISSIONS.CRM_INQUIRIES_MANAGE, db),
      hasPermission(ctx, PERMISSIONS.EVENTS_EDIT, db),
      listPendingBookingsForSchedule(ctx, db, date),
    ]);
    const canCreate = canCreateEvent && canManageInquiries;
    const bookingCatalog = canCreate
      ? await (async () => {
          const [locations, knowledge] = await Promise.all([
            db.location.findMany({
              where: { organizationId: ctx.organizationId, active: true },
              select: { id: true, name: true },
              orderBy: { name: "asc" },
            }),
            listWorkspaceKnowledge(ctx, db),
          ]);
          return {
            locations,
            attractions: knowledge
              .filter((row) => row.type === SALES_KNOWLEDGE_TYPES.ATTRACTION)
              .map((row) => ({ id: row.id, name: row.name })),
            defaultLocationId: ctx.locationId ?? locations[0]?.id ?? null,
          };
        })()
      : null;
    const knownFocus =
      search.focus === "holds" ||
      search.focus === "booked" ||
      board.types.some((row) => row.id === search.focus);
    return {
      kind: "ready",
      date,
      focus: knownFocus && search.focus ? search.focus : SCHEDULE_FOCUS_ALL,
      locationId: ctx.locationId ?? null,
      board,
      pendingBookings,
      canCreate,
      canRelease,
      timeZone,
      bookingCatalog,
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
  searchParams: Promise<{ date?: string; focus?: string; builder?: string }>;
}) {
  const search = await searchParams;
  const builderId = /^[A-Za-z0-9_-]+$/.test(search.builder ?? "") ? search.builder! : null;
  const view = await loadView(search);
  if (view.kind === "status") {
    return <SecurityStatusPanel title={view.title} body={view.body} />;
  }

  const groups = view.board.types
    .map((type) => ({
      id: type.id,
      name: type.name,
      resources: view.board.resources.filter((resource) => resource.resourceTypeId === type.id),
    }))
    .filter((group) => group.resources.length > 0);

  return (
    <section className="w-full max-w-none overflow-x-hidden">
      <p className="text-sm font-semibold tracking-[0.18em] text-primary uppercase">Operations</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">Master Schedule</h1>
      <p className="mt-2 max-w-2xl text-sm text-foreground/70">
        Occupied lanes, bays, and rooms for this location. A block is a real hold or confirmed booking.
      </p>
      <ScheduleDayNav
        date={view.date}
        prev={shiftDate(view.date, -1)}
        next={shiftDate(view.date, 1)}
        today={calendarDateInTimeZone(new Date(), view.timeZone)}
        focus={view.focus}
      />
      {groups.length === 0 ? (
        <p className="mt-8 text-sm text-foreground/70">
          No resources are configured for this location.{" "}
          <Link href="/app/admin/resources" className="cursor-pointer text-primary">
            Configure resources
          </Link>
        </p>
      ) : (
        <MasterScheduleBoard
          date={view.date}
          focus={view.focus}
          locationId={view.locationId}
          groups={groups}
          reservations={view.board.reservations.map((row) => ({
            id: row.id,
            resourceId: row.resourceId,
            status: row.status,
            startMinute: row.startMinute,
            endMinute: row.endMinute,
            inquiryId: row.inquiryId,
            bookingId: row.bookingId,
            expiresAt: row.expiresAt?.toISOString() ?? null,
            inquiry: row.inquiry,
            booking: row.booking,
          }))}
          slotMinutes={view.board.slotMinutes}
          startMinute={view.board.startMinute}
          endMinute={view.board.endMinute}
          canCreate={view.canCreate}
          canRelease={view.canRelease}
          timeZone={view.timeZone}
          bookingCatalog={view.bookingCatalog}
          builderInquiryId={view.canCreate ? builderId : null}
          review={view.canCreate && builderId ? <EmployeeInquiryBookingReview inquiryId={builderId} /> : null}
        />
      )}
      <PendingBookingsPanel bookings={view.pendingBookings} />
    </section>
  );
}
