-- AlterTable
ALTER TABLE "user_profiles" ADD COLUMN     "avatarUrl" TEXT,
ADD COLUMN     "displayName" VARCHAR(160),
ADD COLUMN     "email" VARCHAR(254),
ADD COLUMN     "firstName" VARCHAR(80),
ADD COLUMN     "lastName" VARCHAR(80);
