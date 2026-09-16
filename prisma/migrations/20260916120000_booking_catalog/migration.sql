-- Tenant catalog, recommendation profiles, and inquiry commercial lifecycle fields.

ALTER TABLE "inquiries" ADD COLUMN "salesStage" VARCHAR(32);
ALTER TABLE "inquiries" ADD COLUMN "audience" VARCHAR(24);
ALTER TABLE "inquiries" ADD COLUMN "attractionMode" VARCHAR(16);

CREATE INDEX "inquiries_organizationId_salesStage_idx" ON "inquiries"("organizationId", "salesStage");

CREATE TABLE "product_categories" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "slug" VARCHAR(80) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_categories_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "product_categories_organizationId_id_key" ON "product_categories"("organizationId", "id");
CREATE UNIQUE INDEX "product_categories_organizationId_slug_key" ON "product_categories"("organizationId", "slug");
CREATE INDEX "product_categories_organizationId_idx" ON "product_categories"("organizationId");

ALTER TABLE "product_categories" ADD CONSTRAINT "product_categories_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "locationId" TEXT,
    "categoryId" TEXT NOT NULL,
    "slug" VARCHAR(80) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "kind" VARCHAR(24) NOT NULL,
    "audience" VARCHAR(24) NOT NULL,
    "shortDescription" VARCHAR(500),
    "durationMinutes" INTEGER,
    "minGuests" INTEGER,
    "maxGuests" INTEGER,
    "weekendOnly" BOOLEAN NOT NULL DEFAULT false,
    "fulfillmentGroup" VARCHAR(80),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "products_organizationId_id_key" ON "products"("organizationId", "id");
CREATE UNIQUE INDEX "products_organizationId_slug_key" ON "products"("organizationId", "slug");
CREATE INDEX "products_organizationId_categoryId_idx" ON "products"("organizationId", "categoryId");
CREATE INDEX "products_organizationId_active_kind_idx" ON "products"("organizationId", "active", "kind");

ALTER TABLE "products" ADD CONSTRAINT "products_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "products" ADD CONSTRAINT "products_organizationId_locationId_fkey" FOREIGN KEY ("organizationId", "locationId") REFERENCES "locations"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "products" ADD CONSTRAINT "products_organizationId_categoryId_fkey" FOREIGN KEY ("organizationId", "categoryId") REFERENCES "product_categories"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "product_prices" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "strategy" VARCHAR(48) NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "additionalGuestCents" INTEGER,
    "includedGuests" INTEGER,
    "includedHours" INTEGER,
    "additionalHourCents" INTEGER,
    "minGuests" INTEGER,
    "weekdayAmountCents" INTEGER,
    "weekendAmountCents" INTEGER,
    "daysOfWeek" JSONB,
    "afterHour" INTEGER,
    "afterHourAmountCents" INTEGER,
    "shoeAddOnCents" INTEGER,
    "unitLabel" VARCHAR(40),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_prices_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "product_prices_organizationId_id_key" ON "product_prices"("organizationId", "id");
CREATE INDEX "product_prices_organizationId_productId_idx" ON "product_prices"("organizationId", "productId");

ALTER TABLE "product_prices" ADD CONSTRAINT "product_prices_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "product_prices" ADD CONSTRAINT "product_prices_organizationId_productId_fkey" FOREIGN KEY ("organizationId", "productId") REFERENCES "products"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "product_resource_requirements" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "resourceTypeId" TEXT NOT NULL,
    "quantityRule" VARCHAR(24) NOT NULL,
    "quantity" INTEGER,
    "guestsPerUnit" INTEGER,
    "durationMinutes" INTEGER,
    "exclusive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_resource_requirements_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "product_resource_requirements_organizationId_id_key" ON "product_resource_requirements"("organizationId", "id");
CREATE UNIQUE INDEX "product_resource_requirements_organizationId_productId_resourceTypeId_key" ON "product_resource_requirements"("organizationId", "productId", "resourceTypeId");
CREATE INDEX "product_resource_requirements_organizationId_resourceTypeId_idx" ON "product_resource_requirements"("organizationId", "resourceTypeId");

ALTER TABLE "product_resource_requirements" ADD CONSTRAINT "product_resource_requirements_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "product_resource_requirements" ADD CONSTRAINT "product_resource_requirements_organizationId_productId_fkey" FOREIGN KEY ("organizationId", "productId") REFERENCES "products"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "product_resource_requirements" ADD CONSTRAINT "product_resource_requirements_organizationId_resourceTypeId_fkey" FOREIGN KEY ("organizationId", "resourceTypeId") REFERENCES "resource_types"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "product_servings" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "servesMin" INTEGER NOT NULL,
    "servesMax" INTEGER NOT NULL,
    "unitCount" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_servings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "product_servings_organizationId_id_key" ON "product_servings"("organizationId", "id");
CREATE UNIQUE INDEX "product_servings_organizationId_productId_key" ON "product_servings"("organizationId", "productId");

ALTER TABLE "product_servings" ADD CONSTRAINT "product_servings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "product_servings" ADD CONSTRAINT "product_servings_organizationId_productId_fkey" FOREIGN KEY ("organizationId", "productId") REFERENCES "products"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "recommendation_profiles" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "audience" VARCHAR(24) NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recommendation_profiles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "recommendation_profiles_organizationId_id_key" ON "recommendation_profiles"("organizationId", "id");
CREATE UNIQUE INDEX "recommendation_profiles_organizationId_audience_key" ON "recommendation_profiles"("organizationId", "audience");

ALTER TABLE "recommendation_profiles" ADD CONSTRAINT "recommendation_profiles_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
