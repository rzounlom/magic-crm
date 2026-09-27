import { afterAll, afterEach, describe, expect, it } from "vitest";

import { resolveRequestContext } from "@/server/request-context";
import { listInquiries } from "@/server/services/inquiry-service";
import { provisionOrganization } from "@/server/services/provision-organization";
import { BOOKING_STATUSES } from "@/types/booking";
import { INQUIRY_LIST_VIEWS } from "@/types/inquiry";
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
      clerkUserId: `user_hist_${suffix}_${crypto.randomUUID()}`,
      clerkOrganizationId: `clerk_org_hist_${suffix}_${crypto.randomUUID()}`,
      organizationName: `History ${suffix}`,
      organizationSlug: `history-${suffix}-${crypto.randomUUID()}`,
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
  return { ...result, ctx };
}

async function insertInquiry(organizationId: string, firstName: string) {
  const email = `${firstName.toLowerCase()}.${crypto.randomUUID()}@example.com`;
  return db.inquiry.create({
    data: {
      organizationId,
      status: "NEW",
      source: "WEB",
      customerFirstName: firstName,
      customerEmail: email,
      customerEmailNormalized: email,
    },
  });
}

async function insertBooking(
  organizationId: string,
  inquiryId: string,
  input: { status: string; endsAt: Date | null; eventDate: Date },
) {
  return db.booking.create({
    data: {
      organizationId,
      inquiryId,
      bookingNumber: `H-${crypto.randomUUID().slice(0, 8)}`,
      status: input.status,
      eventDate: input.eventDate,
      startTime: "10:00",
      endTime: "12:00",
      startMinute: 600,
      endMinute: 720,
      startsAt: input.endsAt ? new Date(input.endsAt.getTime() - 60 * 60 * 1000) : null,
      endsAt: input.endsAt,
      guestCount: 12,
      subtotalCents: 10000,
      totalCents: 10000,
      currency: "USD",
      customerEmail: "guest@example.com",
      payload: {},
    },
  });
}

describe("inquiry historical queue", () => {
  it("moves ended confirmed bookings out of Active and keeps them in history", async () => {
    const tenantA = await provisionTenant("a");
    const now = new Date();
    const past = new Date(now.getTime() - 60 * 60 * 1000);
    const future = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const yesterday = new Date("2020-01-01T00:00:00.000Z");
    const today = new Date(`${now.toISOString().slice(0, 10)}T00:00:00.000Z`);

    const futureBooked = await insertInquiry(tenantA.organizationId, "Future");
    await insertBooking(tenantA.organizationId, futureBooked.id, {
      status: BOOKING_STATUSES.CONFIRMED,
      endsAt: future,
      eventDate: future,
    });

    const pastBooked = await insertInquiry(tenantA.organizationId, "Past");
    await insertBooking(tenantA.organizationId, pastBooked.id, {
      status: BOOKING_STATUSES.CONFIRMED,
      endsAt: past,
      eventDate: past,
    });

    const endedNow = await insertInquiry(tenantA.organizationId, "Boundary");
    await insertBooking(tenantA.organizationId, endedNow.id, {
      status: BOOKING_STATUSES.COMPLETED,
      endsAt: now,
      eventDate: today,
    });

    const cancelled = await insertInquiry(tenantA.organizationId, "Cancelled");
    await insertBooking(tenantA.organizationId, cancelled.id, {
      status: BOOKING_STATUSES.CANCELLED,
      endsAt: past,
      eventDate: past,
    });

    const openLead = await insertInquiry(tenantA.organizationId, "Open");
    const legacyPast = await insertInquiry(tenantA.organizationId, "Legacy");
    await insertBooking(tenantA.organizationId, legacyPast.id, {
      status: BOOKING_STATUSES.CONFIRMED,
      endsAt: null,
      eventDate: yesterday,
    });

    const otherOrganization = await db.organization.create({
      data: {
        name: "History other",
        slug: `history-other-${crypto.randomUUID()}`,
        timezone: "UTC",
        currency: "USD",
      },
    });
    createdOrganizationIds.push(otherOrganization.id);
    const otherInquiry = await insertInquiry(otherOrganization.id, "Other");
    await insertBooking(otherOrganization.id, otherInquiry.id, {
      status: BOOKING_STATUSES.CONFIRMED,
      endsAt: past,
      eventDate: past,
    });

    const activeA = await listInquiries(tenantA.ctx, db);
    const historyA = await listInquiries(tenantA.ctx, db, { view: INQUIRY_LIST_VIEWS.ARCHIVED });

    const activeIds = activeA.map((row) => row.id);
    const historyIds = historyA.map((row) => row.id);

    expect(activeIds).toContain(futureBooked.id);
    expect(activeIds).toContain(openLead.id);
    expect(activeIds).toContain(cancelled.id);
    expect(activeIds).not.toContain(pastBooked.id);
    expect(activeIds).not.toContain(endedNow.id);
    expect(activeIds).not.toContain(legacyPast.id);
    expect(activeIds).not.toContain(otherInquiry.id);

    expect(historyIds).toContain(pastBooked.id);
    expect(historyIds).toContain(endedNow.id);
    expect(historyIds).toContain(legacyPast.id);
    expect(historyIds).not.toContain(futureBooked.id);
    expect(historyIds).not.toContain(cancelled.id);
    expect(historyIds).not.toContain(openLead.id);
    expect(historyIds).not.toContain(otherInquiry.id);

    expect(await db.inquiry.findFirst({ where: { id: pastBooked.id } })).toBeTruthy();
    expect(await db.booking.findFirst({ where: { inquiryId: pastBooked.id } })).toBeTruthy();
  });
});
