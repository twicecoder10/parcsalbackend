-- CreateEnum
CREATE TYPE "TravellerVerificationStatus" AS ENUM ('NOT_STARTED', 'PENDING', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "TravelCourierStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TravelBookingStatus" AS ENUM ('PENDING_APPROVAL', 'APPROVED_AWAITING_PAYMENT', 'CONFIRMED', 'IN_TRANSIT', 'DELIVERED_PENDING_CUSTOMER_CONFIRMATION', 'COMPLETED', 'REJECTED', 'CANCELLED', 'DISPUTED');

-- CreateTable
CREATE TABLE "TravellerProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "verificationStatus" "TravellerVerificationStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "idDocumentUrl" TEXT,
    "selfieUrl" TEXT,
    "flightTicketUrl" TEXT,
    "idVerified" BOOLEAN NOT NULL DEFAULT false,
    "flightVerified" BOOLEAN NOT NULL DEFAULT false,
    "reviewedByAdminId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TravellerProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TravelCourierListing" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "TravelCourierStatus" NOT NULL DEFAULT 'DRAFT',
    "originCity" TEXT NOT NULL,
    "originCountry" TEXT NOT NULL,
    "destinationCity" TEXT NOT NULL,
    "destinationCountry" TEXT NOT NULL,
    "departureDate" TIMESTAMP(3) NOT NULL,
    "arrivalDate" TIMESTAMP(3),
    "airlineName" TEXT,
    "flightReference" TEXT,
    "availableWeightKg" DOUBLE PRECISION NOT NULL,
    "remainingWeightKg" DOUBLE PRECISION NOT NULL,
    "pricePerKgMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'GBP',
    "notes" TEXT,
    "baggagePolicyNotes" TEXT,
    "cutoffDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TravelCourierListing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TravelCourierBooking" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "requestedWeightKg" DOUBLE PRECISION NOT NULL,
    "itemDescription" TEXT,
    "pickupNotes" TEXT,
    "deliveryNotes" TEXT,
    "baseAmountMinor" INTEGER NOT NULL,
    "adminFeeAmountMinor" INTEGER NOT NULL,
    "processingFeeMinor" INTEGER NOT NULL,
    "totalAmountMinor" INTEGER NOT NULL,
    "status" "TravelBookingStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "stripeCheckoutSessionId" TEXT,
    "stripePaymentIntentId" TEXT,
    "travellerConfirmedDelivered" BOOLEAN NOT NULL DEFAULT false,
    "customerConfirmedDelivered" BOOLEAN NOT NULL DEFAULT false,
    "deliveredAt" TIMESTAMP(3),
    "autoReleaseAt" TIMESTAMP(3),
    "disputeOpened" BOOLEAN NOT NULL DEFAULT false,
    "payoutReleased" BOOLEAN NOT NULL DEFAULT false,
    "payoutReleasedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TravelCourierBooking_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TravellerProfile_userId_key" ON "TravellerProfile"("userId");

-- CreateIndex
CREATE INDEX "TravelCourierListing_originCountry_destinationCountry_idx" ON "TravelCourierListing"("originCountry", "destinationCountry");

-- CreateIndex
CREATE INDEX "TravelCourierListing_status_departureDate_idx" ON "TravelCourierListing"("status", "departureDate");

-- CreateIndex
CREATE INDEX "TravelCourierBooking_listingId_idx" ON "TravelCourierBooking"("listingId");

-- CreateIndex
CREATE INDEX "TravelCourierBooking_customerId_idx" ON "TravelCourierBooking"("customerId");

-- AddForeignKey
ALTER TABLE "TravellerProfile" ADD CONSTRAINT "TravellerProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TravelCourierListing" ADD CONSTRAINT "TravelCourierListing_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TravelCourierBooking" ADD CONSTRAINT "TravelCourierBooking_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "TravelCourierListing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TravelCourierBooking" ADD CONSTRAINT "TravelCourierBooking_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
