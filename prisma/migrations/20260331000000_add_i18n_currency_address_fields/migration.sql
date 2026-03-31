-- AlterTable: ShipmentSlot - add currency and minor-unit pricing
ALTER TABLE "ShipmentSlot" ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'GBP';
ALTER TABLE "ShipmentSlot" ADD COLUMN "pricePerKgMinor" INTEGER;
ALTER TABLE "ShipmentSlot" ADD COLUMN "pricePerItemMinor" INTEGER;
ALTER TABLE "ShipmentSlot" ADD COLUMN "flatPriceMinor" INTEGER;

-- AlterTable: Booking - add currency
ALTER TABLE "Booking" ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'GBP';

-- AlterTable: TravelCourierBooking - add currency
ALTER TABLE "TravelCourierBooking" ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'GBP';

-- AlterTable: BookingExtraCharge - add currency
ALTER TABLE "BookingExtraCharge" ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'GBP';

-- AlterTable: WarehouseAddress - add flexible address fields
ALTER TABLE "WarehouseAddress" ADD COLUMN "countryCode" TEXT;
ALTER TABLE "WarehouseAddress" ADD COLUMN "addressLine1" TEXT;
ALTER TABLE "WarehouseAddress" ADD COLUMN "addressLine2" TEXT;
ALTER TABLE "WarehouseAddress" ADD COLUMN "stateOrProvince" TEXT;
ALTER TABLE "WarehouseAddress" ADD COLUMN "latitude" DOUBLE PRECISION;
ALTER TABLE "WarehouseAddress" ADD COLUMN "longitude" DOUBLE PRECISION;

-- Backfill: copy existing country → countryCode, address → addressLine1, state → stateOrProvince
UPDATE "WarehouseAddress" SET "countryCode" = "country" WHERE "countryCode" IS NULL;
UPDATE "WarehouseAddress" SET "addressLine1" = "address" WHERE "addressLine1" IS NULL;
UPDATE "WarehouseAddress" SET "stateOrProvince" = "state" WHERE "stateOrProvince" IS NULL AND "state" IS NOT NULL;
