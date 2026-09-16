-- Phase 3B: tenant deposit policy, reservation location/UTC instants, booking deposit snapshots.
-- btree_gist exclusion `resource_reservations_no_overlap` already exists from 20260909140000_finite_resource_schedule.

ALTER TABLE "organizations" ADD COLUMN "depositPercent" INTEGER NOT NULL DEFAULT 30;

ALTER TABLE "organizations"
  ADD CONSTRAINT "organizations_depositPercent_range"
  CHECK ("depositPercent" >= 0 AND "depositPercent" <= 100);

ALTER TABLE "resource_reservations" ADD COLUMN "locationId" TEXT;
ALTER TABLE "resource_reservations" ADD COLUMN "startsAt" TIMESTAMP(3);
ALTER TABLE "resource_reservations" ADD COLUMN "endsAt" TIMESTAMP(3);

CREATE INDEX "resource_reservations_organizationId_locationId_slotDate_idx"
  ON "resource_reservations"("organizationId", "locationId", "slotDate");

ALTER TABLE "resource_reservations"
  ADD CONSTRAINT "resource_reservations_org_location_fkey"
  FOREIGN KEY ("organizationId", "locationId")
  REFERENCES "locations"("organizationId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "bookings" ADD COLUMN "startsAt" TIMESTAMP(3);
ALTER TABLE "bookings" ADD COLUMN "endsAt" TIMESTAMP(3);
ALTER TABLE "bookings" ADD COLUMN "depositRequiredCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "bookings" ADD COLUMN "depositPaidCents" INTEGER NOT NULL DEFAULT 0;
