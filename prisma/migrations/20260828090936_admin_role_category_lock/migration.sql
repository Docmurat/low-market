-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "categoryLocked" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "role" TEXT NOT NULL DEFAULT 'customer';
