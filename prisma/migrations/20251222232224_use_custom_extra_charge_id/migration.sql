-- AlterTable
-- Remove default cuid() from BookingExtraCharge.id to allow custom IDs
ALTER TABLE "BookingExtraCharge" ALTER COLUMN "id" DROP DEFAULT;

