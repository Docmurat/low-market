-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "supplierOrderNumber" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "supplierOrderedAt" TIMESTAMP(3);
