-- Booking cancellation timestamps and inquiry archive. Do not rewrite historical reservation windows.
-- Cancellation releases occupancy via ResourceReservation.releasedAt; rows are kept.

ALTER TABLE "bookings" ADD COLUMN "cancelledAt" TIMESTAMP(3);
ALTER TABLE "bookings" ADD COLUMN "cancelledByUserProfileId" TEXT;

ALTER TABLE "inquiries" ADD COLUMN "archivedAt" TIMESTAMP(3);
ALTER TABLE "inquiries" ADD COLUMN "archivedByUserProfileId" TEXT;

ALTER TABLE "bookings" ADD CONSTRAINT "bookings_cancelledByUserProfileId_fkey" FOREIGN KEY ("cancelledByUserProfileId") REFERENCES "user_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_archivedByUserProfileId_fkey" FOREIGN KEY ("archivedByUserProfileId") REFERENCES "user_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "bookings_cancelledByUserProfileId_idx" ON "bookings"("cancelledByUserProfileId");
CREATE INDEX "inquiries_organizationId_archivedAt_idx" ON "inquiries"("organizationId", "archivedAt");
CREATE INDEX "inquiries_archivedByUserProfileId_idx" ON "inquiries"("archivedByUserProfileId");
