-- Confirmed Booking records, tenant booking numbers, and HOLD→BOOKED association.

CREATE TABLE "organization_booking_sequences" (
    "organizationId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "lastValue" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_booking_sequences_pkey" PRIMARY KEY ("organizationId","year")
);

CREATE TABLE "bookings" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "inquiryId" TEXT NOT NULL,
    "locationId" TEXT,
    "bookingNumber" VARCHAR(32) NOT NULL,
    "status" VARCHAR(24) NOT NULL,
    "eventDate" DATE NOT NULL,
    "startTime" VARCHAR(16) NOT NULL,
    "endTime" VARCHAR(16) NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,
    "guestCount" INTEGER NOT NULL,
    "eventType" VARCHAR(80),
    "eventGoal" VARCHAR(80),
    "diningLabel" VARCHAR(160),
    "subtotalCents" INTEGER NOT NULL,
    "taxCents" INTEGER NOT NULL DEFAULT 0,
    "totalCents" INTEGER NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "customerGroupName" VARCHAR(160),
    "customerFirstName" VARCHAR(80),
    "customerLastName" VARCHAR(80),
    "customerEmail" VARCHAR(254) NOT NULL,
    "customerPhone" VARCHAR(32),
    "customerNotes" VARCHAR(2000),
    "internalNotes" VARCHAR(4000),
    "confirmedByUserProfileId" TEXT NOT NULL,
    "confirmedAt" TIMESTAMP(3) NOT NULL,
    "selectedEventPlanId" TEXT,
    "agentWorkingPlanId" TEXT,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "bookings_organizationId_id_key" ON "bookings"("organizationId", "id");
CREATE UNIQUE INDEX "bookings_organizationId_inquiryId_key" ON "bookings"("organizationId", "inquiryId");
CREATE UNIQUE INDEX "bookings_organizationId_bookingNumber_key" ON "bookings"("organizationId", "bookingNumber");
CREATE INDEX "bookings_organizationId_eventDate_idx" ON "bookings"("organizationId", "eventDate");
CREATE INDEX "bookings_organizationId_status_eventDate_idx" ON "bookings"("organizationId", "status", "eventDate");

CREATE TABLE "booking_line_items" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "kind" VARCHAR(24) NOT NULL,
    "knowledgeItemId" TEXT,
    "name" VARCHAR(160) NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPriceCents" INTEGER NOT NULL,
    "totalCents" INTEGER NOT NULL,
    "startTime" VARCHAR(16),
    "endTime" VARCHAR(16),
    "sortOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "booking_line_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "booking_line_items_organizationId_id_key" ON "booking_line_items"("organizationId", "id");
CREATE INDEX "booking_line_items_organizationId_bookingId_idx" ON "booking_line_items"("organizationId", "bookingId");

CREATE INDEX "resource_reservations_organizationId_bookingId_idx" ON "resource_reservations"("organizationId", "bookingId");
CREATE INDEX "communication_events_organizationId_bookingId_idx" ON "communication_events"("organizationId", "bookingId");

ALTER TABLE "organization_booking_sequences" ADD CONSTRAINT "organization_booking_sequences_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "bookings" ADD CONSTRAINT "bookings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_organizationId_inquiryId_fkey" FOREIGN KEY ("organizationId", "inquiryId") REFERENCES "inquiries"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_organizationId_locationId_fkey" FOREIGN KEY ("organizationId", "locationId") REFERENCES "locations"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_organizationId_confirmedByUserProfileId_fkey" FOREIGN KEY ("organizationId", "confirmedByUserProfileId") REFERENCES "user_profiles"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "booking_line_items" ADD CONSTRAINT "booking_line_items_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "booking_line_items" ADD CONSTRAINT "booking_line_items_organizationId_bookingId_fkey" FOREIGN KEY ("organizationId", "bookingId") REFERENCES "bookings"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "resource_reservations" ADD CONSTRAINT "resource_reservations_org_booking_fkey" FOREIGN KEY ("organizationId", "bookingId") REFERENCES "bookings"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "communication_events" ADD CONSTRAINT "communication_events_org_booking_fkey" FOREIGN KEY ("organizationId", "bookingId") REFERENCES "bookings"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
