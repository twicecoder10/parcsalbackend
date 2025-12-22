-- CreateEnum
CREATE TYPE "ExtraChargeReason" AS ENUM ('EXCESS_WEIGHT', 'EXTRA_ITEMS', 'OVERSIZE', 'REPACKING', 'LATE_DROP_OFF', 'OTHER');

-- CreateEnum
CREATE TYPE "ExtraChargeStatus" AS ENUM ('PENDING', 'PAID', 'DECLINED', 'EXPIRED', 'CANCELLED');

-- CreateTable
CREATE TABLE "BookingExtraCharge" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "reason" "ExtraChargeReason" NOT NULL,
    "description" TEXT,
    "evidenceUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "baseAmount" INTEGER NOT NULL,
    "adminFeeAmount" INTEGER NOT NULL,
    "processingFeeAmount" INTEGER NOT NULL,
    "totalAmount" INTEGER NOT NULL,
    "status" "ExtraChargeStatus" NOT NULL DEFAULT 'PENDING',
    "stripeSessionId" TEXT,
    "stripePaymentIntentId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "declinedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookingExtraCharge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BookingExtraCharge_bookingId_idx" ON "BookingExtraCharge"("bookingId");

-- CreateIndex
CREATE INDEX "BookingExtraCharge_companyId_idx" ON "BookingExtraCharge"("companyId");

-- CreateIndex
CREATE INDEX "BookingExtraCharge_status_idx" ON "BookingExtraCharge"("status");

-- AddForeignKey
ALTER TABLE "BookingExtraCharge" ADD CONSTRAINT "BookingExtraCharge_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingExtraCharge" ADD CONSTRAINT "BookingExtraCharge_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingExtraCharge" ADD CONSTRAINT "BookingExtraCharge_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

