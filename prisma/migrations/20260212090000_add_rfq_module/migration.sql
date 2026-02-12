-- CreateEnum
CREATE TYPE "ShipmentRequestStatus" AS ENUM ('OPEN', 'QUOTED', 'ACCEPTED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "RequestQuoteStatus" AS ENUM ('PENDING', 'AWAITING_PAYMENT', 'ACCEPTED', 'REJECTED', 'EXPIRED');

-- CreateTable
CREATE TABLE "ShipmentRequest" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "originCity" TEXT NOT NULL,
    "originCountry" TEXT NOT NULL,
    "destinationCity" TEXT NOT NULL,
    "destinationCountry" TEXT NOT NULL,
    "weightKg" DOUBLE PRECISION,
    "itemsCount" INTEGER,
    "preferredMode" "ShipmentMode",
    "description" TEXT,
    "targetDate" TIMESTAMP(3),
    "status" "ShipmentRequestStatus" NOT NULL DEFAULT 'OPEN',
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShipmentRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequestQuote" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "priceMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'GBP',
    "estimatedDays" INTEGER NOT NULL,
    "note" TEXT,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "status" "RequestQuoteStatus" NOT NULL DEFAULT 'PENDING',
    "stripeSessionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RequestQuote_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Booking"
ADD COLUMN "shipmentRequestId" TEXT,
ADD COLUMN "requestQuoteId" TEXT;

-- CreateIndex
CREATE INDEX "ShipmentRequest_status_createdAt_idx" ON "ShipmentRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "RequestQuote_requestId_companyId_idx" ON "RequestQuote"("requestId", "companyId");

-- CreateIndex
CREATE UNIQUE INDEX "RequestQuote_requestId_companyId_key" ON "RequestQuote"("requestId", "companyId");

-- CreateIndex
CREATE INDEX "Booking_shipmentRequestId_idx" ON "Booking"("shipmentRequestId");

-- CreateIndex
CREATE INDEX "Booking_requestQuoteId_idx" ON "Booking"("requestQuoteId");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_requestQuoteId_key" ON "Booking"("requestQuoteId");

-- AddForeignKey
ALTER TABLE "ShipmentRequest" ADD CONSTRAINT "ShipmentRequest_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestQuote" ADD CONSTRAINT "RequestQuote_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ShipmentRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestQuote" ADD CONSTRAINT "RequestQuote_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_shipmentRequestId_fkey" FOREIGN KEY ("shipmentRequestId") REFERENCES "ShipmentRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_requestQuoteId_fkey" FOREIGN KEY ("requestQuoteId") REFERENCES "RequestQuote"("id") ON DELETE SET NULL ON UPDATE CASCADE;
