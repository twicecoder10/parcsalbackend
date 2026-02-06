-- AlterTable
ALTER TABLE "ShipmentSlot" ADD COLUMN     "bookingNotes" TEXT,
ADD COLUMN     "allowsPickupFromSender" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "allowsDropOffAtCompany" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "allowsDeliveredToReceiver" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "allowsReceiverPicksUp" BOOLEAN NOT NULL DEFAULT true;
