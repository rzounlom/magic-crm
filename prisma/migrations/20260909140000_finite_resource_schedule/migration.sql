-- Finite-resource schedule groundwork plus a generalized outbound communication log.
-- AVAILABLE is not stored; HOLD and BOOKED occupy resources. Individual resource counts are tenant data.

CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE "resource_types" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "locationId" TEXT,
    "name" VARCHAR(120) NOT NULL,
    "slug" VARCHAR(80) NOT NULL,
    "schedulingMode" VARCHAR(24) NOT NULL DEFAULT 'SLOTTED',
    "slotMinutes" INTEGER NOT NULL DEFAULT 30,
    "defaultDurationMinutes" INTEGER,
    "bufferBeforeMinutes" INTEGER NOT NULL DEFAULT 0,
    "bufferAfterMinutes" INTEGER NOT NULL DEFAULT 0,
    "inventoryConfigured" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "resource_types_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "resource_types_organizationId_id_key" ON "resource_types"("organizationId", "id");
CREATE UNIQUE INDEX "resource_types_organizationId_slug_key" ON "resource_types"("organizationId", "slug");
CREATE INDEX "resource_types_organizationId_active_idx" ON "resource_types"("organizationId", "active");

ALTER TABLE "resource_types" ADD CONSTRAINT "resource_types_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "resource_types" ADD CONSTRAINT "resource_types_organizationId_locationId_fkey" FOREIGN KEY ("organizationId", "locationId") REFERENCES "locations"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "resources" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "resourceTypeId" TEXT NOT NULL,
    "locationId" TEXT,
    "name" VARCHAR(120) NOT NULL,
    "displayOrder" INTEGER NOT NULL,
    "capacity" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "resources_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "resources_organizationId_id_key" ON "resources"("organizationId", "id");
CREATE UNIQUE INDEX "resources_organizationId_resourceTypeId_displayOrder_key" ON "resources"("organizationId", "resourceTypeId", "displayOrder");
CREATE INDEX "resources_organizationId_resourceTypeId_active_idx" ON "resources"("organizationId", "resourceTypeId", "active");

ALTER TABLE "resources" ADD CONSTRAINT "resources_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "resources" ADD CONSTRAINT "resources_organizationId_resourceTypeId_fkey" FOREIGN KEY ("organizationId", "resourceTypeId") REFERENCES "resource_types"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "resources" ADD CONSTRAINT "resources_organizationId_locationId_fkey" FOREIGN KEY ("organizationId", "locationId") REFERENCES "locations"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "knowledge_resource_requirements" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "salesKnowledgeItemId" TEXT NOT NULL,
    "resourceTypeId" TEXT NOT NULL,
    "quantityRule" VARCHAR(24) NOT NULL,
    "quantity" INTEGER,
    "guestsPerUnit" INTEGER,
    "durationMinutes" INTEGER,
    "requiresStaffConfiguration" BOOLEAN NOT NULL DEFAULT false,
    "notes" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "knowledge_resource_requirements_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "knowledge_resource_requirements_organizationId_id_key" ON "knowledge_resource_requirements"("organizationId", "id");
CREATE UNIQUE INDEX "knowledge_resource_requirements_org_item_type_key" ON "knowledge_resource_requirements"("organizationId", "salesKnowledgeItemId", "resourceTypeId");
CREATE INDEX "knowledge_resource_requirements_organizationId_resourceTypeId_idx" ON "knowledge_resource_requirements"("organizationId", "resourceTypeId");

ALTER TABLE "knowledge_resource_requirements" ADD CONSTRAINT "knowledge_resource_requirements_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "knowledge_resource_requirements" ADD CONSTRAINT "knowledge_resource_requirements_org_item_fkey" FOREIGN KEY ("organizationId", "salesKnowledgeItemId") REFERENCES "sales_knowledge_items"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "knowledge_resource_requirements" ADD CONSTRAINT "knowledge_resource_requirements_org_type_fkey" FOREIGN KEY ("organizationId", "resourceTypeId") REFERENCES "resource_types"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "resource_reservations" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "status" VARCHAR(16) NOT NULL,
    "slotDate" DATE NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,
    "inquiryId" TEXT,
    "bookingId" TEXT,
    "sourceType" VARCHAR(24) NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "reason" VARCHAR(240),
    "createdByUserProfileId" TEXT,
    "releasedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "resource_reservations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "resource_reservations_organizationId_id_key" ON "resource_reservations"("organizationId", "id");
CREATE INDEX "resource_reservations_organizationId_resourceId_slotDate_idx" ON "resource_reservations"("organizationId", "resourceId", "slotDate");
CREATE INDEX "resource_reservations_organizationId_inquiryId_idx" ON "resource_reservations"("organizationId", "inquiryId");
CREATE INDEX "resource_reservations_organizationId_status_releasedAt_idx" ON "resource_reservations"("organizationId", "status", "releasedAt");

ALTER TABLE "resource_reservations" ADD CONSTRAINT "resource_reservations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "resource_reservations" ADD CONSTRAINT "resource_reservations_org_resource_fkey" FOREIGN KEY ("organizationId", "resourceId") REFERENCES "resources"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "resource_reservations" ADD CONSTRAINT "resource_reservations_org_inquiry_fkey" FOREIGN KEY ("organizationId", "inquiryId") REFERENCES "inquiries"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "resource_reservations" ADD CONSTRAINT "resource_reservations_org_createdBy_fkey" FOREIGN KEY ("organizationId", "createdByUserProfileId") REFERENCES "user_profiles"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "resource_reservations"
  ADD CONSTRAINT "resource_reservations_no_overlap"
  EXCLUDE USING gist (
    "resourceId" WITH =,
    "slotDate" WITH =,
    int4range("startMinute", "endMinute", '[)') WITH &&
  )
  WHERE ("releasedAt" IS NULL AND "status" IN ('HOLD', 'BOOKED'));

CREATE TABLE "communication_events" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "channel" VARCHAR(16) NOT NULL,
    "kind" VARCHAR(64) NOT NULL,
    "status" VARCHAR(24) NOT NULL,
    "skipReason" VARCHAR(80),
    "toAddress" VARCHAR(254),
    "subject" VARCHAR(200),
    "inquiryId" TEXT,
    "bookingId" TEXT,
    "providerMessageId" VARCHAR(160),
    "payload" JSONB,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "communication_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "communication_events_organizationId_createdAt_idx" ON "communication_events"("organizationId", "createdAt");
CREATE INDEX "communication_events_organizationId_inquiryId_idx" ON "communication_events"("organizationId", "inquiryId");
CREATE INDEX "communication_events_organizationId_kind_status_idx" ON "communication_events"("organizationId", "kind", "status");

ALTER TABLE "communication_events" ADD CONSTRAINT "communication_events_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "communication_events" ADD CONSTRAINT "communication_events_org_inquiry_fkey" FOREIGN KEY ("organizationId", "inquiryId") REFERENCES "inquiries"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
