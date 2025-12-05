-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "deliveryAddress" TEXT,
ADD COLUMN     "deliveryCity" TEXT,
ADD COLUMN     "deliveryContactName" TEXT,
ADD COLUMN     "deliveryContactPhone" TEXT,
ADD COLUMN     "deliveryCountry" TEXT,
ADD COLUMN     "deliveryPostalCode" TEXT,
ADD COLUMN     "deliveryState" TEXT,
ADD COLUMN     "deliveryWarehouseId" TEXT,
ADD COLUMN     "pickupAddress" TEXT,
ADD COLUMN     "pickupCity" TEXT,
ADD COLUMN     "pickupContactName" TEXT,
ADD COLUMN     "pickupContactPhone" TEXT,
ADD COLUMN     "pickupCountry" TEXT,
ADD COLUMN     "pickupPostalCode" TEXT,
ADD COLUMN     "pickupState" TEXT,
ADD COLUMN     "pickupWarehouseId" TEXT;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_pickupWarehouseId_fkey" FOREIGN KEY ("pickupWarehouseId") REFERENCES "WarehouseAddress"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_deliveryWarehouseId_fkey" FOREIGN KEY ("deliveryWarehouseId") REFERENCES "WarehouseAddress"("id") ON DELETE SET NULL ON UPDATE CASCADE;
