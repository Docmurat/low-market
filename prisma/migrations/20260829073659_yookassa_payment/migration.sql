-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "paidAt" TIMESTAMP(3),
ADD COLUMN     "paymentId" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "paymentStatus" TEXT NOT NULL DEFAULT '';

-- CreateIndex
CREATE INDEX "Order_paymentId_idx" ON "Order"("paymentId");
