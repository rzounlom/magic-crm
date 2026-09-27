-- Conceptual, tenant-scoped attraction interests. Existing Product and inquiry rows are unchanged.

CREATE TABLE "attraction_interests" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attraction_interests_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "attraction_interests_organizationId_id_key" ON "attraction_interests"("organizationId", "id");
CREATE UNIQUE INDEX "attraction_interests_organizationId_slug_key" ON "attraction_interests"("organizationId", "slug");
CREATE INDEX "attraction_interests_organizationId_active_displayOrder_idx" ON "attraction_interests"("organizationId", "active", "displayOrder");

ALTER TABLE "attraction_interests" ADD CONSTRAINT "attraction_interests_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "attraction_interest_products" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "attractionInterestId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attraction_interest_products_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "attraction_interest_products_organizationId_id_key" ON "attraction_interest_products"("organizationId", "id");
CREATE UNIQUE INDEX "attraction_interest_products_organizationId_attractionInterestId_productId_key" ON "attraction_interest_products"("organizationId", "attractionInterestId", "productId");
CREATE INDEX "attraction_interest_products_organizationId_productId_idx" ON "attraction_interest_products"("organizationId", "productId");

ALTER TABLE "attraction_interest_products" ADD CONSTRAINT "attraction_interest_products_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "attraction_interest_products" ADD CONSTRAINT "attraction_interest_products_organizationId_attractionInterestId_fkey" FOREIGN KEY ("organizationId", "attractionInterestId") REFERENCES "attraction_interests"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "attraction_interest_products" ADD CONSTRAINT "attraction_interest_products_organizationId_productId_fkey" FOREIGN KEY ("organizationId", "productId") REFERENCES "products"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
