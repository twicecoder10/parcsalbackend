-- CreateEnum
CREATE TYPE "ParcelType" AS ENUM ('DOCUMENT', 'PACKAGE', 'FRAGILE', 'ELECTRONICS', 'CLOTHING', 'FOOD', 'MEDICINE', 'OTHER');

-- CreateEnum
CREATE TYPE "PickupMethod" AS ENUM ('PICKUP_FROM_SENDER', 'DROP_OFF_AT_COMPANY');

-- CreateEnum
CREATE TYPE "DeliveryMethod" AS ENUM ('RECEIVER_PICKS_UP', 'DELIVERED_TO_RECEIVER');

-- AlterTable: Add columns as nullable first
ALTER TABLE "Booking" ADD COLUMN     "deliveryMethod" "DeliveryMethod",
ADD COLUMN     "description" TEXT,
ADD COLUMN     "height" DOUBLE PRECISION,
ADD COLUMN     "images" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "length" DOUBLE PRECISION,
ADD COLUMN     "parcelType" "ParcelType",
ADD COLUMN     "pickupMethod" "PickupMethod",
ADD COLUMN     "value" DECIMAL(10,2),
ADD COLUMN     "weight" DOUBLE PRECISION,
ADD COLUMN     "width" DOUBLE PRECISION;

-- Set default values for existing records
UPDATE "Booking" SET "pickupMethod" = 'PICKUP_FROM_SENDER' WHERE "pickupMethod" IS NULL;
UPDATE "Booking" SET "deliveryMethod" = 'DELIVERED_TO_RECEIVER' WHERE "deliveryMethod" IS NULL;

-- Make columns NOT NULL after setting defaults
ALTER TABLE "Booking" ALTER COLUMN "pickupMethod" SET NOT NULL;
ALTER TABLE "Booking" ALTER COLUMN "deliveryMethod" SET NOT NULL;
