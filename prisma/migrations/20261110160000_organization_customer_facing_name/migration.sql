-- Optional customer-facing organization display name.
-- Internal name/slug remain unchanged for audit identity and routing.
ALTER TABLE "organizations"
ADD COLUMN IF NOT EXISTS "customerFacingName" VARCHAR(160);
