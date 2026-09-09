-- AlterTable
ALTER TABLE "inquiries" ADD COLUMN     "attractionInterestIds" JSONB,
ADD COLUMN     "customerGroupName" VARCHAR(160),
ADD COLUMN     "customerSelectedAt" TIMESTAMP(3),
ADD COLUMN     "desiredDurationMinutes" INTEGER,
ADD COLUMN     "diningPreference" VARCHAR(80),
ADD COLUMN     "eventGoal" VARCHAR(80),
ADD COLUMN     "guestMix" VARCHAR(32),
ADD COLUMN     "recommendationsGeneratedAt" TIMESTAMP(3),
ADD COLUMN     "recommendationsViewedAt" TIMESTAMP(3),
ADD COLUMN     "selectedEventPlanId" TEXT,
ADD COLUMN     "spacePreference" VARCHAR(32);

-- CreateIndex
CREATE INDEX "inquiries_organizationId_selectedEventPlanId_idx" ON "inquiries"("organizationId", "selectedEventPlanId");

-- CreateIndex
CREATE INDEX "inquiries_organizationId_customerSelectedAt_idx" ON "inquiries"("organizationId", "customerSelectedAt");

-- CreateTable
CREATE TABLE "event_plan_recommendations" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "inquiryId" TEXT NOT NULL,
    "tier" VARCHAR(32) NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "estimatedTotalCents" INTEGER,
    "currency" VARCHAR(3) NOT NULL,
    "guestCount" INTEGER,
    "durationMinutes" INTEGER,
    "customerFacingReason" VARCHAR(1000) NOT NULL,
    "availabilityValidated" BOOLEAN NOT NULL DEFAULT false,
    "availabilityNote" VARCHAR(500),
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_plan_recommendations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "event_plan_recommendations_organizationId_id_key" ON "event_plan_recommendations"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "event_plan_recommendations_organizationId_inquiryId_tier_key" ON "event_plan_recommendations"("organizationId", "inquiryId", "tier");

-- CreateIndex
CREATE INDEX "event_plan_recommendations_organizationId_inquiryId_idx" ON "event_plan_recommendations"("organizationId", "inquiryId");

-- AddForeignKey
ALTER TABLE "event_plan_recommendations" ADD CONSTRAINT "event_plan_recommendations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_plan_recommendations" ADD CONSTRAINT "event_plan_recommendations_organizationId_inquiryId_fkey" FOREIGN KEY ("organizationId", "inquiryId") REFERENCES "inquiries"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
