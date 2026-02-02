-- CreateEnum (with IF NOT EXISTS check)
DO $$ BEGIN
    CREATE TYPE "WhatsAppMessageDirection" AS ENUM ('OUTBOUND', 'INBOUND');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CreateEnum (with IF NOT EXISTS check)
DO $$ BEGIN
    CREATE TYPE "WhatsAppMessageStatus" AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'READ', 'FAILED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AlterTable (with IF NOT EXISTS check)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'User' AND column_name = 'notificationWhatsapp'
    ) THEN
        ALTER TABLE "User" ADD COLUMN "notificationWhatsapp" BOOLEAN NOT NULL DEFAULT false;
    END IF;
END $$;

-- CreateTable (with IF NOT EXISTS check)
CREATE TABLE IF NOT EXISTS "WhatsAppMessage" (
    "id" TEXT NOT NULL,
    "direction" "WhatsAppMessageDirection" NOT NULL DEFAULT 'OUTBOUND',
    "status" "WhatsAppMessageStatus" NOT NULL DEFAULT 'QUEUED',
    "toPhone" TEXT NOT NULL,
    "templateName" TEXT,
    "messageType" TEXT NOT NULL,
    "payload" JSONB,
    "providerMsgId" TEXT,
    "error" TEXT,
    "userId" TEXT,
    "companyId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (with IF NOT EXISTS check)
CREATE INDEX IF NOT EXISTS "WhatsAppMessage_providerMsgId_idx" ON "WhatsAppMessage"("providerMsgId");

-- CreateIndex (with IF NOT EXISTS check)
CREATE INDEX IF NOT EXISTS "WhatsAppMessage_companyId_createdAt_idx" ON "WhatsAppMessage"("companyId", "createdAt");

-- CreateIndex (with IF NOT EXISTS check)
CREATE INDEX IF NOT EXISTS "WhatsAppMessage_userId_createdAt_idx" ON "WhatsAppMessage"("userId", "createdAt");

-- AddForeignKey (with IF NOT EXISTS check)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'WhatsAppMessage_userId_fkey'
    ) THEN
        ALTER TABLE "WhatsAppMessage" ADD CONSTRAINT "WhatsAppMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey (with IF NOT EXISTS check)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'WhatsAppMessage_companyId_fkey'
    ) THEN
        ALTER TABLE "WhatsAppMessage" ADD CONSTRAINT "WhatsAppMessage_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
