-- R2D.3: one-time staff operating-hours exceptions + absolute-instant overnight exclusion.
-- Additive. Does not seed Generations hours. Does not rewrite historical reservations.

CREATE TABLE "operating_hours_staff_exceptions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "purpose" VARCHAR(24) NOT NULL,
    "slotDate" DATE NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,
    "overriddenStatus" VARCHAR(32) NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "authorizedByUserProfileId" TEXT NOT NULL,
    "authorizedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "revokedByUserProfileId" TEXT,
    "consumedAt" TIMESTAMP(3),
    "inquiryId" TEXT,
    "bookingId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "operating_hours_staff_exceptions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "operating_hours_staff_exceptions_organizationId_id_key" ON "operating_hours_staff_exceptions"("organizationId", "id");
CREATE INDEX "operating_hours_staff_exceptions_organizationId_locationId_slotDate_idx" ON "operating_hours_staff_exceptions"("organizationId", "locationId", "slotDate");
CREATE INDEX "operating_hours_staff_exceptions_organizationId_inquiryId_idx" ON "operating_hours_staff_exceptions"("organizationId", "inquiryId");
CREATE INDEX "operating_hours_staff_exceptions_organizationId_bookingId_idx" ON "operating_hours_staff_exceptions"("organizationId", "bookingId");
CREATE INDEX "operating_hours_staff_exceptions_organizationId_consumedAt_revokedAt_expiresAt_idx" ON "operating_hours_staff_exceptions"("organizationId", "consumedAt", "revokedAt", "expiresAt");

ALTER TABLE "operating_hours_staff_exceptions" ADD CONSTRAINT "operating_hours_staff_exceptions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "operating_hours_staff_exceptions" ADD CONSTRAINT "operating_hours_staff_exceptions_organizationId_locationId_fkey" FOREIGN KEY ("organizationId", "locationId") REFERENCES "locations"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "operating_hours_staff_exceptions" ADD CONSTRAINT "operating_hours_staff_exceptions_org_authorizedBy_fkey" FOREIGN KEY ("organizationId", "authorizedByUserProfileId") REFERENCES "user_profiles"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "operating_hours_staff_exceptions" ADD CONSTRAINT "operating_hours_staff_exceptions_org_revokedBy_fkey" FOREIGN KEY ("organizationId", "revokedByUserProfileId") REFERENCES "user_profiles"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "operating_hours_staff_exceptions" ADD CONSTRAINT "operating_hours_staff_exceptions_org_inquiry_fkey" FOREIGN KEY ("organizationId", "inquiryId") REFERENCES "inquiries"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "operating_hours_staff_exceptions" ADD CONSTRAINT "operating_hours_staff_exceptions_org_booking_fkey" FOREIGN KEY ("organizationId", "bookingId") REFERENCES "bookings"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Absolute instant overlap protection for midnight-crossing / overnight occupancy.
-- Uses tsrange because Prisma DateTime columns are TIMESTAMP WITHOUT TIME ZONE.
-- Complements same-day int4range exclusion; does not rewrite historical rows.
ALTER TABLE "resource_reservations"
  ADD CONSTRAINT "resource_reservations_no_overlap_instants"
  EXCLUDE USING gist (
    "resourceId" WITH =,
    tsrange("startsAt", "endsAt", '[)') WITH &&
  )
  WHERE (
    "releasedAt" IS NULL
    AND "status" IN ('HOLD', 'BOOKED')
    AND "startsAt" IS NOT NULL
    AND "endsAt" IS NOT NULL
  );
