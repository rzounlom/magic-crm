-- Additive tenant declarations for package intake eligibility.
ALTER TABLE "products" ADD COLUMN "intakeDeclarations" JSONB;

ALTER TABLE "product_experience_grants" ADD COLUMN "optionalBenefit" BOOLEAN NOT NULL DEFAULT false;
