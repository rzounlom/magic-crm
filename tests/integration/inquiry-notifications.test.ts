import { afterAll, afterEach, describe, expect, it } from "vitest";

import { SYSTEM_GROUP_KEYS } from "@/server/authorization/default-security-groups";
import { AuthorizationError } from "@/server/errors";
import { resolveRequestContext } from "@/server/request-context";
import { listInquiries } from "@/server/services/inquiry-service";
import {
  getInquiryAwareness,
  markAllInquiryNotificationsSeen,
  markInquiryNotificationSeen,
} from "@/server/services/inquiry-notification-service";
import { provisionOrganization } from "@/server/services/provision-organization";
import { deleteTestOrganizations } from "../helpers/cleanup-test-organizations";
import { createTestPrismaClient } from "../helpers/test-database";

const db = createTestPrismaClient();
const createdOrganizationIds: string[] = [];

afterEach(async () => {
  await deleteTestOrganizations(db, createdOrganizationIds);
  createdOrganizationIds.length = 0;
});

afterAll(async () => {
  await db.$disconnect();
});

async function provisionTenant(suffix: string) {
  const result = await provisionOrganization(
    {
      clerkUserId: `user_notify_${suffix}_${crypto.randomUUID()}`,
      clerkOrganizationId: `clerk_org_notify_${suffix}_${crypto.randomUUID()}`,
      organizationName: `Notify ${suffix}`,
      organizationSlug: `notify-${suffix}-${crypto.randomUUID()}`,
      isClerkOrganizationAdmin: true,
    },
    db,
  );
  createdOrganizationIds.push(result.organizationId);
  const organization = await db.organization.findFirstOrThrow({ where: { id: result.organizationId } });
  const profile = await db.userProfile.findFirstOrThrow({ where: { id: result.userProfileId } });
  const ctx = await resolveRequestContext(
    { clerkUserId: profile.clerkUserId, clerkOrganizationId: organization.clerkOrganizationId },
    db,
  );
  return { ...result, ctx, organization, profile };
}

async function addGroupUser(
  tenant: Awaited<ReturnType<typeof provisionTenant>>,
  systemKey: string,
  email: string,
  clerkUserId = `user_${crypto.randomUUID()}`,
) {
  const group = await db.securityGroup.findFirstOrThrow({
    where: { organizationId: tenant.organizationId, systemKey },
  });
  const profile = await db.userProfile.create({
    data: {
      organizationId: tenant.organizationId,
      clerkUserId,
      defaultLocationId: tenant.locationId,
      email,
      firstName: email.split("@")[0] ?? "Agent",
      lastName: "Staff",
    },
  });
  await db.securityGroupMember.create({
    data: {
      organizationId: tenant.organizationId,
      securityGroupId: group.id,
      userProfileId: profile.id,
    },
  });
  const ctx = await resolveRequestContext(
    { clerkUserId: profile.clerkUserId, clerkOrganizationId: tenant.organization.clerkOrganizationId },
    db,
  );
  return { profile, ctx };
}

async function insertInquiry(
  organizationId: string,
  firstName: string,
  createdAt: Date,
  extras: { guestCount?: number; eventGoal?: string } = {},
) {
  const email = `${firstName.toLowerCase()}.${crypto.randomUUID()}@example.com`;
  return db.inquiry.create({
    data: {
      organizationId,
      status: "NEW",
      source: "WEB",
      customerFirstName: firstName,
      customerEmail: email,
      customerEmailNormalized: email,
      guestCount: extras.guestCount ?? 20,
      eventGoal: extras.eventGoal ?? "Celebration",
      createdAt,
    },
  });
}

