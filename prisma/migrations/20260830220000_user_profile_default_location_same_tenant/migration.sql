-- Require defaultLocation, when set, to belong to the same organization.
-- Prisma emits `ON DELETE SET NULL` for the whole composite key, which would
-- also null organizationId. PostgreSQL 15+ column-subset SET NULL keeps the
-- tenant and only clears the location reference.

-- DropForeignKey
ALTER TABLE "user_profiles" DROP CONSTRAINT "user_profiles_defaultLocationId_fkey";

-- CreateIndex
CREATE UNIQUE INDEX "locations_organizationId_id_key" ON "locations"("organizationId", "id");

-- AddForeignKey
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_organizationId_defaultLocationId_fkey" FOREIGN KEY ("organizationId", "defaultLocationId") REFERENCES "locations"("organizationId", "id") ON DELETE SET NULL ("defaultLocationId") ON UPDATE CASCADE;
