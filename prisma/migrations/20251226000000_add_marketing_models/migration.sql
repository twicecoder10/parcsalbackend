-- CreateEnum
CREATE TYPE "CampaignSenderType" AS ENUM ('ADMIN', 'COMPANY');

-- CreateEnum
CREATE TYPE "CampaignChannel" AS ENUM ('EMAIL', 'IN_APP', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'SENDING', 'SENT', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AudienceType" AS ENUM ('COMPANY_PAST_CUSTOMERS', 'PLATFORM_CUSTOMERS_ONLY', 'PLATFORM_COMPANIES_ONLY', 'PLATFORM_ALL_USERS');

-- CreateTable
CREATE TABLE "MarketingConsent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emailMarketingOptIn" BOOLEAN NOT NULL DEFAULT false,
    "whatsappMarketingOptIn" BOOLEAN NOT NULL DEFAULT false,
    "carrierMarketingOptIn" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketingConsent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketingCampaign" (
    "id" TEXT NOT NULL,
    "senderType" "CampaignSenderType" NOT NULL,
    "senderCompanyId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "audienceType" "AudienceType" NOT NULL,
    "channel" "CampaignChannel" NOT NULL,
    "subject" TEXT,
    "title" TEXT,
    "contentHtml" TEXT,
    "contentText" TEXT,
    "inAppBody" TEXT,
    "whatsappTemplateKey" TEXT,
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "scheduledAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "totalRecipients" INTEGER NOT NULL DEFAULT 0,
    "deliveredCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketingCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketingMessageLog" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "channel" "CampaignChannel" NOT NULL,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "providerMessageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "MarketingMessageLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MarketingConsent_userId_key" ON "MarketingConsent"("userId");

-- CreateIndex
CREATE INDEX "MarketingConsent_userId_idx" ON "MarketingConsent"("userId");

-- CreateIndex
CREATE INDEX "MarketingCampaign_senderType_senderCompanyId_idx" ON "MarketingCampaign"("senderType", "senderCompanyId");

-- CreateIndex
CREATE INDEX "MarketingCampaign_status_scheduledAt_idx" ON "MarketingCampaign"("status", "scheduledAt");

-- CreateIndex
CREATE INDEX "MarketingCampaign_createdByUserId_idx" ON "MarketingCampaign"("createdByUserId");

-- CreateIndex
CREATE INDEX "MarketingMessageLog_campaignId_idx" ON "MarketingMessageLog"("campaignId");

-- CreateIndex
CREATE INDEX "MarketingMessageLog_recipientId_idx" ON "MarketingMessageLog"("recipientId");

-- CreateIndex
CREATE INDEX "MarketingMessageLog_status_idx" ON "MarketingMessageLog"("status");

-- AddForeignKey
ALTER TABLE "MarketingConsent" ADD CONSTRAINT "MarketingConsent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingMessageLog" ADD CONSTRAINT "MarketingMessageLog_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "MarketingCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingMessageLog" ADD CONSTRAINT "MarketingMessageLog_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

