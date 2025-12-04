-- CreateEnum
CREATE TYPE "SlotTrackingStatus" AS ENUM ('PENDING', 'IN_TRANSIT', 'ARRIVED_AT_DESTINATION', 'DELAYED', 'DELIVERED');

-- AlterTable
ALTER TABLE "ShipmentSlot" ADD COLUMN     "trackingStatus" "SlotTrackingStatus" NOT NULL DEFAULT 'PENDING';
