-- A Clerk user may belong to multiple MagicCRM organizations.
-- Membership is unique per (organizationId, clerkUserId), not globally.

-- DropIndex
DROP INDEX "user_profiles_clerkUserId_key";

-- AlterTable
ALTER TABLE "user_profiles" ALTER COLUMN "clerkUserId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "user_profiles_clerkUserId_idx" ON "user_profiles"("clerkUserId");

-- CreateIndex
CREATE UNIQUE INDEX "user_profiles_organizationId_clerkUserId_key" ON "user_profiles"("organizationId", "clerkUserId");
