-- Per-employee inquiry acknowledgement. One row means that employee opened that inquiry.
-- Other employees are unaffected. The inquiry list does not insert rows.

CREATE TABLE "inquiry_seen" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userProfileId" TEXT NOT NULL,
    "inquiryId" TEXT NOT NULL,
    "seenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inquiry_seen_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "inquiry_seen_organizationId_id_key" ON "inquiry_seen"("organizationId", "id");

CREATE UNIQUE INDEX "inquiry_seen_organizationId_userProfileId_inquiryId_key" ON "inquiry_seen"("organizationId", "userProfileId", "inquiryId");

CREATE INDEX "inquiry_seen_organizationId_userProfileId_idx" ON "inquiry_seen"("organizationId", "userProfileId");

CREATE INDEX "inquiry_seen_inquiryId_idx" ON "inquiry_seen"("inquiryId");

CREATE INDEX "inquiries_organizationId_archivedAt_createdAt_idx" ON "inquiries"("organizationId", "archivedAt", "createdAt");

ALTER TABLE "inquiry_seen" ADD CONSTRAINT "inquiry_seen_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "inquiry_seen" ADD CONSTRAINT "inquiry_seen_organizationId_userProfileId_fkey" FOREIGN KEY ("organizationId", "userProfileId") REFERENCES "user_profiles"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "inquiry_seen" ADD CONSTRAINT "inquiry_seen_organizationId_inquiryId_fkey" FOREIGN KEY ("organizationId", "inquiryId") REFERENCES "inquiries"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
