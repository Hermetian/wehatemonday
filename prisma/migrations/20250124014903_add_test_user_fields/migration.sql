-- AlterTable
ALTER TABLE "User" ADD COLUMN     "cleanupAt" TIMESTAMP(3),
ADD COLUMN     "metadata" JSONB,
ADD COLUMN     "testBatchId" TEXT;
