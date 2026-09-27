-- Canonical public-intake preferences. Nullable so existing inquiries stay readable.
ALTER TABLE "inquiries" ADD COLUMN "beveragePreference" VARCHAR(24);
ALTER TABLE "inquiries" ADD COLUMN "budgetPreference" VARCHAR(32);
