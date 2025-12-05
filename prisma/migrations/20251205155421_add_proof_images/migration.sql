-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "deliveryProofImages" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "pickupProofImages" TEXT[] DEFAULT ARRAY[]::TEXT[];
