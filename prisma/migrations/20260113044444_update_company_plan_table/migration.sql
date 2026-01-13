-- AlterTable
ALTER TABLE "CompanyPlan" ADD COLUMN "carrierPlan" "CarrierPlan";

-- Update existing plans to link to CarrierPlan enum
UPDATE "CompanyPlan" SET "carrierPlan" = 'FREE' WHERE "name" = 'FREE';
UPDATE "CompanyPlan" SET "carrierPlan" = 'STARTER' WHERE "name" = 'STARTER';
UPDATE "CompanyPlan" SET "carrierPlan" = 'PROFESSIONAL' WHERE "name" = 'PROFESSIONAL';
UPDATE "CompanyPlan" SET "carrierPlan" = 'ENTERPRISE' WHERE "name" = 'ENTERPRISE';

-- CreateIndex
CREATE INDEX "CompanyPlan_carrierPlan_idx" ON "CompanyPlan"("carrierPlan");

