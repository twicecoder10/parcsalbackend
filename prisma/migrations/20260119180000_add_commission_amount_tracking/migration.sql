-- AlterTable: Add commissionAmount to Booking
ALTER TABLE "Booking" ADD COLUMN "commissionAmount" INTEGER;

-- AlterTable: Add commissionAmount to Payment
ALTER TABLE "Payment" ADD COLUMN "commissionAmount" INTEGER;

