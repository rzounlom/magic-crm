-- Additive weekend-day policy on product prices and tenant promotion rules.
ALTER TABLE "product_prices" ADD COLUMN "weekendDays" JSONB;

CREATE TABLE "pricing_promotions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "locationId" TEXT,
    "slug" VARCHAR(80) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "type" VARCHAR(32) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "stackable" BOOLEAN NOT NULL DEFAULT false,
    "stackingGroup" VARCHAR(80),
    "priority" INTEGER NOT NULL DEFAULT 100,
    "allowsFurtherDiscount" BOOLEAN NOT NULL DEFAULT false,
    "productSlugs" JSONB,
    "categorySlugs" JSONB,
    "daysOfWeek" JSONB,
    "localStartMinute" INTEGER,
    "localEndMinute" INTEGER,
    "effectiveFrom" DATE,
    "effectiveTo" DATE,
    "minQuantity" INTEGER,
    "maxQuantity" INTEGER,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pricing_promotions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "pricing_promotions_organizationId_id_key" ON "pricing_promotions"("organizationId", "id");
CREATE UNIQUE INDEX "pricing_promotions_organizationId_slug_key" ON "pricing_promotions"("organizationId", "slug");
CREATE INDEX "pricing_promotions_organizationId_active_idx" ON "pricing_promotions"("organizationId", "active");

ALTER TABLE "pricing_promotions" ADD CONSTRAINT "pricing_promotions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pricing_promotions" ADD CONSTRAINT "pricing_promotions_organizationId_locationId_fkey" FOREIGN KEY ("organizationId", "locationId") REFERENCES "locations"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
