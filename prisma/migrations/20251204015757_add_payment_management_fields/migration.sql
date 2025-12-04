-- AlterEnum
ALTER TYPE "PaymentTransactionStatus" ADD VALUE 'PARTIALLY_REFUNDED';

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "metadata" JSONB DEFAULT '{}',
ADD COLUMN     "paidAt" TIMESTAMP(3),
ADD COLUMN     "paymentMethod" TEXT,
ADD COLUMN     "refundReason" TEXT,
ADD COLUMN     "refundedAmount" DECIMAL(10,2) DEFAULT 0,
ADD COLUMN     "refundedAt" TIMESTAMP(3),
ADD COLUMN     "stripeChargeId" TEXT;

-- CreateIndex
CREATE INDEX "Payment_bookingId_idx" ON "Payment"("bookingId");

-- CreateIndex
CREATE INDEX "Payment_createdAt_idx" ON "Payment"("createdAt");
