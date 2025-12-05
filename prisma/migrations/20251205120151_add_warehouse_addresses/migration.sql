-- CreateTable
CREATE TABLE "WarehouseAddress" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT,
    "country" TEXT NOT NULL,
    "postalCode" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WarehouseAddress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WarehouseAddress_companyId_idx" ON "WarehouseAddress"("companyId");

-- CreateIndex
CREATE INDEX "WarehouseAddress_companyId_isDefault_idx" ON "WarehouseAddress"("companyId", "isDefault");

-- AddForeignKey
ALTER TABLE "WarehouseAddress" ADD CONSTRAINT "WarehouseAddress_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
