-- DropForeignKey
ALTER TABLE "Booking" DROP CONSTRAINT "Booking_companyId_fkey";

-- DropForeignKey
ALTER TABLE "Booking" DROP CONSTRAINT "Booking_customerId_fkey";

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "companyName" TEXT,
ALTER COLUMN "companyId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
