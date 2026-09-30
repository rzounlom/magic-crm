import { afterAll, describe, expect, it } from "vitest";

import { loadBookingCatalogDataset } from "@/server/catalog/load-dataset";
import { resolveRequestContext } from "@/server/request-context";
import { confirmInquiryBooking, listPendingBookingsForSchedule } from "@/server/services/booking-service";
import { importBookingCatalog } from "@/server/services/catalog-import-service";
import { createEmployeeManualInquiry } from "@/server/services/inquiry-service";
import { savePendingEmployeeBooking } from "@/server/services/live-agent-service";
import { provisionOrganization } from "@/server/services/provision-organization";
import { getMasterScheduleBoard } from "@/server/services/resource-schedule-service";
import { BOOKING_STATUSES } from "@/types/booking";
import { RESOURCE_RESERVATION_STATUSES } from "@/types/resource-schedule";
import { deleteTestOrganizations } from "../helpers/cleanup-test-organizations";
import { createTestPrismaClient } from "../helpers/test-database";

const db = createTestPrismaClient();
const createdOrganizationIds: string[] = [];
const eventDate = "2027-04-15";

afterAll(async () => {
  await deleteTestOrganizations(db, createdOrganizationIds);
  await db.$disconnect();
});

describe("schedule-native booking", () => {
  it("lists a pending employee booking without occupancy, then paints reservations after confirm", async () => {
    const provisioned = await provisionOrganization(
      {
        clerkUserId: `user_native_${crypto.randomUUID()}`,
        clerkOrganizationId: `clerk_org_native_${crypto.randomUUID()}`,
        organizationName: "Schedule Native Venue",
        organizationSlug: `native-${crypto.randomUUID()}`,
        isClerkOrganizationAdmin: true,
      },
      db,
    );
    createdOrganizationIds.push(provisioned.organizationId);
    const organization = await db.organization.findFirstOrThrow({ where: { id: provisioned.organizationId } });
    const profile = await db.userProfile.findFirstOrThrow({ where: { id: provisioned.userProfileId } });
    const ctx = await resolveRequestContext(
      { clerkUserId: profile.clerkUserId, clerkOrganizationId: organization.clerkOrganizationId },
      db,
    );
    await importBookingCatalog(db, {
      organizationSlug: organization.slug,
      dataset: loadBookingCatalogDataset(),
    });

    const created = await createEmployeeManualInquiry(ctx, db, {
      firstName: "Ada",
      lastName: "Ng",
      customerGroupName: "Native Party",
      email: `ada.native.${crypto.randomUUID()}@example.com`,
      eventType: "Birthday Party",
      preferredDate: eventDate,
      startTime: "11:00",
      guestCount: 12,
      desiredDurationMinutes: 120,
      locationId: provisioned.locationId,
    });
    const pending = await savePendingEmployeeBooking(ctx, db, created.inquiryId);
    const listed = await listPendingBookingsForSchedule(ctx, db, eventDate);
    expect(listed.some((row) => row.id === pending.booking.id)).toBe(true);
    expect(pending.booking.status).toBe(BOOKING_STATUSES.PENDING_PAYMENT);

    const before = await getMasterScheduleBoard(ctx, db, { date: eventDate });
    expect(before.reservations.some((row) => row.inquiryId === created.inquiryId)).toBe(false);
    expect(before.reservations.some((row) => row.status === RESOURCE_RESERVATION_STATUSES.BOOKED)).toBe(false);

    const confirmed = await confirmInquiryBooking(ctx, db, created.inquiryId);
    expect(confirmed.conflict).toBeNull();
    expect(confirmed.booking.id).toBe(pending.booking.id);

    const after = await getMasterScheduleBoard(ctx, db, { date: eventDate });
    const painted = after.reservations.filter((row) => row.bookingId === confirmed.booking.id);
    expect(painted.length).toBeGreaterThan(0);
    expect(painted.every((row) => row.status === RESOURCE_RESERVATION_STATUSES.BOOKED)).toBe(true);
    const pendingAfter = await listPendingBookingsForSchedule(ctx, db, eventDate);
    expect(pendingAfter.some((row) => row.id === pending.booking.id)).toBe(false);
  }, 60_000);
});
