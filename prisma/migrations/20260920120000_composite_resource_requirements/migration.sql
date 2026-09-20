-- Composite catalog requirements: optional exact Resource plus LOCATION_EXCLUSIVE / SPECIFIC_RESOURCE quantity rules.
-- quantityRule remains a varchar; new values are SPECIFIC_RESOURCE and LOCATION_EXCLUSIVE.

ALTER TABLE "product_resource_requirements" ADD COLUMN "resourceId" TEXT;

CREATE INDEX "product_resource_requirements_organizationId_resourceId_idx" ON "product_resource_requirements"("organizationId", "resourceId");

ALTER TABLE "product_resource_requirements" ADD CONSTRAINT "product_resource_requirements_organizationId_resourceId_fkey" FOREIGN KEY ("organizationId", "resourceId") REFERENCES "resources"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
