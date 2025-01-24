/*
  Warnings:

  - The `metadata` column on the `Ticket` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "Ticket" DROP COLUMN "metadata",
ADD COLUMN     "metadata" JSONB DEFAULT '{}';
