-- CreateEnum
CREATE TYPE "BookingTrackingStatus" AS ENUM (
  'BOOKED',
  'ITEM_RECEIVED',
  'PACKED',
  'READY_FOR_DISPATCH',
  'IN_TRANSIT',
  'ARRIVED_AT_DESTINATION',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'DELAYED',
  'CUSTOMS_HOLD',
  'CUSTOMS_CLEARED',
  'DELIVERY_FAILED',
  'DAMAGED',
  'LOST',
  'RETURNED',
  'CANCELLED'
);

-- AlterTable
ALTER TABLE "Booking"
ADD COLUMN     "trackingStatus" "BookingTrackingStatus" NOT NULL DEFAULT 'BOOKED',
ADD COLUMN     "trackingUpdatedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "BookingTrackingEvent" (
  "id" TEXT NOT NULL,
  "bookingId" TEXT NOT NULL,
  "status" "BookingTrackingStatus" NOT NULL,
  "note" TEXT,
  "location" TEXT,
  "evidence" JSONB,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "BookingTrackingEvent_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "BookingTrackingEvent" ADD CONSTRAINT "BookingTrackingEvent_bookingId_fkey"
FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "BookingTrackingEvent_bookingId_createdAt_idx" ON "BookingTrackingEvent"("bookingId", "createdAt");

