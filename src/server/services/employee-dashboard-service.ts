import "server-only";

import type { PrismaClient } from "@/generated/prisma/client";

import { loadEmployeeShellChrome } from "@/components/layout/employee-shell-chrome";
import { resolveUserGreetingName } from "@/lib/identity/user-display";
import { countInquiryAttention } from "@/lib/inquiries/live-agent-queue";
import {
  formatEventLocalTime,
  resolveOrganizationTimeZone,
} from "@/lib/inquiries/tenant-datetime";
import {
  formatDashboardDateLabel,
  formatDashboardGreeting,
} from "@/lib/ui/employee-dashboard-copy";
import type { EmployeeNavItemId } from "@/lib/ui/employee-navigation";
import { isAuthorizationError, isTenantContextError } from "@/server/errors";
import type { RequestContext } from "@/server/request-context";
import { listBookings } from "@/server/services/booking-service";
import { getInquiryAwareness } from "@/server/services/inquiry-notification-service";
import { listInquiries } from "@/server/services/inquiry-service";
import { BOOKING_LIST_FILTERS, BOOKING_STATUS_LABELS, type BookingStatus } from "@/types/booking";
import { INQUIRY_LIST_VIEWS } from "@/types/inquiry";

type DashboardDb = PrismaClient;

const TODAY_BOOKING_LIMIT = 5;

export type EmployeeDashboardAttention = {
  awaitingStaffReview: number;
  pendingConfirmation: number;
  unreadCount: number;
};

export type EmployeeDashboardBooking = {
  id: string;
  bookingNumber: string;
  title: string;
  startTimeLabel: string;
  statusLabel: string;
  href: string;
};

export type EmployeeDashboardNextAction = {
  id: string;
  label: string;
  href: string;
  external?: boolean;
};

export type EmployeeDashboardReady = {
  kind: "ready";
  greetingName: string;
  greetingHeadline: string;
  dateLabel: string;
  organizationName: string;
  locationName: string;
  visibleNavIds: EmployeeNavItemId[];
  publicInquiryHref: string | null;
  canViewInquiries: boolean;
  canViewBookings: boolean;
  canViewSchedule: boolean;
  attention: EmployeeDashboardAttention | null;
  todayBookings: EmployeeDashboardBooking[] | null;
  todayBookingsHref: string;
  nextActions: EmployeeDashboardNextAction[];
};

function bookingTitle(row: {
  customerGroupName: string | null;
  customerFirstName: string | null;
  customerLastName: string | null;
  eventType: string | null;
}): string {
  const group = row.customerGroupName?.trim();
  if (group) {
    return group;
  }
  const name = [row.customerFirstName, row.customerLastName].filter(Boolean).join(" ").trim();
  if (name) {
    return name;
  }
  if (row.eventType?.trim()) {
    return row.eventType.trim();
  }
  return "Booking";
}

export async function loadEmployeeDashboard(
  ctx: RequestContext,
  database: DashboardDb,
): Promise<EmployeeDashboardReady> {
  const chrome = await loadEmployeeShellChrome();
  const visible = new Set(chrome.visibleNavIds);
  const canViewInquiries = visible.has("inquiries");
  const canViewBookings = visible.has("bookings");
  const canViewSchedule = visible.has("schedule");

  const organization = await database.organization.findFirst({
    where: { id: ctx.organizationId },
    select: { timezone: true },
  });
  const timeZone = resolveOrganizationTimeZone(organization?.timezone);
  const profile = await database.userProfile.findFirst({
    where: { id: ctx.userId, organizationId: ctx.organizationId },
    select: {
      clerkUserId: true,
      firstName: true,
      lastName: true,
      displayName: true,
      email: true,
    },
  });
  const greetingName = profile ? resolveUserGreetingName(profile) : "there";

  const [attention, todayBookings] = await Promise.all([
    canViewInquiries ? loadAttention(ctx, database) : Promise.resolve(null),
    canViewBookings ? loadTodayBookings(ctx, database) : Promise.resolve(null),
  ]);

  const nextActions: EmployeeDashboardNextAction[] = [];
  if (canViewInquiries) {
    nextActions.push({ id: "inquiries", label: "Review inquiries", href: "/app/inquiries" });
  }
  if (canViewSchedule) {
    nextActions.push({ id: "schedule", label: "View schedule", href: "/app/schedule" });
  } else if (canViewBookings) {
    nextActions.push({
      id: "bookings-today",
      label: "Today’s bookings",
      href: `/app/bookings?filter=${BOOKING_LIST_FILTERS.TODAY}`,
    });
  }
  if (chrome.publicInquiryHref && nextActions.length < 3) {
    nextActions.push({
      id: "public-inquiry",
      label: "Public inquiry form",
      href: chrome.publicInquiryHref,
      external: true,
    });
  }

  return {
    kind: "ready",
    greetingName,
    greetingHeadline: formatDashboardGreeting(greetingName, timeZone),
    dateLabel: formatDashboardDateLabel(timeZone),
    organizationName: chrome.organizationName ?? "Your organization",
    locationName: chrome.locationName ?? "No location set",
    visibleNavIds: chrome.visibleNavIds,
    publicInquiryHref: chrome.publicInquiryHref,
    canViewInquiries,
    canViewBookings,
    canViewSchedule,
    attention,
    todayBookings,
    todayBookingsHref: `/app/bookings?filter=${BOOKING_LIST_FILTERS.TODAY}`,
    nextActions: nextActions.slice(0, 3),
  };
}

async function loadAttention(
  ctx: RequestContext,
  database: DashboardDb,
): Promise<EmployeeDashboardAttention | null> {
  try {
    const [inquiries, awareness] = await Promise.all([
      listInquiries(ctx, database, { view: INQUIRY_LIST_VIEWS.ACTIVE }),
      getInquiryAwareness(ctx, database),
    ]);
    const counts = countInquiryAttention(inquiries);
    return {
      awaitingStaffReview: counts.awaitingStaffReview,
      pendingConfirmation: counts.pendingConfirmation,
      unreadCount: awareness.unreadCount,
    };
  } catch (error) {
    if (isAuthorizationError(error) || isTenantContextError(error)) {
      return null;
    }
    throw error;
  }
}

async function loadTodayBookings(
  ctx: RequestContext,
  database: DashboardDb,
): Promise<EmployeeDashboardBooking[] | null> {
  try {
    const bookings = await listBookings(ctx, database, { filter: BOOKING_LIST_FILTERS.TODAY });
    return bookings.slice(0, TODAY_BOOKING_LIMIT).map((row) => ({
      id: row.id,
      bookingNumber: row.bookingNumber,
      title: bookingTitle(row),
      startTimeLabel: formatEventLocalTime(row.startTime) ?? row.startTime,
      statusLabel: BOOKING_STATUS_LABELS[row.status as BookingStatus] ?? row.status,
      href: `/app/bookings/${row.id}`,
    }));
  } catch (error) {
    if (isAuthorizationError(error) || isTenantContextError(error)) {
      return null;
    }
    throw error;
  }
}
