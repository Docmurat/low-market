-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "imagesLocked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "photoReviewStatus" TEXT NOT NULL DEFAULT 'none';
