-- Align Prisma and PostgreSQL: the composite default-location FK uses
-- ON DELETE RESTRICT. Location deletion must first clear same-tenant
-- defaultLocationId references in application code (not implemented here).

-- DropForeignKey
ALTER TABLE "user_profiles" DROP CONSTRAINT "user_profiles_organizationId_defaultLocationId_fkey";

-- AddForeignKey
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_organizationId_defaultLocationId_fkey" FOREIGN KEY ("organizationId", "defaultLocationId") REFERENCES "locations"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
