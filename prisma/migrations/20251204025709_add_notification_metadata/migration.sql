-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "metadata" JSONB DEFAULT '{}';

-- CreateIndex
CREATE INDEX "Notification_userId_type_idx" ON "Notification"("userId", "type");

-- CreateIndex
CREATE INDEX "Notification_type_idx" ON "Notification"("type");
