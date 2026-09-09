-- Live Agent Booking Workspace: assignment timestamps, workflow stage, and a separate agent working plan.

ALTER TABLE "inquiries"
  ADD COLUMN "workflowStage" VARCHAR(32),
  ADD COLUMN "assignedAt" TIMESTAMP(3),
  ADD COLUMN "customerContactedAt" TIMESTAMP(3),
  ADD COLUMN "agentWorkingPlanId" TEXT,
  ADD COLUMN "readyToFinalizeAt" TIMESTAMP(3);

CREATE INDEX "inquiries_organizationId_workflowStage_idx" ON "inquiries"("organizationId", "workflowStage");

ALTER TABLE "event_plan_recommendations"
  ADD COLUMN "kind" VARCHAR(24) NOT NULL DEFAULT 'RECOMMENDATION';

DROP INDEX "event_plan_recommendations_organizationId_inquiryId_tier_key";

CREATE UNIQUE INDEX "event_plan_recommendations_org_inquiry_kind_tier_key"
  ON "event_plan_recommendations"("organizationId", "inquiryId", "kind", "tier");
