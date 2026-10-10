-- R2D.2 operating-hours guardrails.
-- Additive only. Does not seed any tenant hours (including Generations).
-- Absence / UNCONFIGURED is not verified open.

CREATE TABLE "location_operating_hours_policies" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "verificationStatus" VARCHAR(24) NOT NULL DEFAULT 'UNCONFIGURED',
    "approvedAt" TIMESTAMP(3),
    "approvedByNote" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "location_operating_hours_policies_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "location_operating_hours_windows" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "location_operating_hours_windows_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "location_operating_hours_exceptions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "localDate" DATE NOT NULL,
    "kind" VARCHAR(16) NOT NULL,
    "startMinute" INTEGER,
    "endMinute" INTEGER,
    "note" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "location_operating_hours_exceptions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "location_operating_hours_policies_organizationId_id_key" ON "location_operating_hours_policies"("organizationId", "id");
CREATE UNIQUE INDEX "location_operating_hours_policies_organizationId_locationId_key" ON "location_operating_hours_policies"("organizationId", "locationId");
CREATE INDEX "location_operating_hours_policies_organizationId_idx" ON "location_operating_hours_policies"("organizationId");

CREATE UNIQUE INDEX "location_operating_hours_windows_organizationId_id_key" ON "location_operating_hours_windows"("organizationId", "id");
CREATE INDEX "location_operating_hours_windows_organizationId_locationId_dayOfWeek_idx" ON "location_operating_hours_windows"("organizationId", "locationId", "dayOfWeek");
CREATE INDEX "location_operating_hours_windows_organizationId_policyId_idx" ON "location_operating_hours_windows"("organizationId", "policyId");

CREATE UNIQUE INDEX "location_operating_hours_exceptions_organizationId_id_key" ON "location_operating_hours_exceptions"("organizationId", "id");
CREATE INDEX "location_operating_hours_exceptions_organizationId_locationId_localDate_idx" ON "location_operating_hours_exceptions"("organizationId", "locationId", "localDate");
CREATE INDEX "location_operating_hours_exceptions_organizationId_policyId_idx" ON "location_operating_hours_exceptions"("organizationId", "policyId");

ALTER TABLE "location_operating_hours_policies" ADD CONSTRAINT "location_operating_hours_policies_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "location_operating_hours_policies" ADD CONSTRAINT "location_operating_hours_policies_organizationId_locationId_fkey" FOREIGN KEY ("organizationId", "locationId") REFERENCES "locations"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "location_operating_hours_windows" ADD CONSTRAINT "location_operating_hours_windows_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "location_operating_hours_windows" ADD CONSTRAINT "location_operating_hours_windows_organizationId_locationId_fkey" FOREIGN KEY ("organizationId", "locationId") REFERENCES "locations"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "location_operating_hours_windows" ADD CONSTRAINT "location_operating_hours_windows_organizationId_policyId_fkey" FOREIGN KEY ("organizationId", "policyId") REFERENCES "location_operating_hours_policies"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "location_operating_hours_exceptions" ADD CONSTRAINT "location_operating_hours_exceptions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "location_operating_hours_exceptions" ADD CONSTRAINT "location_operating_hours_exceptions_organizationId_locationId_fkey" FOREIGN KEY ("organizationId", "locationId") REFERENCES "locations"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "location_operating_hours_exceptions" ADD CONSTRAINT "location_operating_hours_exceptions_organizationId_policyId_fkey" FOREIGN KEY ("organizationId", "policyId") REFERENCES "location_operating_hours_policies"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
