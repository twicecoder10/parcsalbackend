-- Add restrictions column to User table
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "restrictions" JSONB DEFAULT '{}';

-- Migrate existing company-level restrictions to all staff members
-- This copies the company's staffRestrictions to each staff member's restrictions
UPDATE "User"
SET "restrictions" = COALESCE(
  (SELECT "staffRestrictions" FROM "Company" WHERE "Company"."id" = "User"."companyId"),
  '{}'::jsonb
)
WHERE "role" = 'COMPANY_STAFF' AND "companyId" IS NOT NULL;

-- Drop staffRestrictions from Company table
ALTER TABLE "Company" DROP COLUMN IF EXISTS "staffRestrictions";

