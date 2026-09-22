-- Pending unpaid bookings: commercial intent without resource occupancy.
-- Keep historical HOLD reservation rows. Do not mass-convert them.
-- confirmedBy/confirmedAt become optional so PENDING_PAYMENT rows can exist before payment.

ALTER TABLE "bookings" ALTER COLUMN "confirmedByUserProfileId" DROP NOT NULL;
ALTER TABLE "bookings" ALTER COLUMN "confirmedAt" DROP NOT NULL;

ALTER TABLE "bookings" ADD COLUMN "paymentConfirmedExternallyAt" TIMESTAMP(3);
ALTER TABLE "bookings" ADD COLUMN "paymentConfirmedExternallyByUserProfileId" TEXT;
ALTER TABLE "bookings" ADD COLUMN "availabilityConflictAt" TIMESTAMP(3);

ALTER TABLE "bookings" DROP CONSTRAINT "bookings_organizationId_confirmedByUserProfileId_fkey";

ALTER TABLE "bookings" ADD CONSTRAINT "bookings_confirmedByUserProfileId_fkey" FOREIGN KEY ("confirmedByUserProfileId") REFERENCES "user_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_paymentConfirmedExternallyByUserProfileId_fkey" FOREIGN KEY ("paymentConfirmedExternallyByUserProfileId") REFERENCES "user_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "bookings_confirmedByUserProfileId_idx" ON "bookings"("confirmedByUserProfileId");
CREATE INDEX "bookings_paymentConfirmedExternallyByUserProfileId_idx" ON "bookings"("paymentConfirmedExternallyByUserProfileId");
