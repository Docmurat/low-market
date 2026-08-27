-- CreateTable
CREATE TABLE "ProductAttribute" (
    "id" SERIAL NOT NULL,
    "productId" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "numValue" DOUBLE PRECISION,

    CONSTRAINT "ProductAttribute_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductAttribute_key_value_idx" ON "ProductAttribute"("key", "value");

-- CreateIndex
CREATE INDEX "ProductAttribute_key_numValue_idx" ON "ProductAttribute"("key", "numValue");

-- CreateIndex
CREATE UNIQUE INDEX "ProductAttribute_productId_key_value_key" ON "ProductAttribute"("productId", "key", "value");

-- AddForeignKey
ALTER TABLE "ProductAttribute" ADD CONSTRAINT "ProductAttribute_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
