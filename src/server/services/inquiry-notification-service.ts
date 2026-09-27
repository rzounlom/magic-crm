import type { PrismaClient } from "@/generated/prisma/client";

import {
  INQUIRY_NOTIFICATION_LIMIT,
  inquiryNotificationCustomerLabel,
  inquiryNotificationDetail,
  type InquiryAwarenessSnapshot,
  type InquiryNotificationItem,
} from "@/lib/inquiries/inquiry-awareness";
import { inquiryListWhere } from "@/server/inquiries/inquiry-queue";
import { requirePermission } from "@/server/policies/require-permission";
import type { RequestContext } from "@/server/request-context";
import { INQUIRY_LIST_VIEWS } from "@/types/inquiry";
import { PERMISSIONS } from "@/types/permissions";

type InquiryNotificationDb = PrismaClient;

async function activeInquiryWhere(ctx: RequestContext, database: InquiryNotificationDb) {
  const organization = await database.organization.findFirst({
    where: { id: ctx.organizationId },
    select: { timezone: true },
  });
  return inquiryListWhere({
    organizationId: ctx.organizationId,
    view: INQUIRY_LIST_VIEWS.ACTIVE,
    timeZone: organization?.timezone,
  });
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
  const active = await activeInquiryWhere(ctx, database);
  const [unreadCount, recent] = await Promise.all([
    database.inquiry.count({
      where: {
        ...active,
        notificationSeen: {
          none: { organizationId: ctx.organizationId, userProfileId: ctx.userId },
        },
      },
    }),
    database.inquiry.findMany({
      where: active,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: INQUIRY_NOTIFICATION_LIMIT,
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

  const notifications: InquiryNotificationItem[] = recent.map((inquiry) => ({
    id: inquiry.id,
    kind: "inquiry.created",
    title: "New inquiry",
    customerLabel: inquiryNotificationCustomerLabel(inquiry.customerFirstName),
    detail: inquiryNotificationDetail(inquiry.guestCount, inquiry.eventGoal),
    createdAt: inquiry.createdAt.toISOString(),
    href: `/app/inquiries/${inquiry.id}`,
    unread: inquiry.notificationSeen.length === 0,
  }));
  const newest = recent[0] ?? null;

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
      ...(await activeInquiryWhere(ctx, database)),
      notificationSeen: {
        none: { organizationId: ctx.organizationId, userProfileId: ctx.userId },
      },
    },
    select: { id: true },
  });
  if (unseen.length > 0) {
    await database.inquirySeen.createMany({
      data: unseen.map((inquiry) => ({
        organizationId: ctx.organizationId,
        userProfileId: ctx.userId,
        inquiryId: inquiry.id,
      })),
      skipDuplicates: true,
    });
  }
  return loadInquiryAwarenessSnapshot(ctx, database);
}
