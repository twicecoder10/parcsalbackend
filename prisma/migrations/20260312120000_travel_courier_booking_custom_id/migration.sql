-- AlterTable: Remove default cuid() from TravelCourierBooking.id
-- The application now provides a custom ID (TCB-YYYY-XXXXXXX) at creation time.
ALTER TABLE "TravelCourierBooking" ALTER COLUMN "id" DROP DEFAULT;
