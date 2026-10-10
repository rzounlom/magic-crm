-- R2C.2 fail-closed tax engine foundation.
-- Additive only. Defaults keep tax calculation and collection disabled for all tenants.
-- Does not seed Generations rates, classifications, or activation.

CREATE TABLE "organization_tax_settings" (
    "organizationId" TEXT NOT NULL,
    "calculationEnabled" BOOLEAN NOT NULL DEFAULT false,
    "collectionEnabled" BOOLEAN NOT NULL DEFAULT false,
    "pricingMode" VARCHAR(24) NOT NULL DEFAULT 'TAX_EXCLUSIVE',
    "roundingMode" VARCHAR(32) NOT NULL DEFAULT 'HALF_UP_LINE',
    "approvedAt" TIMESTAMP(3),
    "approvedByNote" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_tax_settings_pkey" PRIMARY KEY ("organizationId")
);

CREATE TABLE "location_tax_profiles" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "streetLine1" VARCHAR(200),
    "streetLine2" VARCHAR(200),
    "city" VARCHAR(120),
    "region" VARCHAR(80),
    "postalCode" VARCHAR(32),
    "country" VARCHAR(2),
    "countyName" VARCHAR(120),
    "jurisdictionCode" VARCHAR(64),
    "jurisdictionResolved" BOOLEAN NOT NULL DEFAULT false,
    "taxTimeZone" VARCHAR(64),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "location_tax_profiles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "tax_rate_schedules" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "taxType" VARCHAR(32) NOT NULL,
    "jurisdictionCode" VARCHAR(64) NOT NULL,
    "rateBps" INTEGER NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "sourceUrl" VARCHAR(500),
    "sourceCitation" VARCHAR(500),
    "verificationStatus" VARCHAR(24) NOT NULL DEFAULT 'UNVERIFIED',
    "approvalStatus" VARCHAR(24) NOT NULL DEFAULT 'DRAFT',
    "active" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tax_rate_schedules_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "product_tax_classifications" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "componentKey" VARCHAR(40) NOT NULL DEFAULT '',
    "classification" VARCHAR(32) NOT NULL,
    "taxability" VARCHAR(24) NOT NULL DEFAULT 'UNRESOLVED',
    "effectiveFrom" DATE,
    "effectiveTo" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_tax_classifications_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "product_bundle_tax_policies" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "treatment" VARCHAR(32) NOT NULL DEFAULT 'UNRESOLVED',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_bundle_tax_policies_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "organization_tax_settings" ADD CONSTRAINT "organization_tax_settings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "location_tax_profiles" ADD CONSTRAINT "location_tax_profiles_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "location_tax_profiles" ADD CONSTRAINT "location_tax_profiles_organizationId_locationId_fkey" FOREIGN KEY ("organizationId", "locationId") REFERENCES "locations"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "tax_rate_schedules" ADD CONSTRAINT "tax_rate_schedules_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tax_rate_schedules" ADD CONSTRAINT "tax_rate_schedules_organizationId_locationId_fkey" FOREIGN KEY ("organizationId", "locationId") REFERENCES "locations"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "product_tax_classifications" ADD CONSTRAINT "product_tax_classifications_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "product_tax_classifications" ADD CONSTRAINT "product_tax_classifications_organizationId_productId_fkey" FOREIGN KEY ("organizationId", "productId") REFERENCES "products"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "product_bundle_tax_policies" ADD CONSTRAINT "product_bundle_tax_policies_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "product_bundle_tax_policies" ADD CONSTRAINT "product_bundle_tax_policies_organizationId_productId_fkey" FOREIGN KEY ("organizationId", "productId") REFERENCES "products"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "location_tax_profiles_organizationId_id_key" ON "location_tax_profiles"("organizationId", "id");
CREATE UNIQUE INDEX "location_tax_profiles_organizationId_locationId_key" ON "location_tax_profiles"("organizationId", "locationId");
CREATE INDEX "location_tax_profiles_organizationId_idx" ON "location_tax_profiles"("organizationId");

CREATE UNIQUE INDEX "tax_rate_schedules_organizationId_id_key" ON "tax_rate_schedules"("organizationId", "id");
CREATE INDEX "tax_rate_schedules_organizationId_locationId_taxType_jurisdic_idx" ON "tax_rate_schedules"("organizationId", "locationId", "taxType", "jurisdictionCode");
CREATE INDEX "tax_rate_schedules_organizationId_locationId_active_idx" ON "tax_rate_schedules"("organizationId", "locationId", "active");

CREATE UNIQUE INDEX "product_tax_classifications_organizationId_id_key" ON "product_tax_classifications"("organizationId", "id");
CREATE UNIQUE INDEX "product_tax_classifications_organizationId_productId_compone_key" ON "product_tax_classifications"("organizationId", "productId", "componentKey");
CREATE INDEX "product_tax_classifications_organizationId_productId_idx" ON "product_tax_classifications"("organizationId", "productId");

CREATE UNIQUE INDEX "product_bundle_tax_policies_organizationId_id_key" ON "product_bundle_tax_policies"("organizationId", "id");
CREATE UNIQUE INDEX "product_bundle_tax_policies_organizationId_productId_key" ON "product_bundle_tax_policies"("organizationId", "productId");
