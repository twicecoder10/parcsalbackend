-- CreateEnum
CREATE TYPE "TravelItemRiskLevel" AS ENUM ('LOW', 'REVIEW', 'BLOCKED');

-- CreateEnum
CREATE TYPE "TravelCourierDisputeStatus" AS ENUM ('OPEN', 'IN_REVIEW', 'RESOLVED_FOR_CUSTOMER', 'RESOLVED_FOR_TRAVELLER', 'CLOSED');

-- CreateEnum
CREATE TYPE "TravelCourierDisputeReason" AS ENUM ('ITEM_NOT_RECEIVED', 'ITEM_DAMAGED', 'ITEM_MISSING', 'WRONG_ITEM', 'DELIVERY_DELAY', 'OTHER');

-- AlterTable: TravellerProfile - add rating fields
ALTER TABLE "TravellerProfile" ADD COLUMN "travellerRatingAvg" DOUBLE PRECISION;
ALTER TABLE "TravellerProfile" ADD COLUMN "travellerRatingCount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable: TravelCourierListing - add flight proof fields
ALTER TABLE "TravelCourierListing" ADD COLUMN "flightProofUrl" TEXT;
ALTER TABLE "TravelCourierListing" ADD COLUMN "flightProofVerified" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "TravelCourierListing" ADD COLUMN "flightProofVerifiedAt" TIMESTAMP(3);
ALTER TABLE "TravelCourierListing" ADD COLUMN "flightProofReviewedByAdminId" TEXT;
ALTER TABLE "TravelCourierListing" ADD COLUMN "flightProofRejectionReason" TEXT;

-- AlterTable: TravelCourierBooking - add restricted items fields
ALTER TABLE "TravelCourierBooking" ADD COLUMN "declaredContents" TEXT;
ALTER TABLE "TravelCourierBooking" ADD COLUMN "restrictedItemsAccepted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "TravelCourierBooking" ADD COLUMN "itemRiskLevel" "TravelItemRiskLevel" NOT NULL DEFAULT 'LOW';
ALTER TABLE "TravelCourierBooking" ADD COLUMN "riskFlags" JSONB;

-- CreateTable
CREATE TABLE "TravelCourierReview" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "travellerUserId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TravelCourierReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TravelCourierDispute" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "openedByUserId" TEXT NOT NULL,
    "reason" "TravelCourierDisputeReason" NOT NULL,
    "description" TEXT NOT NULL,
    "evidence" JSONB,
    "status" "TravelCourierDisputeStatus" NOT NULL DEFAULT 'OPEN',
    "adminNotes" TEXT,
    "resolutionNotes" TEXT,
    "travellerResponse" TEXT,
    "travellerEvidence" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TravelCourierDispute_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TravelCourierReview_bookingId_key" ON "TravelCourierReview"("bookingId");

-- CreateIndex
CREATE INDEX "TravelCourierReview_travellerUserId_idx" ON "TravelCourierReview"("travellerUserId");

-- CreateIndex
CREATE INDEX "TravelCourierReview_reviewerId_idx" ON "TravelCourierReview"("reviewerId");

-- CreateIndex
CREATE UNIQUE INDEX "TravelCourierDispute_bookingId_key" ON "TravelCourierDispute"("bookingId");

-- CreateIndex
CREATE INDEX "TravelCourierDispute_status_idx" ON "TravelCourierDispute"("status");

-- CreateIndex
CREATE INDEX "TravelCourierDispute_openedByUserId_idx" ON "TravelCourierDispute"("openedByUserId");

-- AddForeignKey
ALTER TABLE "TravelCourierReview" ADD CONSTRAINT "TravelCourierReview_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "TravelCourierBooking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TravelCourierDispute" ADD CONSTRAINT "TravelCourierDispute_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "TravelCourierBooking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
