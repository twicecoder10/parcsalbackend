-- AlterTable: Add Stripe Connect fields to TravellerProfile
ALTER TABLE "TravellerProfile" ADD COLUMN "stripeConnectAccountId" TEXT,
ADD COLUMN "stripeConnectStatus" TEXT NOT NULL DEFAULT 'NOT_STARTED',
ADD COLUMN "payoutsEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX "TravellerProfile_stripeConnectAccountId_key" ON "TravellerProfile"("stripeConnectAccountId");

-- AlterTable: Add payout transfer tracking to TravelCourierBooking
ALTER TABLE "TravelCourierBooking" ADD COLUMN "stripeTransferId" TEXT,
ADD COLUMN "payoutTransferAmountMinor" INTEGER,
ADD COLUMN "platformFeeMinor" INTEGER;
