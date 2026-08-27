/*
  Warnings:

  - A unique constraint covering the columns `[supplierId]` on the table `Category` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "level" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "productCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "supplierCode" TEXT,
ADD COLUMN     "supplierId" INTEGER,
ADD COLUMN     "supplierPath" TEXT;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "eanCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "gism" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isEol" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isNew" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "manufacturerCode" TEXT,
ADD COLUMN     "rrp" DECIMAL(12,2),
ADD COLUMN     "specsSyncedAt" TIMESTAMP(3),
ADD COLUMN     "stockLabel" TEXT,
ADD COLUMN     "stocks" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "supplierCategoryCode" TEXT,
ADD COLUMN     "supplierUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "syncedAt" TIMESTAMP(3),
ADD COLUMN     "traceability" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "vendorCode" TEXT,
ADD COLUMN     "warrantyMonths" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "Category_supplierId_key" ON "Category"("supplierId");

-- CreateIndex
CREATE INDEX "Category_supplierPath_idx" ON "Category"("supplierPath");

-- CreateIndex
CREATE INDEX "Product_brand_idx" ON "Product"("brand");

-- CreateIndex
CREATE INDEX "Product_specsSyncedAt_idx" ON "Product"("specsSyncedAt");
