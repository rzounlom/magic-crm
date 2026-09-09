-- Staff-facing resource management, Master Schedule, and plan-level availability status.

ALTER TABLE "event_plan_recommendations"
  ADD COLUMN "availabilityStatus" VARCHAR(32) NOT NULL DEFAULT 'NOT_VALIDATED',
  ADD COLUMN "availabilityCheckedAt" TIMESTAMP(3);
