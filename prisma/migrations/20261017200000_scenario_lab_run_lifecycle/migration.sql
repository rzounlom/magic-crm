-- LAB1-B: Scenario Lab run lifecycle, correlation, and fixture payload.

-- Delete any LAB1-A placeholder rows that lack required lifecycle fields.
DELETE FROM "scenario_lab_owned_entities";
DELETE FROM "scenario_lab_runs";

-- AlterTable
ALTER TABLE "scenario_lab_runs" ALTER COLUMN "templateKey" SET NOT NULL;

-- AlterTable
ALTER TABLE "scenario_lab_runs" ADD COLUMN "correlationToken" VARCHAR(64) NOT NULL;
ALTER TABLE "scenario_lab_runs" ADD COLUMN "idempotencyKey" VARCHAR(80) NOT NULL;
ALTER TABLE "scenario_lab_runs" ADD COLUMN "fixturePayload" JSONB;
ALTER TABLE "scenario_lab_runs" ADD COLUMN "failureMessage" VARCHAR(500);
ALTER TABLE "scenario_lab_runs" ADD COLUMN "publicIntakeOpenedAt" TIMESTAMP(3);
ALTER TABLE "scenario_lab_runs" ADD COLUMN "inquiryLinkedAt" TIMESTAMP(3);
ALTER TABLE "scenario_lab_runs" ADD COLUMN "timeline" JSONB NOT NULL DEFAULT '[]';

-- CreateIndex
CREATE UNIQUE INDEX "scenario_lab_runs_correlationToken_key" ON "scenario_lab_runs"("correlationToken");

-- CreateIndex
CREATE UNIQUE INDEX "scenario_lab_runs_organizationId_idempotencyKey_key" ON "scenario_lab_runs"("organizationId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "scenario_lab_runs_organizationId_templateKey_createdAt_idx" ON "scenario_lab_runs"("organizationId", "templateKey", "createdAt");
