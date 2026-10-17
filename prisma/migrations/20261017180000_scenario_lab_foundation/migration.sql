-- Scenario Lab foundation: database environment identity sentinel + run ownership tables.
-- The identity sentinel row is never inserted by this migration. Provision only via the
-- explicit script against a known nonproduction database.

-- CreateTable
CREATE TABLE "database_environment_identity" (
    "id" TEXT NOT NULL,
    "kind" VARCHAR(64) NOT NULL,
    "token" VARCHAR(128) NOT NULL,
    "label" VARCHAR(80) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "database_environment_identity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scenario_lab_runs" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdByUserProfileId" TEXT NOT NULL,
    "templateKey" VARCHAR(80),
    "status" VARCHAR(32) NOT NULL DEFAULT 'initialized',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scenario_lab_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scenario_lab_owned_entities" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "entityType" VARCHAR(80) NOT NULL,
    "entityId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scenario_lab_owned_entities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "scenario_lab_runs_organizationId_id_key" ON "scenario_lab_runs"("organizationId", "id");

-- CreateIndex
CREATE INDEX "scenario_lab_runs_organizationId_createdAt_idx" ON "scenario_lab_runs"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "scenario_lab_runs_organizationId_status_idx" ON "scenario_lab_runs"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "scenario_lab_owned_entities_organizationId_entityType_entityId_key" ON "scenario_lab_owned_entities"("organizationId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "scenario_lab_owned_entities_organizationId_runId_idx" ON "scenario_lab_owned_entities"("organizationId", "runId");

-- AddForeignKey
ALTER TABLE "scenario_lab_runs" ADD CONSTRAINT "scenario_lab_runs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scenario_lab_runs" ADD CONSTRAINT "scenario_lab_runs_organizationId_createdByUserProfileId_fkey" FOREIGN KEY ("organizationId", "createdByUserProfileId") REFERENCES "user_profiles"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scenario_lab_owned_entities" ADD CONSTRAINT "scenario_lab_owned_entities_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scenario_lab_owned_entities" ADD CONSTRAINT "scenario_lab_owned_entities_organizationId_runId_fkey" FOREIGN KEY ("organizationId", "runId") REFERENCES "scenario_lab_runs"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
