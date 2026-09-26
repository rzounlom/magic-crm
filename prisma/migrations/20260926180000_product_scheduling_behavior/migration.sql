-- Tenant override for whether a catalog product is a timed activity, an overlapping space entitlement, or a non-scheduled add-on.
ALTER TABLE "products" ADD COLUMN "schedulingBehavior" VARCHAR(24);