describe("inquiry notification awareness", () => {
  it("keeps unread state per employee and per tenant", async () => {
    const tenantA = await provisionTenant("a");
    const tenantB = await provisionTenant("b");
    const employeeA2 = await addGroupUser(tenantA, SYSTEM_GROUP_KEYS.EVENT_SALES, "a2@example.com");
    const frontDesk = await addGroupUser(tenantA, SYSTEM_GROUP_KEYS.FRONT_DESK, "desk@example.com");
    const switched = await addGroupUser(
      tenantB,
      SYSTEM_GROUP_KEYS.EVENT_SALES,
      "a1-on-b@example.com",
      tenantA.profile.clerkUserId,
    );

    const older = await insertInquiry(tenantA.organizationId, "Ada", new Date("2026-09-26T17:00:00.000Z"), {
      guestCount: 8,
      eventGoal: "Birthday",
    });
    const middle = await insertInquiry(tenantA.organizationId, "Jake", new Date("2026-09-26T17:05:00.000Z"));
    const newer = await insertInquiry(tenantA.organizationId, "Cara", new Date("2026-09-26T17:10:00.000Z"), {
      guestCount: 12,
      eventGoal: "Birthday",
    });
    const inquiryB = await insertInquiry(tenantB.organizationId, "Sarah", new Date("2026-09-26T17:06:00.000Z"), {
      guestCount: 12,
      eventGoal: "Birthday",
    });

    await listInquiries(tenantA.ctx, db);
    const listedSeen = await db.inquirySeen.count({ where: { organizationId: tenantA.organizationId } });
    expect(listedSeen).toBe(0);

    const employeeA1 = await getInquiryAwareness(tenantA.ctx, db);
    const employeeA2View = await getInquiryAwareness(employeeA2.ctx, db);
    const employeeB = await getInquiryAwareness(tenantB.ctx, db);
    expect(employeeA1.organizationId).toBe(tenantA.organizationId);
    expect(employeeA1.unreadCount).toBe(3);
    expect(employeeA1.notifications.map((item) => item.customerLabel)).toEqual(["Cara", "Jake", "Ada"]);
    expect(JSON.stringify(employeeA1)).not.toContain("Sarah");
    expect(JSON.stringify(employeeA1)).not.toContain("@");
    expect(employeeA2View.unreadCount).toBe(3);
    expect(employeeA2View.notifications.every((item) => item.unread)).toBe(true);
    expect(employeeB.unreadCount).toBe(1);
    expect(employeeB.notifications.map((item) => item.customerLabel)).toEqual(["Sarah"]);
    expect(JSON.stringify(employeeB)).not.toContain("Jake");
    expect(employeeB.organizationId).toBe(tenantB.organizationId);

    await expect(getInquiryAwareness(frontDesk.ctx, db)).rejects.toBeInstanceOf(AuthorizationError);

    const activeOrganization = await getInquiryAwareness(switched.ctx, db);
    expect(activeOrganization.organizationId).toBe(tenantB.organizationId);
    expect(activeOrganization.notifications.map((item) => item.id)).toEqual([inquiryB.id]);
    expect(JSON.stringify(activeOrganization)).not.toContain("Jake");

    await markInquiryNotificationSeen(tenantA.ctx, db, middle.id);
    await markInquiryNotificationSeen(tenantA.ctx, db, inquiryB.id);

    const afterMiddle = await getInquiryAwareness(tenantA.ctx, db);
    const stillUnreadForA2 = await getInquiryAwareness(employeeA2.ctx, db);
    expect(afterMiddle.notifications.find((item) => item.id === middle.id)?.unread).toBe(false);
    expect(afterMiddle.notifications.find((item) => item.id === newer.id)?.unread).toBe(true);
    expect(afterMiddle.notifications.find((item) => item.id === older.id)?.unread).toBe(true);
    expect(afterMiddle.unreadCount).toBe(2);
    expect(stillUnreadForA2.unreadCount).toBe(3);
    expect(await db.inquirySeen.count({ where: { inquiryId: inquiryB.id, userProfileId: tenantA.profile.id } })).toBe(0);

    const reloaded = await getInquiryAwareness(tenantA.ctx, db);
    expect(reloaded.notifications.find((item) => item.id === middle.id)?.unread).toBe(false);
    expect(reloaded.unreadCount).toBe(2);

    await insertInquiry(tenantA.organizationId, "Noah", new Date("2026-09-26T17:15:00.000Z"));
    const withNoah = await getInquiryAwareness(tenantA.ctx, db);
    expect(withNoah.unreadCount).toBe(3);
    expect(withNoah.notifications[0]?.customerLabel).toBe("Noah");
    expect(withNoah.notifications[0]?.unread).toBe(true);

    const archived = await insertInquiry(tenantA.organizationId, "Ida", new Date("2026-09-26T17:16:00.000Z"));
    await db.inquiry.update({ where: { id: archived.id }, data: { archivedAt: new Date() } });
    const beforeMarkAll = await getInquiryAwareness(tenantA.ctx, db);
    expect(beforeMarkAll.unreadCount).toBe(3);
    expect(beforeMarkAll.notifications.some((item) => item.id === archived.id)).toBe(false);

    await markAllInquiryNotificationsSeen(tenantA.ctx, db);
    const cleared = await getInquiryAwareness(tenantA.ctx, db);
    const stillUnreadForA2AfterClear = await getInquiryAwareness(employeeA2.ctx, db);
    const stillUnreadForB = await getInquiryAwareness(tenantB.ctx, db);
    expect(cleared.unreadCount).toBe(0);
    expect(cleared.notifications.every((item) => !item.unread)).toBe(true);
    expect(stillUnreadForA2AfterClear.unreadCount).toBe(4);
    expect(stillUnreadForB.unreadCount).toBe(1);
    expect(stillUnreadForB.notifications.map((item) => item.customerLabel)).toEqual(["Sarah"]);
    expect(await db.inquirySeen.count({ where: { inquiryId: archived.id } })).toBe(0);
    expect(await db.inquirySeen.count({ where: { inquiryId: inquiryB.id, organizationId: tenantA.organizationId } })).toBe(0);

    const seenAfterClear = await db.inquirySeen.count({
      where: { organizationId: tenantA.organizationId, userProfileId: tenantA.profile.id },
    });
    await markAllInquiryNotificationsSeen(tenantA.ctx, db);
    expect(
      await db.inquirySeen.count({
        where: { organizationId: tenantA.organizationId, userProfileId: tenantA.profile.id },
      }),
    ).toBe(seenAfterClear);

    await expect(markAllInquiryNotificationsSeen(frontDesk.ctx, db)).rejects.toBeInstanceOf(AuthorizationError);

    await insertInquiry(tenantA.organizationId, "Liam", new Date("2026-09-26T17:20:00.000Z"));
    const afterClear = await getInquiryAwareness(tenantA.ctx, db);
    expect(afterClear.unreadCount).toBe(1);
    expect(afterClear.notifications[0]?.customerLabel).toBe("Liam");
    expect(afterClear.notifications[0]?.unread).toBe(true);
  }, 60_000);
});
