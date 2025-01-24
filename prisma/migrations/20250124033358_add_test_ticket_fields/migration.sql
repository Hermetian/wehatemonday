-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN     "cleanupAt" TIMESTAMP(3),
ADD COLUMN     "metadata" JSONB,
ADD COLUMN     "testBatchId" TEXT;

-- CreateIndex
CREATE INDEX "Ticket_testBatchId_idx" ON "Ticket"("testBatchId");
