-- One automatic inquiry acknowledgment CommunicationEvent per inquiry.
-- Partial unique index: other communication kinds (e.g. employee quotes) may still create multiple rows.
CREATE UNIQUE INDEX IF NOT EXISTS "communication_events_inquiry_acknowledgment_unique"
ON "communication_events" ("organizationId", "inquiryId")
WHERE "kind" = 'INQUIRY_ACKNOWLEDGMENT' AND "inquiryId" IS NOT NULL;
