-- AlterTable
ALTER TABLE "TravelCourierDispute" ADD COLUMN "refundType" TEXT,
ADD COLUMN "refundAmountMinor" INTEGER,
ADD COLUMN "refundedAmountMinor" INTEGER,
ADD COLUMN "stripeRefundId" TEXT,
ADD COLUMN "refundedAt" TIMESTAMP(3);
