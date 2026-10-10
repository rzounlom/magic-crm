-- Optional declared coverage for a catalog product. Existing products gain no rows.
CREATE TABLE "product_experience_grants" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "experienceKey" VARCHAR(80) NOT NULL,
    "kind" VARCHAR(24) NOT NULL,
    "durationMinutesPerParticipant" INTEGER,
    "sessionsPerParticipant" INTEGER,
    "servings" INTEGER,
    "participantRule" VARCHAR(24) NOT NULL DEFAULT 'ALL_GUESTS',
    "fixedParticipants" INTEGER,
    "creditCents" INTEGER,
    "simultaneousGuestCapacity" INTEGER,
    "rotationMinutesPerParticipant" INTEGER,
    "minAge" INTEGER,
    "minWeightLbs" INTEGER,
    "requiresParticipantBreakdown" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_experience_grants_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "product_experience_grants_organizationId_id_key" ON "product_experience_grants"("organizationId", "id");
CREATE UNIQUE INDEX "product_experience_grants_organizationId_productId_experienceKey_kind_key" ON "product_experience_grants"("organizationId", "productId", "experienceKey", "kind");
CREATE INDEX "product_experience_grants_organizationId_productId_idx" ON "product_experience_grants"("organizationId", "productId");

ALTER TABLE "product_experience_grants" ADD CONSTRAINT "product_experience_grants_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "product_experience_grants" ADD CONSTRAINT "product_experience_grants_organizationId_productId_fkey" FOREIGN KEY ("organizationId", "productId") REFERENCES "products"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
