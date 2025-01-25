-- DropForeignKey
ALTER TABLE "Ticket" DROP CONSTRAINT "Ticket_lastUpdatedById_fkey";

-- AlterTable
ALTER TABLE "Ticket" ALTER COLUMN "lastUpdatedById" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_lastUpdatedById_fkey" FOREIGN KEY ("lastUpdatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
