-- CreateTable
CREATE TABLE "inquiries" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "locationId" TEXT,
    "status" VARCHAR(32) NOT NULL,
    "source" VARCHAR(32) NOT NULL,
    "customerFirstName" VARCHAR(80),
    "customerLastName" VARCHAR(80),
    "customerEmail" VARCHAR(254) NOT NULL,
    "customerEmailNormalized" VARCHAR(254) NOT NULL,
    "customerPhone" VARCHAR(32),
    "eventType" VARCHAR(80),
    "desiredDate" DATE,
    "desiredStartTime" VARCHAR(16),
    "guestCount" INTEGER,
    "childGuestCount" INTEGER,
    "adultGuestCount" INTEGER,
    "budgetMin" INTEGER,
    "budgetMax" INTEGER,
    "occasion" VARCHAR(120),
    "customerNotes" VARCHAR(2000),
    "internalSummary" VARCHAR(4000),
    "employeeInternalNotes" VARCHAR(4000),
    "assignedUserProfileId" TEXT,
    "aiHandlingEnabled" BOOLEAN NOT NULL DEFAULT true,
    "humanHandoffRequestedAt" TIMESTAMP(3),
    "humanHandoffReason" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inquiries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "inquiryId" TEXT NOT NULL,
    "channel" VARCHAR(16) NOT NULL,
    "publicTokenHash" TEXT NOT NULL,
    "lastMessageAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_messages" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "direction" VARCHAR(16) NOT NULL,
    "senderType" VARCHAR(16) NOT NULL,
    "content" VARCHAR(8000) NOT NULL,
    "clientSubmissionId" VARCHAR(80),
    "aiModel" VARCHAR(80),
    "aiResponseId" VARCHAR(120),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversation_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_knowledge_items" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "locationId" TEXT,
    "type" VARCHAR(32) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "shortDescription" VARCHAR(280) NOT NULL,
    "details" VARCHAR(4000) NOT NULL,
    "priceText" VARCHAR(160),
    "durationMinutes" INTEGER,
    "minGuests" INTEGER,
    "maxGuests" INTEGER,
    "waiverRequired" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "salesNotes" VARCHAR(2000),
    "customerFacingNotes" VARCHAR(2000),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_knowledge_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_usage" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "inquiryId" TEXT,
    "conversationId" TEXT,
    "model" VARCHAR(80) NOT NULL,
    "responseId" VARCHAR(120),
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "totalTokens" INTEGER,
    "latencyMs" INTEGER,
    "success" BOOLEAN NOT NULL,
    "errorCode" VARCHAR(80),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_usage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "inquiries_organizationId_id_key" ON "inquiries"("organizationId", "id");

-- CreateIndex
CREATE INDEX "inquiries_organizationId_status_createdAt_idx" ON "inquiries"("organizationId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "inquiries_organizationId_customerEmailNormalized_idx" ON "inquiries"("organizationId", "customerEmailNormalized");

-- CreateIndex
CREATE UNIQUE INDEX "conversations_publicTokenHash_key" ON "conversations"("publicTokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "conversations_organizationId_id_key" ON "conversations"("organizationId", "id");

-- CreateIndex
CREATE INDEX "conversations_organizationId_inquiryId_idx" ON "conversations"("organizationId", "inquiryId");

-- CreateIndex
CREATE UNIQUE INDEX "conversation_messages_organizationId_id_key" ON "conversation_messages"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "conversation_messages_conversationId_clientSubmissionId_key" ON "conversation_messages"("conversationId", "clientSubmissionId");

-- CreateIndex
CREATE INDEX "conversation_messages_organizationId_conversationId_created_idx" ON "conversation_messages"("organizationId", "conversationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "sales_knowledge_items_organizationId_id_key" ON "sales_knowledge_items"("organizationId", "id");

-- CreateIndex
CREATE INDEX "sales_knowledge_items_organizationId_active_type_idx" ON "sales_knowledge_items"("organizationId", "active", "type");

-- CreateIndex
CREATE INDEX "ai_usage_organizationId_createdAt_idx" ON "ai_usage"("organizationId", "createdAt");

-- AddForeignKey
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Same-tenant optional location.
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_organizationId_locationId_fkey" FOREIGN KEY ("organizationId", "locationId") REFERENCES "locations"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Same-tenant optional assignee.
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_organizationId_assignedUserProfileId_fkey" FOREIGN KEY ("organizationId", "assignedUserProfileId") REFERENCES "user_profiles"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Same-tenant inquiry.
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_organizationId_inquiryId_fkey" FOREIGN KEY ("organizationId", "inquiryId") REFERENCES "inquiries"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Same-tenant conversation. Cascade only the thread, not the inquiry.
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_organizationId_conversationId_fkey" FOREIGN KEY ("organizationId", "conversationId") REFERENCES "conversations"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_knowledge_items" ADD CONSTRAINT "sales_knowledge_items_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "sales_knowledge_items" ADD CONSTRAINT "sales_knowledge_items_organizationId_locationId_fkey" FOREIGN KEY ("organizationId", "locationId") REFERENCES "locations"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_organizationId_inquiryId_fkey" FOREIGN KEY ("organizationId", "inquiryId") REFERENCES "inquiries"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
