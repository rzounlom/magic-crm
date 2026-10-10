import type { PrismaClient } from "@/generated/prisma/client";

import {
  INQUIRY_NOTIFICATION_LIMIT,
  inquiryNotificationCustomerLabel,
  inquiryNotificationDetail,
  unreadCountExcludingEnded,
  visibleBellInquiries,
  type InquiryAwarenessSnapshot,
  type InquiryNotificationItem,
} from "@/lib/inquiries/inquiry-awareness";
import { historicalConfirmedBookingWhere } from "@/server/inquiries/inquiry-queue";
import { requirePermission } from "@/server/policies/require-permission";
import type { RequestContext } from "@/server/request-context";
import { PERMISSIONS } from "@/types/permissions";

type InquiryNotificationDb = PrismaClient;

const BELL_CANDIDATE_LIMIT = INQUIRY_NOTIFICATION_LIMIT + 16;
const ENDED_ID_CHUNK = 200;

async function endedInquiryIds(
  database: InquiryNotificationDb,
  organizationId: string,
  inquiryIds: string[],
  timeZone: string | null | undefined,
): Promise<Set<string>> {
  const ended = new Set<string>();
  if (inquiryIds.length === 0) {
    return ended;
  }
  const historical = historicalConfirmedBookingWhere(new Date(), timeZone);
  for (let index = 0; index < inquiryIds.length; index += ENDED_ID_CHUNK) {
    const slice = inquiryIds.slice(index, index + ENDED_ID_CHUNK);
    const rows = await database.booking.findMany({
      where: {
        organizationId,
        inquiryId: { in: slice },
        ...historical,
      },
      select: { inquiryId: true },
    });
    for (const row of rows) {
      ended.add(row.inquiryId);
    }
  }
  return ended;
}

export async function getInquiryAwareness(
  ctx: RequestContext,
  database: InquiryNotificationDb,
): Promise<InquiryAwarenessSnapshot> {
  await requirePermission(ctx, PERMISSIONS.CRM_INQUIRIES_VIEW, database);
  return loadInquiryAwarenessSnapshot(ctx, database);
}

async function loadInquiryAwarenessSnapshot(
  ctx: RequestContext,
  database: InquiryNotificationDb,
): Promise<InquiryAwarenessSnapshot> {
  const started = Date.now();
  const organization = await database.organization.findFirst({
    where: { id: ctx.organizationId },
    select: { timezone: true },
  });
  const openWhere = { organizationId: ctx.organizationId, archivedAt: null };
  const [unseen, recent] = await Promise.all([
    database.inquiry.findMany({
      where: {
        ...openWhere,
        notificationSeen: {
          none: { organizationId: ctx.organizationId, userProfileId: ctx.userId },
        },
      },
      select: { id: true },
    }),
    database.inquiry.findMany({
      where: openWhere,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: BELL_CANDIDATE_LIMIT,
      select: {
        id: true,
        customerFirstName: true,
        guestCount: true,
        eventGoal: true,
        createdAt: true,
        notificationSeen: {
          where: { organizationId: ctx.organizationId, userProfileId: ctx.userId },
          select: { id: true },
          take: 1,
        },
      },
    }),
  ]);
  const ended = await endedInquiryIds(
    database,
    ctx.organizationId,
    [...new Set([...unseen.map((row) => row.id), ...recent.map((row) => row.id)])],
    organization?.timezone,
  );
  const unreadCount = unreadCountExcludingEnded(
    unseen.map((row) => row.id),
    ended,
  );
  const visible = visibleBellInquiries(recent, ended, INQUIRY_NOTIFICATION_LIMIT);
  const notifications: InquiryNotificationItem[] = visible.map((inquiry) => ({
    id: inquiry.id,
    kind: "inquiry.created",
    title: "New inquiry",
    customerLabel: inquiryNotificationCustomerLabel(inquiry.customerFirstName),
    detail: inquiryNotificationDetail(inquiry.guestCount, inquiry.eventGoal),
    createdAt: inquiry.createdAt.toISOString(),
    href: `/app/inquiries/${inquiry.id}`,
    unread: inquiry.notificationSeen.length === 0,
  }));
  const newest = visible[0] ?? null;
  if (process.env.NODE_ENV !== "production") {
    console.info(
      JSON.stringify({
        scope: "magiccrm.inquiry-awareness",
        event: "loaded",
        durationMs: Date.now() - started,
        unreadCount,
        candidateCount: recent.length,
      }),
    );
  }

  return {
    organizationId: ctx.organizationId,
    unreadCount,
    newestInquiryId: newest?.id ?? null,
    newestInquiryAt: newest ? newest.createdAt.toISOString() : null,
    notifications,
  };
}

export async function markInquiryNotificationSeen(
  ctx: RequestContext,
  database: InquiryNotificationDb,
  inquiryId: string,
): Promise<InquiryAwarenessSnapshot> {
  await requirePermission(ctx, PERMISSIONS.CRM_INQUIRIES_VIEW, database);
  const inquiry = await database.inquiry.findFirst({
    where: { id: inquiryId, organizationId: ctx.organizationId },
    select: { id: true },
  });
  if (inquiry) {
    await database.inquirySeen.upsert({
      where: {
        organizationId_userProfileId_inquiryId: {
          organizationId: ctx.organizationId,
          userProfileId: ctx.userId,
          inquiryId,
        },
      },
      create: {
        organizationId: ctx.organizationId,
        userProfileId: ctx.userId,
        inquiryId,
      },
      update: {},
    });
  }
  return loadInquiryAwarenessSnapshot(ctx, database);
}

export async function markAllInquiryNotificationsSeen(
  ctx: RequestContext,
  database: InquiryNotificationDb,
): Promise<InquiryAwarenessSnapshot> {
  await requirePermission(ctx, PERMISSIONS.CRM_INQUIRIES_VIEW, database);
  const unseen = await database.inquiry.findMany({
    where: {
      organizationId: ctx.organizationId,
      archivedAt: null,
      notificationSeen: {
        none: { organizationId: ctx.organizationId, userProfileId: ctx.userId },
      },
    },
    select: { id: true },
  });
  const organization = await database.organization.findFirst({
    where: { id: ctx.organizationId },
    select: { timezone: true },
  });
  const ended = await endedInquiryIds(
    database,
    ctx.organizationId,
    unseen.map((row) => row.id),
    organization?.timezone,
  );
  const stillOpen = unseen.filter((row) => !ended.has(row.id));
  if (stillOpen.length > 0) {
    await database.inquirySeen.createMany({
      data: stillOpen.map((inquiry) => ({
        organizationId: ctx.organizationId,
        userProfileId: ctx.userId,
        inquiryId: inquiry.id,
      })),
      skipDuplicates: true,
    });
  }
  return loadInquiryAwarenessSnapshot(ctx, database);
}
