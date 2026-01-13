-- CreateEnum
CREATE TYPE "CarrierPlan" AS ENUM ('FREE', 'STARTER', 'PROFESSIONAL', 'ENTERPRISE');

-- CreateEnum
CREATE TYPE "CompanyRankingTier" AS ENUM ('STANDARD', 'PRIORITY', 'HIGHEST', 'CUSTOM');

-- CreateEnum
CREATE TYPE "CreditTxnType" AS ENUM ('TOPUP', 'GRANT', 'MONTHLY_ALLOCATION', 'SPEND', 'ADJUSTMENT');

-- AlterTable
ALTER TABLE "Company" ADD COLUMN "plan" "CarrierPlan" NOT NULL DEFAULT 'FREE';
ALTER TABLE "Company" ADD COLUMN "planActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Company" ADD COLUMN "planStartedAt" TIMESTAMP(3);
ALTER TABLE "Company" ADD COLUMN "planRenewsAt" TIMESTAMP(3);
ALTER TABLE "Company" ADD COLUMN "commissionRateBps" INTEGER;
ALTER TABLE "Company" ADD COLUMN "rankingTier" "CompanyRankingTier" NOT NULL DEFAULT 'STANDARD';

-- CreateTable
CREATE TABLE "CompanyUsage" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "marketingEmailsSent" INTEGER NOT NULL DEFAULT 0,
    "promoCreditsBalance" INTEGER NOT NULL DEFAULT 0,
    "promoCreditsUsed" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanyUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyCreditTransaction" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "type" "CreditTxnType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "reason" TEXT,
    "referenceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanyCreditTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CompanyUsage_companyId_key" ON "CompanyUsage"("companyId");

-- CreateIndex
CREATE INDEX "CompanyUsage_companyId_periodStart_idx" ON "CompanyUsage"("companyId", "periodStart");

-- CreateIndex
CREATE INDEX "CompanyCreditTransaction_companyId_createdAt_idx" ON "CompanyCreditTransaction"("companyId", "createdAt");

-- AddForeignKey
ALTER TABLE "CompanyUsage" ADD CONSTRAINT "CompanyUsage_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyCreditTransaction" ADD CONSTRAINT "CompanyCreditTransaction_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

