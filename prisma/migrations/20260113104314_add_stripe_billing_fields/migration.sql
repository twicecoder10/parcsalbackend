-- AlterTable: Add columns only if they don't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Company' AND column_name = 'stripeCustomerId') THEN
        ALTER TABLE "Company" ADD COLUMN "stripeCustomerId" TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Company' AND column_name = 'stripeSubscriptionId') THEN
        ALTER TABLE "Company" ADD COLUMN "stripeSubscriptionId" TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Company' AND column_name = 'stripeCurrentPeriodStart') THEN
        ALTER TABLE "Company" ADD COLUMN "stripeCurrentPeriodStart" TIMESTAMP(3);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Company' AND column_name = 'stripeCurrentPeriodEnd') THEN
        ALTER TABLE "Company" ADD COLUMN "stripeCurrentPeriodEnd" TIMESTAMP(3);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Company' AND column_name = 'stripeCancelAtPeriodEnd') THEN
        ALTER TABLE "Company" ADD COLUMN "stripeCancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false;
    END IF;
END $$;

-- AlterTable: Update planActive default (safe to run multiple times)
ALTER TABLE "Company" ALTER COLUMN "planActive" SET DEFAULT false;

-- CreateIndex: Only create if they don't exist
-- Note: PostgreSQL allows multiple NULLs in unique indexes, so we don't need WHERE clause
-- But we use IF NOT EXISTS to avoid errors if index already exists
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'Company_stripeCustomerId_key') THEN
CREATE UNIQUE INDEX "Company_stripeCustomerId_key" ON "Company"("stripeCustomerId");
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'Company_stripeSubscriptionId_key') THEN
CREATE UNIQUE INDEX "Company_stripeSubscriptionId_key" ON "Company"("stripeSubscriptionId");
    END IF;
END $$;

-- CreateTable: Only create if it doesn't exist
CREATE TABLE IF NOT EXISTS "StripeEvent" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payload" JSONB,

    CONSTRAINT "StripeEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: Only create if they don't exist
CREATE INDEX IF NOT EXISTS "StripeEvent_type_idx" ON "StripeEvent"("type");

CREATE INDEX IF NOT EXISTS "StripeEvent_createdAt_idx" ON "StripeEvent"("createdAt");

