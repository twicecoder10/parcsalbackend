-- CreateEnum
CREATE TYPE "ContactStatus" AS ENUM ('NEW', 'READ', 'RESOLVED');

-- AlterTable
ALTER TABLE "Contact" ADD COLUMN     "status" "ContactStatus" NOT NULL DEFAULT 'NEW';

-- CreateIndex
CREATE INDEX "Contact_status_idx" ON "Contact"("status");

